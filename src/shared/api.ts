export type NoteRelation = {
  type: string;
  id: string;
};

export type AtomicNote = {
  id: string;
  kind: 'excerpt' | 'thought_note';
  sourceId: string | null;
  sourcePosition: string | null;
  quotation: string;
  thought: string;
  created: string;
  updated: string;
  provenance: {
    quotation: 'source';
    thought: 'user';
  };
  relations: NoteRelation[];
  path: string;
};

export type SaveNoteInput = {
  id?: string;
  quotation: string;
  thought?: string;
  sourceId?: string;
  sourcePosition?: string;
  relations?: NoteRelation[];
  baseQuotation?: string;
  baseThought?: string;
};

export type VaultStatus = {
  firstRun: boolean;
  path: string | null;
};

export type ModelRole = 'fast' | 'deep';

export type ProbeResult = 'ok' | 'unauthorized' | 'unreachable';

export type ProbeOutcome = {
  result: ProbeResult;
};

export type ModelRoleView = {
  baseUrl: string;
  model: string;
  hasKey: boolean;
};

export type ModelSettingsView = {
  configured: boolean;
  fast: ModelRoleView;
  deep: ModelRoleView;
};

export type SaveModelRoleInput = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type SaveModelSettingsInput = {
  fast: SaveModelRoleInput;
  deep: SaveModelRoleInput;
};

export type IndexStatus = 'pending' | 'indexing' | 'ready' | 'error';

export type SourceKind = 'epub' | 'pdf' | 'web' | 'markdown';

export type ReadingStatus = 'unread' | 'reading' | 'read';

export type SourceDocument = {
  id: string;
  kind: SourceKind;
  title: string;
  authors: string[];
  indexStatus: IndexStatus;
  originalFilename: string;
  readingStatus: ReadingStatus;
  sourceUrl?: string | null;
  capturedAt?: string | null;
};

export type ImportFailure = {
  filename: string;
  message: string;
};

export type ImportResult = {
  sources: SourceDocument[];
  failures: ImportFailure[];
};

export type TurnDirection = 'prev' | 'next';

export type TocEntry = {
  label: string;
  spineIndex: number;
};

export type ReadingView = {
  sourceId: string;
  kind: SourceKind;
  title: string;
  chapterLabel: string;
  html: string;
  hasPrev: boolean;
  hasNext: boolean;
  toc: TocEntry[];
  status: ReadingStatus;
  spineIndex: number;
  hasTextLayer: boolean;
};

export type SearchKind = 'epub' | 'pdf' | 'note' | 'article' | 'draft';

export type ProvenanceValue = 'user' | 'source' | 'ai';

export type SearchHit = {
  kind: SearchKind;
  title: string;
  snippet: string;
  sourceId: string;
  noteId?: string;
  sourcePosition?: string;
  spineIndex?: number;
  partialIndex: boolean;
  provenance: ProvenanceValue;
};

export type SearchQueryResult = {
  hits: SearchHit[];
  degraded: null | 'missing-model' | 'onnx' | 'worker';
};

export type TimelineEntry = {
  id: string;
  summary: string;
  at: string;
};

export type SearchMode = 'keyword' | 'semantic' | 'mix';

export type SearchQueryOptions = {
  mode?: SearchMode;
};

export type EmbedCall = {
  id: string;
};

export type NoteConflict = {
  path: string;
  id: string;
  quotation: string;
  thought: string;
};

export type BrokenNote = {
  path: string;
  reason: 'missing-id' | 'duplicate-id' | 'invalid';
  id?: string;
};

export type MarkdownImportResult = {
  reportPath: string;
  copied: number;
  renamed: { from: string; to: string }[];
  unmapped: { file: string; fields: string[] }[];
};

export type GenerationTrace = {
  id: string;
  taskType: string;
  channel: 'interactive' | 'background';
  model: string;
  promptVersion: string;
  sourceIds: string[];
  timestamp: string;
  usage: { promptTokens: number; completionTokens: number; estimated: boolean };
  result: string;
};

export type BudgetSettings = {
  dailyTokens: number;
  monthlyTokens: number;
  dailyRequests: number;
  monthlyRequests: number;
  sharedHardCap: boolean;
};

export type UsageReport = {
  interactive: { tokens: number; requests: number; estimated: boolean };
  background: { tokens: number; requests: number; estimated: boolean };
  paused: boolean;
};

export type TopicOrigin = 'thought-signal' | 'library-discovery';

export type TopicView = {
  id: string;
  title: string;
  origin: TopicOrigin;
  noteIds: string[];
  sourceIds: string[];
  pinned: boolean;
  hidden: boolean;
};

export type ChatParagraph = {
  text: string;
  provenance: ProvenanceValue;
  sourceId?: string;
  noteId?: string;
  sourcePosition?: string;
};

export type ChatTurn = {
  id: string;
  question: string;
  paragraphs: ChatParagraph[];
  partialIndex: boolean;
  at: string;
};

export type ParallelRevision = {
  id: string;
  noteId: string;
  path: string;
  text: string;
  provenance: 'ai';
};

export type ManuscriptSpan = {
  text: string;
  provenance: ProvenanceValue;
  noteId?: string;
  sourceId?: string;
  sourcePosition?: string;
};

export type ManuscriptView = {
  id: string;
  title: string;
  kind: 'trial' | 'formal';
  status: 'draft' | 'final';
  body: string;
  path: string;
  topicId?: string;
  proposalId?: string;
  trialId?: string;
  spans: ManuscriptSpan[];
  staleRefs: string[];
};

export type ProposalEvidence = {
  id: string;
  kind: 'thought' | 'source' | 'ai' | 'gap';
  text: string;
  noteId?: string;
  confirmed: boolean;
  included: boolean;
};

export type ProposalView = {
  id: string;
  topicId: string;
  thesis: string;
  thesisFromAi: boolean;
  thesisConfirmed: boolean;
  confirmations: string[];
  evidence: ProposalEvidence[];
  ready: boolean;
};

export type InboxItem = {
  id: string;
  topicId: string;
  origin: TopicOrigin;
  title: string;
  copy: string;
  state: 'pending' | 'accepted' | 'ignored';
};

export type StyleProfileView = {
  text: string;
  version: number;
  history: { version: number; text: string }[];
};

export type StyleProposalView = {
  id: string;
  text: string;
  evidence: string;
  manuscriptId: string;
};

export type WorkbenchView = {
  budgets: BudgetSettings;
  usage: UsageReport;
  privacy: { telemetry: boolean; crashReports: boolean };
  prompt: { text: string; version: string; overridden: boolean };
  triggers: { enabled: boolean; onNewNotes: boolean; lastRun: string | null; status: string };
  topics: TopicView[];
  inbox: InboxItem[];
  chats: ChatTurn[];
  manuscripts: ManuscriptView[];
  proposals: ProposalView[];
  revisions: ParallelRevision[];
  style: StyleProfileView;
  styleProposals: StyleProposalView[];
};

export type ZhiliuApi = {
  vault: {
    current(): Promise<VaultStatus>;
    choose(): Promise<VaultStatus>;
    onChanged(listener: () => void): () => void;
  };
  notes: {
    save(input: SaveNoteInput): Promise<AtomicNote>;
    get(id: string): Promise<AtomicNote | null>;
    list(): Promise<AtomicNote[]>;
    listForSource(sourceId: string): Promise<AtomicNote[]>;
    broken(): Promise<BrokenNote[]>;
    repair(filePath: string, id: string): Promise<void>;
    conflicts(): Promise<NoteConflict[]>;
    resolveConflict(filePath: string, keep: 'disk' | 'incoming'): Promise<void>;
  };
  search: {
    query(q: string, options?: SearchQueryOptions): Promise<SearchHit[]>;
    queryDetailed(q: string, options?: SearchQueryOptions): Promise<SearchQueryResult>;
    embedCalls(): Promise<EmbedCall[]>;
    seedBenchChunks(count: number): Promise<void>;
  };
  history: {
    list(): Promise<TimelineEntry[]>;
    rollback(id: string): Promise<TimelineEntry[]>;
  };
  agent: {
    analyze(channel?: 'interactive' | 'background'): Promise<{ status: string; trace: GenerationTrace }>;
    latestTrace(): Promise<GenerationTrace | null>;
    organize(): Promise<TopicView[]>;
    chat(question: string): Promise<ChatTurn>;
    revise(noteId: string): Promise<ParallelRevision>;
    acceptRevision(id: string): Promise<void>;
    rejectRevision(id: string): Promise<void>;
    runBackground(): Promise<{ status: string }>;
  };
  workbench: {
    view(): Promise<WorkbenchView>;
    saveBudgets(input: BudgetSettings): Promise<WorkbenchView>;
    savePrivacy(input: { telemetry: boolean; crashReports: boolean }): Promise<WorkbenchView>;
    savePrompt(text: string): Promise<WorkbenchView>;
    resetPrompt(): Promise<WorkbenchView>;
    saveTriggers(input: { enabled: boolean; onNewNotes: boolean }): Promise<WorkbenchView>;
    captureCrash(payload: Record<string, unknown>): Promise<{ outbound: Record<string, unknown> | null }>;
    renameTopic(id: string, title: string): Promise<TopicView>;
    pinTopic(id: string, pinned: boolean): Promise<TopicView>;
    hideTopic(id: string, hidden: boolean): Promise<TopicView>;
    mergeTopics(fromId: string, intoId: string): Promise<TopicView[]>;
    splitTopic(id: string, noteIds: string[]): Promise<TopicView[]>;
    confirmEvidence(proposalId: string, evidenceId: string): Promise<ProposalView>;
    setThesis(proposalId: string, thesis: string): Promise<ProposalView>;
    includeEvidence(proposalId: string, evidenceId: string, included: boolean): Promise<ProposalView>;
    createProposal(topicId: string): Promise<ProposalView>;
    createManuscript(input: { kind: 'trial' | 'formal'; title: string; body: string; topicId?: string; proposalId?: string; spans?: ManuscriptSpan[] }): Promise<ManuscriptView>;
    saveManuscript(input: { id: string; title: string; body: string; spans?: ManuscriptSpan[] }): Promise<ManuscriptView>;
    finalize(id: string): Promise<ManuscriptView>;
    unfinalize(id: string): Promise<ManuscriptView>;
    generateFormal(proposalId: string): Promise<ManuscriptView>;
    promoteTrial(id: string): Promise<ProposalView>;
    exportManuscript(id: string, options?: { footnotes?: boolean }): Promise<{ markdown: string; text: string; html: string }>;
    promoteChat(turnId: string, paragraphIndex: number, thought: string): Promise<AtomicNote>;
    saveStyle(text: string): Promise<StyleProfileView>;
    resetStyle(): Promise<StyleProfileView>;
    rollbackStyle(): Promise<StyleProfileView>;
    learnStyle(manuscriptId: string): Promise<StyleProposalView | null>;
    confirmStyleProposal(id: string): Promise<StyleProfileView>;
    inboxAct(id: string, action: 'accept' | 'ignore'): Promise<InboxItem[]>;
  };
  models: {
    view(): Promise<ModelSettingsView>;
    save(input: SaveModelSettingsInput): Promise<ModelSettingsView>;
    probe(input: { baseUrl: string; apiKey: string; role?: ModelRole }): Promise<ProbeOutcome>;
  };
  library: {
    list(): Promise<SourceDocument[]>;
    importEpubs(): Promise<ImportResult>;
    importUrl(url: string): Promise<ImportResult>;
    importMarkdown(): Promise<MarkdownImportResult>;
    open(id: string): Promise<ReadingView>;
    turn(direction: TurnDirection): Promise<ReadingView>;
    jump(spineIndex: number): Promise<ReadingView>;
    close(): Promise<void>;
    resume(): Promise<ReadingView | null>;
    markRead(id: string): Promise<ReadingStatus>;
    unmarkRead(id: string): Promise<ReadingStatus>;
    recordAgentLook(sourceId: string): Promise<void>;
  };
};
