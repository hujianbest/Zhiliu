import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type {
  AtomicNote,
  BudgetSettings,
  ChatTurn,
  InboxItem,
  ManuscriptSpan,
  ManuscriptView,
  ParallelRevision,
  ProposalView,
  StyleProfileView,
  StyleProposalView,
  TopicView,
  WorkbenchView,
} from '../shared/api';
import { BUILTIN_PROMPT_VERSION, type AgentRuntime, type GenerationTrace } from './agent';
import type { Library } from './library';
import type { SearchIndex } from './search';
import type { Vault } from './vault';

const DEFAULT_PROMPT = '请根据这些摘录做一次分析，不要编造库外事实。';
const DISCOVERY_COPY = '书库中反复出现这个模式。它来自来源文档，还不是你自己的主张。';

type State = {
  budgets: BudgetSettings;
  usage: WorkbenchView['usage'];
  usageDay: string;
  usageMonth: string;
  privacy: { telemetry: boolean; crashReports: boolean };
  promptOverride: string | null;
  triggers: { enabled: boolean; onNewNotes: boolean; lastRun: string | null; status: string };
  topics: TopicView[];
  inbox: InboxItem[];
  chats: ChatTurn[];
  proposals: ProposalView[];
  revisions: ParallelRevision[];
  style: StyleProfileView;
  styleProposals: StyleProposalView[];
};

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function emptyState(): State {
  return {
    budgets: {
      dailyTokens: 100_000,
      monthlyTokens: 1_000_000,
      dailyRequests: 200,
      monthlyRequests: 2_000,
      sharedHardCap: false,
    },
    usage: {
      interactive: { tokens: 0, requests: 0, estimated: true },
      background: { tokens: 0, requests: 0, estimated: true },
      paused: false,
    },
    usageDay: dayKey(),
    usageMonth: monthKey(),
    privacy: { telemetry: false, crashReports: false },
    promptOverride: null,
    triggers: { enabled: false, onNewNotes: false, lastRun: null, status: '已关闭' },
    topics: [],
    inbox: [],
    chats: [],
    proposals: [],
    revisions: [],
    style: { text: '', version: 1, history: [{ version: 1, text: '' }] },
    styleProposals: [],
  };
}

export class Workbench {
  constructor(
    private readonly vault: Vault,
    private readonly search: SearchIndex,
    private readonly agent: AgentRuntime,
    private readonly library: Library,
  ) {}

  async view(): Promise<WorkbenchView> {
    const state = await this.read();
    this.rollUsageWindow(state);
    return {
      budgets: state.budgets,
      usage: state.usage,
      privacy: state.privacy,
      prompt: {
        text: state.promptOverride ?? DEFAULT_PROMPT,
        version: state.promptOverride ? 'override-v1' : BUILTIN_PROMPT_VERSION,
        overridden: Boolean(state.promptOverride),
      },
      triggers: state.triggers,
      topics: await this.refreshOrigins(state),
      inbox: state.inbox,
      chats: state.chats,
      manuscripts: await this.listManuscripts(),
      proposals: state.proposals.map((item) => this.withReady(item)),
      revisions: state.revisions,
      style: state.style,
      styleProposals: state.styleProposals,
    };
  }

  promptVersion(state?: State): string {
    const current = state ?? emptyState();
    return current.promptOverride ? 'override-v1' : BUILTIN_PROMPT_VERSION;
  }

  async allow(channel: 'interactive' | 'background'): Promise<boolean> {
    const state = await this.read();
    this.rollUsageWindow(state);
    if (channel === 'interactive') {
      return !(state.usage.paused && state.budgets.sharedHardCap);
    }
    return !state.usage.paused;
  }

  async record(trace: GenerationTrace): Promise<void> {
    const state = await this.read();
    this.rollUsageWindow(state);
    const bucket = state.usage[trace.channel];
    bucket.tokens += trace.usage.promptTokens + trace.usage.completionTokens;
    bucket.requests += 1;
    bucket.estimated = trace.usage.estimated;
    this.recomputePause(state);
    await this.write(state);
  }

  async saveBudgets(input: BudgetSettings): Promise<WorkbenchView> {
    const state = await this.read();
    state.budgets = input;
    this.recomputePause(state);
    await this.write(state);
    return this.view();
  }

  async savePrivacy(input: { telemetry: boolean; crashReports: boolean }): Promise<WorkbenchView> {
    const state = await this.read();
    state.privacy = input;
    await this.write(state);
    return this.view();
  }

  async savePrompt(text: string): Promise<WorkbenchView> {
    const state = await this.read();
    state.promptOverride = text;
    await this.write(state);
    return this.view();
  }

  async resetPrompt(): Promise<WorkbenchView> {
    const state = await this.read();
    state.promptOverride = null;
    await this.write(state);
    return this.view();
  }

  async saveTriggers(input: { enabled: boolean; onNewNotes: boolean }): Promise<WorkbenchView> {
    const state = await this.read();
    state.triggers.enabled = input.enabled;
    state.triggers.onNewNotes = input.onNewNotes;
    state.triggers.status = input.enabled ? '等待触发' : '已关闭';
    await this.write(state);
    return this.view();
  }

  captureCrash(payload: Record<string, unknown>): { outbound: Record<string, unknown> | null } {
    return { outbound: null };
  }

  async crashReport(payload: Record<string, unknown>): Promise<{ outbound: Record<string, unknown> | null }> {
    const state = await this.read();
    if (!state.privacy.crashReports) {
      return { outbound: null };
    }
    const outbound = {
      kind: 'crash',
      message: typeof payload.message === 'string' ? payload.message.replace(/\/[^\s]+/g, '[path]') : 'crash',
    };
    return { outbound };
  }

  async cluster(): Promise<TopicView[]> {
    const state = await this.read();
    const notes = await this.vault.listNotes();
    const pinned = new Set(state.topics.filter((topic) => topic.pinned).map((topic) => topic.id));
    const kept = state.topics.filter((topic) => topic.pinned);
    const groups = new Map<string, AtomicNote[]>();
    for (const note of notes) {
      const key = clusterKey(note);
      const group = groups.get(key) ?? [];
      group.push(note);
      groups.set(key, group);
    }
    for (const [title, group] of groups) {
      if (group.length === 0) {
        continue;
      }
      const existing = kept.find((topic) => topic.title === title);
      if (existing) {
        existing.noteIds = [...new Set([...existing.noteIds, ...group.map((note) => note.id)])];
        existing.sourceIds = [...new Set(group.map((note) => note.sourceId).filter((id): id is string => Boolean(id)))];
        continue;
      }
      if ([...pinned].length >= 0) {
        kept.push({
          id: randomUUID(),
          title,
          origin: 'library-discovery',
          noteIds: group.map((note) => note.id),
          sourceIds: [...new Set(group.map((note) => note.sourceId).filter((id): id is string => Boolean(id)))],
          pinned: false,
          hidden: false,
        });
      }
    }
    state.topics = kept;
    await this.refreshOrigins(state);
    this.syncInbox(state);
    await this.write(state);
    return state.topics;
  }

  async renameTopic(id: string, title: string): Promise<TopicView> {
    const state = await this.read();
    const topic = this.requireTopic(state, id);
    topic.title = title;
    await this.write(state);
    return topic;
  }

  async pinTopic(id: string, pinned: boolean): Promise<TopicView> {
    const state = await this.read();
    const topic = this.requireTopic(state, id);
    topic.pinned = pinned;
    await this.write(state);
    return topic;
  }

  async hideTopic(id: string, hidden: boolean): Promise<TopicView> {
    const state = await this.read();
    const topic = this.requireTopic(state, id);
    topic.hidden = hidden;
    await this.write(state);
    return topic;
  }

  async mergeTopics(fromId: string, intoId: string): Promise<TopicView[]> {
    const state = await this.read();
    const from = this.requireTopic(state, fromId);
    const into = this.requireTopic(state, intoId);
    into.noteIds = [...new Set([...into.noteIds, ...from.noteIds])];
    into.sourceIds = [...new Set([...into.sourceIds, ...from.sourceIds])];
    state.topics = state.topics.filter((topic) => topic.id !== fromId);
    await this.refreshOrigins(state);
    await this.write(state);
    return state.topics;
  }

  async splitTopic(id: string, noteIds: string[]): Promise<TopicView[]> {
    const state = await this.read();
    const topic = this.requireTopic(state, id);
    topic.noteIds = topic.noteIds.filter((noteId) => !noteIds.includes(noteId));
    state.topics.push({
      id: randomUUID(),
      title: `${topic.title}（拆分）`,
      origin: 'library-discovery',
      noteIds,
      sourceIds: topic.sourceIds.slice(),
      pinned: false,
      hidden: false,
    });
    await this.refreshOrigins(state);
    await this.write(state);
    return state.topics;
  }

  async chat(question: string): Promise<ChatTurn> {
    const hits = await this.search.queryDetailed(question, { mode: 'mix' });
    const grounded = hits.hits.slice(0, 3);
    const paragraphs = [
      ...grounded.map((hit) => ({
        text: hit.snippet,
        provenance: 'source' as const,
        sourceId: hit.sourceId || undefined,
        noteId: hit.noteId,
        sourcePosition: hit.sourcePosition,
      })),
      {
        text: `模型补充：结合库外常识，${question}还可以从对照阅读里继续想。`,
        provenance: 'ai' as const,
      },
    ];
    const turn: ChatTurn = {
      id: randomUUID(),
      question,
      paragraphs,
      partialIndex: grounded.some((hit) => hit.partialIndex) || hits.degraded !== null,
      at: new Date().toISOString(),
    };
    const state = await this.read();
    state.chats.push(turn);
    await this.write(state);
    return turn;
  }

  async promoteChat(turnId: string, paragraphIndex: number, thought: string): Promise<AtomicNote> {
    const state = await this.read();
    const turn = state.chats.find((item) => item.id === turnId);
    if (!turn) {
      throw new Error('找不到这段对话');
    }
    const paragraph = turn.paragraphs[paragraphIndex];
    if (!paragraph) {
      throw new Error('找不到这段回答');
    }
    return this.vault.saveNote({
      quotation: paragraph.text,
      thought,
      sourceId: paragraph.sourceId,
      sourcePosition: paragraph.sourcePosition,
    });
  }

  async revise(noteId: string): Promise<ParallelRevision> {
    const note = await this.vault.getNote(noteId);
    if (!note) {
      throw new Error('找不到这条笔记');
    }
    const revision: ParallelRevision = {
      id: randomUUID(),
      noteId,
      path: note.path.replace(/\.md$/, '.revision.md'),
      text: `${note.thought}（AI 并列修订）`,
      provenance: 'ai',
    };
    await writeFile(
      revision.path,
      `---
id: ${revision.id}
note_id: ${noteId}
kind: revision
provenance: ai
---
${revision.text}
`,
      'utf8',
    );
    const state = await this.read();
    state.revisions.push(revision);
    await this.write(state);
    return revision;
  }

  async acceptRevision(id: string): Promise<void> {
    const state = await this.read();
    const revision = state.revisions.find((item) => item.id === id);
    if (!revision) {
      return;
    }
    const note = await this.vault.getNote(revision.noteId);
    if (note) {
      await this.vault.saveNote({
        id: note.id,
        quotation: note.quotation,
        thought: `${note.thought}\n\n已采纳的 AI 修订：${revision.text}`,
        baseQuotation: note.quotation,
        baseThought: note.thought,
      });
    }
    await unlink(revision.path).catch(() => undefined);
    state.revisions = state.revisions.filter((item) => item.id !== id);
    await this.write(state);
  }

  async rejectRevision(id: string): Promise<void> {
    const state = await this.read();
    const revision = state.revisions.find((item) => item.id === id);
    if (revision) {
      await unlink(revision.path).catch(() => undefined);
    }
    state.revisions = state.revisions.filter((item) => item.id !== id);
    await this.write(state);
  }

  async createProposal(topicId: string): Promise<ProposalView> {
    const state = await this.read();
    const topic = this.requireTopic(state, topicId);
    const notes = await this.vault.listNotes();
    const broken = new Set((await this.vault.listBroken()).map((item) => item.path));
    const thoughtNotes = notes.filter((note) => topic.noteIds.includes(note.id) && note.kind === 'thought_note' && !broken.has(note.path));
    const proposal: ProposalView = {
      id: randomUUID(),
      topicId,
      thesis: `${topic.title}值得写成一篇。`,
      thesisFromAi: true,
      thesisConfirmed: false,
      confirmations: [],
      evidence: [
        ...thoughtNotes.map((note) => ({
          id: note.id,
          kind: 'thought' as const,
          text: note.thought,
          noteId: note.id,
          confirmed: false,
          included: true,
        })),
        { id: randomUUID(), kind: 'gap', text: '还缺少反例。', confirmed: false, included: false },
      ],
      ready: false,
    };
    state.proposals.push(proposal);
    await this.write(state);
    return this.withReady(proposal);
  }

  async confirmEvidence(proposalId: string, evidenceId: string): Promise<ProposalView> {
    const state = await this.read();
    const proposal = this.requireProposal(state, proposalId);
    const item = proposal.evidence.find((entry) => entry.id === evidenceId);
    if (!item) {
      throw new Error('找不到这条证据');
    }
    item.confirmed = true;
    proposal.confirmations.push(`${evidenceId}:${Date.now()}`);
    await this.write(state);
    return this.withReady(proposal);
  }

  async setThesis(proposalId: string, thesis: string): Promise<ProposalView> {
    const state = await this.read();
    const proposal = this.requireProposal(state, proposalId);
    proposal.thesis = thesis;
    proposal.thesisConfirmed = true;
    proposal.confirmations.push(`thesis:${Date.now()}`);
    await this.write(state);
    return this.withReady(proposal);
  }

  async includeEvidence(proposalId: string, evidenceId: string, included: boolean): Promise<ProposalView> {
    const state = await this.read();
    const proposal = this.requireProposal(state, proposalId);
    const item = proposal.evidence.find((entry) => entry.id === evidenceId);
    if (item) {
      item.included = included;
    }
    await this.write(state);
    return this.withReady(proposal);
  }

  async createManuscript(input: {
    kind: 'trial' | 'formal';
    title: string;
    body: string;
    topicId?: string;
    proposalId?: string;
    trialId?: string;
    spans?: ManuscriptSpan[];
  }): Promise<ManuscriptView> {
    if (input.kind === 'trial') {
      return this.writeManuscript({ ...input, status: 'draft', spans: input.spans ?? [{ text: input.body, provenance: 'ai' }] });
    }
    return this.writeManuscript({
      ...input,
      status: 'draft',
      spans: input.spans ?? [{ text: input.body, provenance: 'user' }],
    });
  }

  async saveManuscript(input: { id: string; title: string; body: string; spans?: ManuscriptSpan[] }): Promise<ManuscriptView> {
    const current = await this.getManuscript(input.id);
    if (!current) {
      throw new Error('找不到这份稿件');
    }
    return this.writeManuscript({
      ...current,
      title: input.title,
      body: input.body,
      spans: input.spans ?? current.spans,
    });
  }

  async finalize(id: string): Promise<ManuscriptView> {
    const current = await this.getManuscript(id);
    if (!current || current.kind !== 'formal') {
      throw new Error('只有正式稿可以定稿');
    }
    return this.writeManuscript({ ...current, status: 'final' });
  }

  async unfinalize(id: string): Promise<ManuscriptView> {
    const current = await this.getManuscript(id);
    if (!current) {
      throw new Error('找不到这份稿件');
    }
    return this.writeManuscript({ ...current, status: 'draft' });
  }

  async generateFormal(proposalId: string): Promise<ManuscriptView> {
    const state = await this.read();
    const proposal = this.withReady(this.requireProposal(state, proposalId));
    if (!proposal.ready) {
      throw new Error('尚未写作就绪');
    }
    const included = proposal.evidence.filter((item) => item.included && item.confirmed && item.kind === 'thought');
    const spans: ManuscriptSpan[] = included.map((item) => ({
      text: item.text,
      provenance: 'user',
      noteId: item.noteId,
    }));
    spans.push({ text: proposal.thesis, provenance: 'user' });
    const body = spans.map((span) => span.text).join('\n\n');
    return this.writeManuscript({
      kind: 'formal',
      status: 'draft',
      title: proposal.thesis,
      body,
      topicId: proposal.topicId,
      proposalId: proposal.id,
      spans,
    });
  }

  async promoteTrial(id: string): Promise<ProposalView> {
    const trial = await this.getManuscript(id);
    if (!trial || trial.kind !== 'trial') {
      throw new Error('只能从试写稿预填提案');
    }
    const proposal = await this.createProposal(trial.topicId ?? (await this.ensureTopicForTrial(trial)));
    proposal.thesis = trial.title || trial.body.slice(0, 40);
    const state = await this.read();
    const stored = this.requireProposal(state, proposal.id);
    stored.thesis = proposal.thesis;
    stored.thesisFromAi = true;
    await this.write(state);
    return this.withReady(stored);
  }

  async exportManuscript(id: string, options?: { footnotes?: boolean }): Promise<{ markdown: string; text: string; html: string }> {
    const draft = await this.getManuscript(id);
    if (!draft) {
      throw new Error('找不到这份稿件');
    }
    const footnotesOn = options?.footnotes !== false;
    const sources = [...new Set(draft.spans.map((span) => span.sourceId).filter((item): item is string => Boolean(item)))];
    let markdown = draft.body;
    if (footnotesOn && sources.length > 0) {
      markdown += `\n\n## 来源\n${sources.map((sourceId, index) => `${index + 1}. ${sourceId}`).join('\n')}\n`;
    }
    return { markdown, text: markdown, html: `<p>${markdown.replaceAll('\n', '</p><p>')}</p>` };
  }

  async saveStyle(text: string): Promise<StyleProfileView> {
    const state = await this.read();
    state.style.version += 1;
    state.style.text = text;
    state.style.history.push({ version: state.style.version, text });
    await this.write(state);
    return state.style;
  }

  async resetStyle(): Promise<StyleProfileView> {
    return this.saveStyle('');
  }

  async rollbackStyle(): Promise<StyleProfileView> {
    const state = await this.read();
    if (state.style.history.length < 2) {
      return state.style;
    }
    state.style.history.pop();
    const previous = state.style.history.at(-1)!;
    state.style.version = previous.version;
    state.style.text = previous.text;
    await this.write(state);
    return state.style;
  }

  async learnStyle(manuscriptId: string): Promise<StyleProposalView | null> {
    const draft = await this.getManuscript(manuscriptId);
    if (!draft || draft.kind !== 'formal' || draft.status !== 'final') {
      return null;
    }
    const proposal: StyleProposalView = {
      id: randomUUID(),
      text: `更贴近这篇定稿的句子节奏：${draft.body.slice(0, 80)}`,
      evidence: draft.id,
      manuscriptId,
    };
    const state = await this.read();
    state.styleProposals.push(proposal);
    await this.write(state);
    return proposal;
  }

  async confirmStyleProposal(id: string): Promise<StyleProfileView> {
    const state = await this.read();
    const proposal = state.styleProposals.find((item) => item.id === id);
    if (!proposal) {
      throw new Error('找不到风格更新提案');
    }
    const draft = await this.getManuscript(proposal.manuscriptId);
    if (!draft) {
      state.styleProposals = state.styleProposals.filter((item) => item.id !== id);
      await this.write(state);
      throw new Error('证据已失效');
    }
    state.styleProposals = state.styleProposals.filter((item) => item.id !== id);
    await this.write(state);
    return this.saveStyle(`${state.style.text}\n${proposal.text}`.trim());
  }

  async inboxAct(id: string, action: 'accept' | 'ignore'): Promise<InboxItem[]> {
    const state = await this.read();
    const item = state.inbox.find((entry) => entry.id === id);
    if (item) {
      item.state = action === 'accept' ? 'accepted' : 'ignored';
    }
    await this.write(state);
    return state.inbox;
  }

  async runBackground(): Promise<{ status: string }> {
    const allowed = await this.allow('background');
    const state = await this.read();
    if (!allowed) {
      state.triggers.status = '后台已暂停';
      await this.write(state);
      return { status: '后台已暂停' };
    }
    if (!state.triggers.enabled) {
      return { status: '已关闭' };
    }
    try {
      const view = await this.view();
      const outcome = await this.agent.analyze('background', view.prompt.version);
      await this.record(outcome.trace);
    } catch {
      const latest = await this.read();
      latest.triggers.status = '模型不可用，已暂停';
      await this.write(latest);
      return { status: '模型不可用，已暂停' };
    }
    await this.cluster();
    const after = await this.read();
    after.triggers.lastRun = new Date().toISOString();
    after.triggers.status = after.usage.paused ? '后台已暂停' : '最近一次已完成';
    await this.write(after);
    return { status: after.triggers.status };
  }

  async listRevisions(): Promise<ParallelRevision[]> {
    return (await this.read()).revisions;
  }

  async retrievableManuscripts(): Promise<ManuscriptView[]> {
    return (await this.listManuscripts()).filter((item) => item.kind === 'formal' && item.status === 'final');
  }

  async listManuscripts(): Promise<ManuscriptView[]> {
    const root = this.vault.path;
    if (!root) {
      return [];
    }
    const dir = path.join(root, 'drafts');
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith('.md'));
    } catch {
      return [];
    }
    const out: ManuscriptView[] = [];
    for (const name of names) {
      const filePath = path.join(dir, name);
      out.push(parseManuscript(await readFile(filePath, 'utf8'), filePath));
    }
    for (const draft of out) {
      draft.staleRefs = await this.staleRefs(draft);
    }
    return out;
  }

  private async staleRefs(draft: ManuscriptView): Promise<string[]> {
    const broken = await this.vault.listBroken();
    const brokenIds = new Set(broken.map((item) => item.id).filter(Boolean));
    const stale: string[] = [];
    for (const span of draft.spans) {
      if (!span.noteId) {
        continue;
      }
      const note = await this.vault.getNote(span.noteId);
      if (!note || brokenIds.has(span.noteId)) {
        stale.push(span.noteId);
      }
    }
    return stale;
  }

  private async writeManuscript(input: {
    id?: string;
    kind: 'trial' | 'formal';
    status: 'draft' | 'final';
    title: string;
    body: string;
    topicId?: string;
    proposalId?: string;
    trialId?: string;
    spans: ManuscriptSpan[];
  }): Promise<ManuscriptView> {
    const root = this.vault.path;
    if (!root) {
      throw new Error('还没有打开知识库');
    }
    if (input.kind === 'trial' && input.status === 'final') {
      throw new Error('试写稿不能定稿');
    }
    const id = input.id ?? randomUUID();
    const filePath = path.join(root, 'drafts', `${id}.md`);
    await mkdir(path.dirname(filePath), { recursive: true });
    const view: ManuscriptView = {
      id,
      title: input.title,
      kind: input.kind,
      status: input.status,
      body: input.body,
      path: filePath,
      topicId: input.topicId,
      proposalId: input.proposalId,
      trialId: input.trialId,
      spans: input.spans,
      staleRefs: [],
    };
    const data = {
      id,
      kind: input.kind,
      status: input.status,
      title: input.title,
      topic_id: input.topicId ?? null,
      proposal_id: input.proposalId ?? null,
      trial_id: input.trialId ?? null,
      spans: input.spans,
    };
    await writeFile(filePath, matter.stringify(input.body, data), 'utf8');
    view.staleRefs = await this.staleRefs(view);
    return view;
  }

  private async getManuscript(id: string): Promise<ManuscriptView | null> {
    return (await this.listManuscripts()).find((item) => item.id === id) ?? null;
  }

  private async ensureTopicForTrial(trial: ManuscriptView): Promise<string> {
    const state = await this.read();
    const created: TopicView = {
      id: randomUUID(),
      title: trial.title || '试写稿主题',
      origin: 'thought-signal',
      noteIds: [],
      sourceIds: [],
      pinned: false,
      hidden: false,
    };
    state.topics.push(created);
    await this.write(state);
    return created.id;
  }

  private withReady(proposal: ProposalView): ProposalView {
    const thoughts = proposal.evidence.filter((item) => item.kind === 'thought' && item.included);
    proposal.ready = proposal.thesisConfirmed && thoughts.length >= 3;
    return proposal;
  }

  private requireTopic(state: State, id: string): TopicView {
    const topic = state.topics.find((item) => item.id === id);
    if (!topic) {
      throw new Error('找不到这个主题');
    }
    return topic;
  }

  private requireProposal(state: State, id: string): ProposalView {
    const proposal = state.proposals.find((item) => item.id === id);
    if (!proposal) {
      throw new Error('找不到这份提案');
    }
    return proposal;
  }

  private async refreshOrigins(state: State): Promise<TopicView[]> {
    const notes = await this.vault.listNotes();
    const broken = await this.vault.listBroken();
    const brokenIds = new Set(broken.map((item) => item.id).filter((id): id is string => Boolean(id)));
    for (const topic of state.topics) {
      const thoughtCount = notes.filter(
        (note) => topic.noteIds.includes(note.id) && note.kind === 'thought_note' && !brokenIds.has(note.id),
      ).length;
      topic.origin = thoughtCount >= 3 ? 'thought-signal' : 'library-discovery';
    }
    this.syncInbox(state);
    return state.topics;
  }

  private syncInbox(state: State): void {
    for (const topic of state.topics) {
      if (topic.hidden) {
        continue;
      }
      let item = state.inbox.find((entry) => entry.topicId === topic.id);
      if (!item) {
        item = {
          id: randomUUID(),
          topicId: topic.id,
          origin: topic.origin,
          title: topic.title,
          copy: topic.origin === 'library-discovery' ? DISCOVERY_COPY : `你的思想线索：${topic.title}`,
          state: 'pending',
        };
        state.inbox.push(item);
      }
      item.origin = topic.origin;
      item.title = topic.title;
      item.copy = topic.origin === 'library-discovery' ? DISCOVERY_COPY : `你的思想线索：${topic.title}`;
    }
  }

  private recomputePause(state: State): void {
    const over =
      state.usage.background.tokens >= state.budgets.dailyTokens ||
      state.usage.background.requests >= state.budgets.dailyRequests;
    state.usage.paused = over;
  }

  private rollUsageWindow(state?: State): void {
    if (!state) {
      return;
    }
    if (state.usageDay !== dayKey()) {
      state.usage.background = { tokens: 0, requests: 0, estimated: true };
      state.usage.interactive = { tokens: 0, requests: 0, estimated: true };
      state.usage.paused = false;
      state.usageDay = dayKey();
    }
    if (state.usageMonth !== monthKey()) {
      state.usageMonth = monthKey();
    }
  }

  private file(): string {
    const root = this.vault.path;
    if (!root) {
      throw new Error('还没有打开知识库');
    }
    return path.join(root, '.zhiliu', 'workbench.json');
  }

  private async read(): Promise<State> {
    try {
      return { ...emptyState(), ...(JSON.parse(await readFile(this.file(), 'utf8')) as State) };
    } catch {
      return emptyState();
    }
  }

  private async write(state: State): Promise<void> {
    await mkdir(path.dirname(this.file()), { recursive: true });
    await writeFile(this.file(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}

function clusterKey(note: AtomicNote): string {
  const text = `${note.thought}${note.quotation}`;
  const run = text.match(/[\u3400-\u9fff]{2,4}/);
  return run?.[0] ?? note.thought.slice(0, 8) || '未命名主题';
}

function parseManuscript(raw: string, filePath: string): ManuscriptView {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  return {
    id: String(data.id),
    title: String(data.title ?? ''),
    kind: data.kind === 'trial' ? 'trial' : 'formal',
    status: data.status === 'final' ? 'final' : 'draft',
    body: parsed.content.trim(),
    path: filePath,
    topicId: data.topic_id ? String(data.topic_id) : undefined,
    proposalId: data.proposal_id ? String(data.proposal_id) : undefined,
    trialId: data.trial_id ? String(data.trial_id) : undefined,
    spans: Array.isArray(data.spans) ? (data.spans as ManuscriptSpan[]) : [{ text: parsed.content.trim(), provenance: 'user' }],
    staleRefs: [],
  };
}
