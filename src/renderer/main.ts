import type { AtomicNote, ImportResult, IndexStatus, ManuscriptSpan, ModelRole, ModelSettingsView, ParallelRevision, ProbeResult, ProposalView, ReadingStatus, ReadingView, SearchHit, SearchKind, SearchMode, SourceDocument, SourceKind, StyleProposalView, TimelineEntry, TocEntry } from '../shared/api';

const spaces = ['library', 'thoughts', 'creation'] as const;
type Space = (typeof spaces)[number];

const probeCopy: Record<ProbeResult, string> = {
  ok: '连通成功',
  unauthorized: '凭据无效',
  unreachable: '端点不可达',
};

const indexCopy: Record<IndexStatus, string> = {
  pending: '待索引',
  indexing: '索引中',
  ready: '已索引',
  error: '索引失败',
};

const readingCopy: Record<ReadingStatus, string> = {
  unread: '未读',
  reading: '在读',
  read: '已读',
};

let currentSourceId: string | null = null;
let currentStatus: ReadingStatus = 'unread';
let currentSpineIndex = 0;
let currentKind: SourceKind = 'epub';
let currentHasTextLayer = true;
let lastSelection: CaptureRange | null = null;
let captureDraft: CaptureDraft | null = null;
let pendingHighlight: HighlightTarget | null = null;
let sourceNotes: AtomicNote[] = [];
let searchHits: SearchHit[] = [];
let lastSearchQuery = '';
let searchSeq = 0;

const searchKindCopy: Record<SearchKind, string> = {
  epub: '书籍',
  pdf: 'PDF',
  note: '笔记',
  article: '文章',
  draft: '草稿',
};

type CaptureRange = {
  quotation: string;
  start: number;
  end: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type CaptureDraft = CaptureRange & {
  sourceId: string;
  spineIndex: number;
};

type HighlightTarget = CaptureRange;

let citationLabels: Record<string, string> = {};
let editingRevisionId: string | null = null;

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderMarkdownPreview(source: string): string {
  const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (escaped.trim() === '') {
    return '';
  }
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(block);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      }
      const lines = block.split('\n');
      if (lines.every((line) => line.startsWith('- '))) {
        return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${inlineMarkdown(block).replaceAll('\n', '<br>')}</p>`;
    })
    .join('');
}

function setDraftPreview(body: string): void {
  const preview = document.getElementById('draft-preview');
  if (preview) {
    preview.innerHTML = renderMarkdownPreview(body);
  }
}

function isSpace(value: string | null): value is Space {
  return value === 'library' || value === 'thoughts' || value === 'creation';
}

function showSpace(space: Space): void {
  document.querySelectorAll<HTMLButtonElement>('[data-space]').forEach((button) => {
    const current = button.dataset.space === space;
    button.setAttribute('aria-current', current ? 'page' : 'false');
  });

  document.querySelectorAll<HTMLElement>('[data-space-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.spacePanel !== space;
  });
  if (space === 'thoughts') {
    void refreshThoughts();
  }
  if (space === 'creation') {
    void refreshWorkbench();
  }
}

function rollbackDialog(): HTMLDialogElement {
  return document.getElementById('rollback-dialog') as HTMLDialogElement;
}

let pendingRollback: TimelineEntry | null = null;
let editingNoteId: string | null = null;
let editingBase: { quotation: string; thought: string } | null = null;
let repairingPath: string | null = null;

function noteEditDialog(): HTMLDialogElement {
  return document.getElementById('note-edit-dialog') as HTMLDialogElement;
}

function beginEditNote(note: AtomicNote): void {
  editingNoteId = note.id;
  editingBase = { quotation: note.quotation, thought: note.thought };
  (document.getElementById('note-edit-quotation') as HTMLTextAreaElement).value = note.quotation;
  (document.getElementById('note-edit-thought') as HTMLTextAreaElement).value = note.thought;
  noteEditDialog().showModal();
}
let thoughtNotes: AtomicNote[] = [];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function renderThoughtNotes(notes: AtomicNote[]): void {
  thoughtNotes = notes;
  const list = document.getElementById('thoughts-notes');
  const empty = document.getElementById('thoughts-empty');
  const cta = document.getElementById('thoughts-cta');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = notes.length > 0;
  if (cta) {
    cta.hidden = notes.length > 0;
  }
  for (const note of notes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.thoughtNoteId = note.id;
    const kind = document.createElement('span');
    kind.className = 'source-note-kind';
    kind.textContent = note.kind === 'excerpt' ? '摘录' : '思想笔记';
    const quote = document.createElement('p');
    quote.className = 'source-note-quote';
    quote.textContent = note.quotation;
    const thought = document.createElement('p');
    thought.className = 'source-note-thought';
    thought.textContent = note.thought.trim() === '' ? '（无）' : note.thought;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.editNoteId = note.id;
    edit.textContent = '编辑';
    const revise = document.createElement('button');
    revise.type = 'button';
    revise.dataset.reviseNote = note.id;
    revise.textContent = '生成修订';
    button.append(kind, quote, thought);
    item.append(button, edit, revise);
    list.append(item);
  }
}

function renderHistory(entries: TimelineEntry[]): void {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = entries.length > 0;
  for (const entry of entries) {
    const item = document.createElement('li');
    const summary = document.createElement('p');
    summary.className = 'history-summary';
    summary.textContent = entry.summary;
    const when = document.createElement('p');
    when.className = 'history-when';
    when.textContent = formatWhen(entry.at);
    const rollback = document.createElement('button');
    rollback.type = 'button';
    rollback.dataset.rollbackId = entry.id;
    rollback.textContent = '回滚到此处';
    item.append(summary, when, rollback);
    list.append(item);
  }
}

async function refreshThoughts(): Promise<void> {
  const [notes, history, broken, conflicts, bench] = await Promise.all([
    window.zhiliu.notes.list(),
    window.zhiliu.history.list(),
    window.zhiliu.notes.broken(),
    window.zhiliu.notes.conflicts(),
    window.zhiliu.workbench.view(),
  ]);
  renderThoughtNotes(notes);
  renderHistory(history);
  renderBroken(broken);
  renderConflicts(conflicts);
  renderRevisions(bench.revisions);
}

function renderBroken(items: { path: string; reason: string; id?: string }[]): void {
  const list = document.getElementById('broken-list');
  const empty = document.getElementById('broken-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = items.length > 0;
  for (const item of items) {
    const row = document.createElement('li');
    const label = document.createElement('p');
    label.textContent = '需要修复';
    const file = document.createElement('p');
    file.textContent = item.path.split(/[/\\]/).at(-1) ?? item.path;
    const reason = document.createElement('p');
    reason.textContent = item.reason === 'missing-id' ? '缺少稳定标识' : item.reason === 'duplicate-id' ? '标识重复' : '无法读取';
    const repair = document.createElement('button');
    repair.type = 'button';
    repair.dataset.repairPath = item.path;
    if (item.id) {
      repair.dataset.repairId = item.id;
    }
    repair.textContent = '修复';
    row.append(label, file, reason, repair);
    list.append(row);
  }
}

function renderConflicts(items: { path: string; id: string; quotation: string; thought: string }[]): void {
  const list = document.getElementById('conflict-list');
  const empty = document.getElementById('conflict-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = items.length > 0;
  for (const item of items) {
    const row = document.createElement('li');
    const label = document.createElement('p');
    label.textContent = '冲突副本';
    const thought = document.createElement('p');
    thought.textContent = item.thought || item.quotation;
    const keepDisk = document.createElement('button');
    keepDisk.type = 'button';
    keepDisk.dataset.conflictKeep = 'disk';
    keepDisk.dataset.conflictPath = item.path;
    keepDisk.textContent = '保留知识库中的版本';
    const keepIncoming = document.createElement('button');
    keepIncoming.type = 'button';
    keepIncoming.dataset.conflictKeep = 'incoming';
    keepIncoming.dataset.conflictPath = item.path;
    keepIncoming.textContent = '保留应用内的版本';
    row.append(label, thought, keepDisk, keepIncoming);
    list.append(row);
  }
}

function beginRollback(id: string): void {
  const item = document.querySelector<HTMLElement>(`#history-list [data-rollback-id="${id}"]`);
  const summary = item?.parentElement?.querySelector('.history-summary')?.textContent ?? '';
  pendingRollback = { id, summary, at: '' };
  const label = document.getElementById('rollback-summary');
  if (label) {
    label.textContent = summary;
  }
  rollbackDialog().showModal();
  document.getElementById('rollback-confirm')?.focus();
}

async function confirmRollback(): Promise<void> {
  if (!pendingRollback) {
    return;
  }
  const id = pendingRollback.id;
  pendingRollback = null;
  rollbackDialog().close();
  await window.zhiliu.history.rollback(id);
  await refreshThoughts();
  await refreshLibrary();
}

function showApp(firstRun: boolean): void {
  const firstRunScreen = document.getElementById('first-run');
  const shell = document.getElementById('app-shell');
  if (!firstRunScreen || !shell) {
    return;
  }
  firstRunScreen.hidden = !firstRun;
  shell.hidden = firstRun;
}

function settingsDialog(): HTMLDialogElement {
  return document.getElementById('settings') as HTMLDialogElement;
}

function input(name: string): HTMLInputElement {
  return document.querySelector(`#settings-form [name="${name}"]`) as HTMLInputElement;
}

async function refreshAgent(view?: ModelSettingsView): Promise<void> {
  const status = view ?? (await window.zhiliu.models.view());
  const unconfigured = document.getElementById('agent-unconfigured');
  const openSettings = document.getElementById('agent-open-settings');
  const copy = document.getElementById('agent-copy');
  if (!unconfigured || !openSettings || !copy) {
    return;
  }
  unconfigured.textContent = status.configured ? '' : '尚未配置模型。';
  unconfigured.hidden = status.configured;
  openSettings.hidden = status.configured;
  copy.hidden = !status.configured;
}

function fillSettings(view: ModelSettingsView): void {
  input('fast-base-url').value = view.fast.baseUrl;
  input('fast-model').value = view.fast.model;
  input('fast-api-key').value = '';
  input('fast-api-key').placeholder = view.fast.hasKey ? '已保存' : '';
  input('deep-base-url').value = view.deep.baseUrl;
  input('deep-model').value = view.deep.model;
  input('deep-api-key').value = '';
  input('deep-api-key').placeholder = view.deep.hasKey ? '已保存' : '';
  void window.zhiliu.workbench.view().then((bench) => {
    input('budget-daily-tokens').value = String(bench.budgets.dailyTokens);
    input('budget-monthly-tokens').value = String(bench.budgets.monthlyTokens);
    input('budget-daily-requests').value = String(bench.budgets.dailyRequests);
    input('budget-monthly-requests').value = String(bench.budgets.monthlyRequests);
    input('budget-shared').checked = bench.budgets.sharedHardCap;
    const prompt = document.querySelector('#settings-form [name="prompt-override"]') as HTMLTextAreaElement;
    if (prompt) {
      prompt.value = bench.prompt.overridden ? bench.prompt.text : '';
    }
    input('telemetry').checked = bench.privacy.telemetry;
    input('crash-reports').checked = bench.privacy.crashReports;
    input('triggers-enabled').checked = bench.triggers.enabled;
    input('triggers-notes').checked = bench.triggers.onNewNotes;
    const triggerCopy = `自动工作：${bench.triggers.status}${bench.triggers.lastRun ? ` · 最近一次 ${bench.triggers.lastRun}` : ''}`;
    const settingsTrigger = document.getElementById('settings-trigger-status');
    if (settingsTrigger) {
      settingsTrigger.textContent = triggerCopy;
    }
  });
}

function renderLibrary(sources: SourceDocument[]): void {
  const list = document.getElementById('library-list');
  const empty = document.getElementById('library-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = sources.length > 0;
  for (const source of sources) {
    const item = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'source-title';
    open.textContent = source.title;
    open.dataset.openSource = source.id;
    item.append(open);
    if (source.authors.length > 0) {
      const authors = document.createElement('p');
      authors.className = 'source-authors';
      authors.textContent = source.authors.join('、');
      item.append(authors);
    }
    const status = document.createElement('p');
    status.className = 'source-index';
    status.textContent = indexCopy[source.indexStatus];
    item.append(status);
    const reading = document.createElement('p');
    reading.className = 'source-reading';
    reading.textContent = readingCopy[source.readingStatus];
    item.append(reading);
    list.append(item);
  }
}

async function refreshLibrary(): Promise<void> {
  renderLibrary(await window.zhiliu.library.list());
}

function showLibraryFailures(result: ImportResult['failures']): void {
  const alert = document.getElementById('library-error');
  if (!alert) {
    return;
  }
  if (result.length === 0) {
    alert.hidden = true;
    alert.textContent = '';
    return;
  }
  alert.hidden = false;
  alert.textContent = result.map((failure) => `${failure.filename}：${failure.message}`).join(' ');
}

function libraryBrowse(): HTMLElement | null {
  return document.getElementById('library-browse');
}

function libraryReader(): HTMLElement | null {
  return document.getElementById('library-reader');
}

function readerFrame(): HTMLIFrameElement | null {
  return document.getElementById('reader-frame') as HTMLIFrameElement | null;
}

function readerPrev(): HTMLButtonElement | null {
  return document.getElementById('reader-prev') as HTMLButtonElement | null;
}

function readerNext(): HTMLButtonElement | null {
  return document.getElementById('reader-next') as HTMLButtonElement | null;
}

function isReading(): boolean {
  const reader = libraryReader();
  return Boolean(reader && !reader.hidden);
}

const readerPageCss = `
/* Token values match src/renderer/styles.css :root — srcdoc cannot inherit parent variables. */
:root {
  --color-paper: #f4efe6;
  --color-ink: #2c2416;
  --font-display: "Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif;
}
html, body {
  margin: 0;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.8;
  user-select: text;
  -webkit-user-select: text;
}
body {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
h1, h2, h3 { font-weight: 600; letter-spacing: 0.02em; }
p { margin: 0 0 1em; }
img { max-width: 100%; height: auto; }
mark[data-zhiliu-highlight] {
  background: #e8d9b8; /* --color-mark */
  color: inherit;
}
`;

function readerDocument(html: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${readerPageCss}</style></head><body>${html}</body></html>`;
}

function tocDialog(): HTMLDialogElement {
  return document.getElementById('toc-dialog') as HTMLDialogElement;
}

function isTextEntry(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function onReaderKey(event: KeyboardEvent): void {
  if (!isReading() || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (settingsDialog().open || captureDialog().open || searchDialog().open || rollbackDialog().open || urlDialog().open || isTextEntry(event)) {
    return;
  }
  if (event.shiftKey && (event.key === 'R' || event.key === 'r')) {
    event.preventDefault();
    void toggleReadFlag();
    return;
  }
  if (event.shiftKey) {
    return;
  }
  if (event.key === 't' || event.key === 'T') {
    event.preventDefault();
    toggleToc();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    void turnReading('next');
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    void turnReading('prev');
  }
}

function bindFrameKeys(frame: HTMLIFrameElement): void {
  const doc = frame.contentDocument;
  if (!doc) {
    return;
  }
  doc.addEventListener('keydown', onReaderKey);
  doc.addEventListener('keydown', onCaptureShortcut);
  doc.addEventListener('keydown', onSearchShortcut);
  doc.addEventListener('selectionchange', () => {
    const range = readSelection(doc);
    if (range) {
      lastSelection = range;
    }
  });
}

function captureDialog(): HTMLDialogElement {
  return document.getElementById('capture-dialog') as HTMLDialogElement;
}

function captureThought(): HTMLTextAreaElement {
  return document.getElementById('capture-thought') as HTMLTextAreaElement;
}

function onSearchShortcut(event: KeyboardEvent): void {
  if (event.altKey || event.shiftKey) {
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  if (event.key !== 'k' && event.key !== 'K') {
    return;
  }
  event.preventDefault();
  openSearch();
}

function onCaptureShortcut(event: KeyboardEvent): void {
  if (!isReading() || event.altKey || event.shiftKey) {
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  if (event.key !== 'm' && event.key !== 'M') {
    return;
  }
  event.preventDefault();
  beginCapture();
}

function prefixLength(doc: Document, container: Node, offset: number): number {
  const pre = doc.createRange();
  pre.selectNodeContents(doc.body);
  try {
    pre.setEnd(container, offset);
  } catch {
    return -1;
  }
  return pre.toString().length;
}

function readSelection(doc: Document): CaptureRange | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return null;
  }
  const quotation = sel.toString();
  if (quotation.trim() === '') {
    return null;
  }
  const range = sel.getRangeAt(0);
  const start = prefixLength(doc, range.startContainer, range.startOffset);
  const end = prefixLength(doc, range.endContainer, range.endOffset);
  if (start < 0 || end <= start) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  const page = doc.querySelector('.pdf-page') as HTMLElement | null;
  const origin = page?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return {
    quotation,
    start,
    end,
    x0: rect.left - origin.left,
    y0: rect.top - origin.top,
    x1: rect.right - origin.left,
    y1: rect.bottom - origin.top,
  };
}

function currentCaptureRange(): CaptureRange | null {
  const doc = readerFrame()?.contentDocument;
  if (doc) {
    const live = readSelection(doc);
    if (live) {
      return live;
    }
  }
  return lastSelection;
}

function showCaptureHint(message: string): void {
  const hint = document.getElementById('capture-hint');
  if (!hint) {
    return;
  }
  hint.textContent = message;
  hint.hidden = message === '';
}

function beginCapture(): void {
  if (!isReading() || !currentSourceId || captureDialog().open || settingsDialog().open || tocDialog().open || searchDialog().open) {
    return;
  }
  if (!currentHasTextLayer) {
    showCaptureHint('这份来源没有文本层，本版本无法选中文字。');
    return;
  }
  const range = currentCaptureRange();
  if (!range) {
    showCaptureHint('请先选中要记下的文字。');
    return;
  }
  showCaptureHint('');
  captureDraft = { ...range, sourceId: currentSourceId, spineIndex: currentSpineIndex };
  const quotation = document.getElementById('capture-quotation');
  if (quotation) {
    quotation.textContent = range.quotation;
  }
  captureThought().value = '';
  captureDialog().showModal();
  captureThought().focus();
}

function formatSourcePosition(kind: SourceKind, spineIndex: number, range: CaptureRange): string {
  if (kind === 'pdf') {
    const box = [range.x0, range.y0, range.x1, range.y1].map((value) => Math.round(value));
    return `pdf:${spineIndex}:${range.start}:${range.end}:${box.join(':')}`;
  }
  if (kind === 'web' || kind === 'markdown') {
    return `web:${spineIndex}:${range.start}:${range.end}`;
  }
  return `epub:${spineIndex}:${range.start}:${range.end}`;
}

function parseSourcePosition(
  value: string | null,
): { kind: SourceKind; spineIndex: number; start: number; end: number } | null {
  if (!value) {
    return null;
  }
  const pdf = /^pdf:(\d+):(\d+):(\d+):(-?\d+):(-?\d+):(-?\d+):(-?\d+)$/.exec(value);
  if (pdf) {
    return { kind: 'pdf', spineIndex: Number(pdf[1]), start: Number(pdf[2]), end: Number(pdf[3]) };
  }
  const epub = /^(?:epub|web):(\d+):(\d+):(\d+)$/.exec(value);
  if (!epub) {
    return null;
  }
  return { kind: value.startsWith('web:') ? 'web' : 'epub', spineIndex: Number(epub[1]), start: Number(epub[2]), end: Number(epub[3]) };
}

async function saveCapture(): Promise<void> {
  if (!captureDraft) {
    return;
  }
  const draft = captureDraft;
  await window.zhiliu.notes.save({
    quotation: draft.quotation,
    thought: captureThought().value,
    sourceId: draft.sourceId,
    sourcePosition: formatSourcePosition(currentKind, draft.spineIndex, draft),
  });
  captureDraft = null;
  captureDialog().close();
  await refreshSourceNotes(draft.sourceId);
  await refreshThoughts();
}

function renderSourceNotes(notes: AtomicNote[]): void {
  sourceNotes = notes;
  const list = document.getElementById('reader-notes-list');
  const empty = document.getElementById('reader-notes-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  empty.hidden = notes.length > 0;
  for (const note of notes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.noteId = note.id;
    const quote = document.createElement('p');
    quote.className = 'source-note-quote';
    quote.textContent = note.quotation;
    const thought = document.createElement('p');
    thought.className = 'source-note-thought';
    thought.textContent = note.thought.trim() === '' ? '（无）' : note.thought;
    const kind = document.createElement('span');
    kind.className = 'source-note-kind';
    kind.textContent = note.kind === 'excerpt' ? '摘录' : '思想笔记';
    button.append(kind, quote, thought);
    item.append(button);
    list.append(item);
  }
}

async function refreshSourceNotes(sourceId: string): Promise<void> {
  const notes = await window.zhiliu.notes.listForSource(sourceId);
  if (currentSourceId !== sourceId) {
    return;
  }
  renderSourceNotes(notes);
}

function locateOffsets(
  doc: Document,
  start: number,
  end: number,
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const length = text.data.length;
    if (!startNode && start >= offset && start <= offset + length) {
      startNode = text;
      startOffset = start - offset;
    }
    if (end >= offset && end <= offset + length) {
      endNode = text;
      endOffset = end - offset;
    }
    offset += length;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) {
    return null;
  }
  return { startNode, startOffset, endNode, endOffset };
}

function highlightQuotation(doc: Document, quotation: string): boolean {
  if (quotation.trim() === '') {
    return false;
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const index = text.data.indexOf(quotation);
    if (index >= 0) {
      const range = doc.createRange();
      range.setStart(text, index);
      range.setEnd(text, index + quotation.length);
      wrapHighlight(doc, range);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function wrapHighlight(doc: Document, range: Range): void {
  const mark = doc.createElement('mark');
  mark.setAttribute('data-zhiliu-highlight', '');
  mark.append(range.extractContents());
  range.insertNode(mark);
  mark.scrollIntoView({ block: 'center' });
}

function applyHighlight(doc: Document, target: HighlightTarget): void {
  const located = locateOffsets(doc, target.start, target.end);
  if (located) {
    const range = doc.createRange();
    range.setStart(located.startNode, located.startOffset);
    range.setEnd(located.endNode, located.endOffset);
    wrapHighlight(doc, range);
    return;
  }
  highlightQuotation(doc, target.quotation);
}

async function jumpToSourceNote(note: AtomicNote): Promise<void> {
  const parsed = parseSourcePosition(note.sourcePosition);
  if (!parsed || !isReading()) {
    return;
  }
  pendingHighlight = { quotation: note.quotation, start: parsed.start, end: parsed.end, x0: 0, y0: 0, x1: 0, y1: 0 };
  showReading(await window.zhiliu.library.jump(parsed.spineIndex));
}

function appReady(): boolean {
  const shell = document.getElementById('app-shell');
  return Boolean(shell && !shell.hidden);
}

function searchDialog(): HTMLDialogElement {
  return document.getElementById('search') as HTMLDialogElement;
}

function searchQuery(): HTMLInputElement {
  return document.getElementById('search-query') as HTMLInputElement;
}

function searchSemantic(): HTMLInputElement {
  return document.getElementById('search-semantic') as HTMLInputElement;
}

function currentSearchMode(): SearchMode {
  return searchSemantic()?.checked === false ? 'keyword' : 'mix';
}

function openSearch(): void {
  if (!appReady()) {
    return;
  }
  const dialog = searchDialog();
  if (dialog.open) {
    searchQuery().focus();
    return;
  }
  searchQuery().value = '';
  lastSearchQuery = '';
  renderSearchHits([]);
  const empty = document.getElementById('search-empty');
  if (empty) {
    empty.hidden = true;
  }
  const degraded = document.getElementById('search-degraded');
  if (degraded) {
    degraded.hidden = true;
    degraded.textContent = '';
  }
  dialog.showModal();
  searchQuery().focus();
}

function closeSearch(): void {
  const dialog = searchDialog();
  if (dialog.open) {
    dialog.close();
  }
}

function renderSearchHits(hits: SearchHit[]): void {
  searchHits = hits;
  const list = document.getElementById('search-results');
  const empty = document.getElementById('search-empty');
  if (!list || !empty) {
    return;
  }
  list.replaceChildren();
  const querying = searchQuery().value.trim();
  empty.hidden = querying === '' || hits.length > 0;
  hits.forEach((hit, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.hitIndex = String(index);
    const kind = document.createElement('span');
    kind.className = 'search-kind';
    kind.textContent = searchKindCopy[hit.kind];
    const title = document.createElement('span');
    title.className = 'search-title';
    title.textContent = hit.title;
    const provenance = document.createElement('span');
    provenance.className = 'search-provenance';
    provenance.textContent = hit.provenance === 'user' ? '用户' : hit.provenance === 'ai' ? 'AI' : '来源';
    button.append(kind, title, provenance);
    if (hit.partialIndex) {
      const partial = document.createElement('span');
      partial.className = 'search-partial';
      partial.textContent = '部分索引';
      button.append(partial);
    }
    const snippet = document.createElement('p');
    snippet.className = 'search-snippet';
    snippet.textContent = hit.snippet;
    button.append(snippet);
    item.append(button);
    list.append(item);
  });
}

async function runSearch(): Promise<void> {
  const q = searchQuery().value;
  lastSearchQuery = q.trim();
  const seq = ++searchSeq;
  const list = document.getElementById('search-results');
  list?.setAttribute('aria-busy', 'true');
  const result = await window.zhiliu.search.queryDetailed(q, { mode: currentSearchMode() });
  if (seq !== searchSeq) {
    return;
  }
  list?.setAttribute('aria-busy', 'false');
  renderSearchHits(result.hits);
  const degraded = document.getElementById('search-degraded');
  if (degraded) {
    const copy =
      result.degraded === 'missing-model'
        ? '本地语义模型不可用，目前只用关键词检索。'
        : result.degraded === 'onnx'
          ? '语义引擎未能加载，目前只用关键词检索。'
          : result.degraded === 'worker'
            ? '后台语义进程已停止，目前只用关键词检索。'
            : '';
    degraded.textContent = copy;
    degraded.hidden = copy === '';
  }
}

async function revealNote(note: AtomicNote): Promise<void> {
  if (!note.sourceId) {
    showSpace('thoughts');
    return;
  }
  if (isReading() && currentSourceId === note.sourceId) {
    await jumpToSourceNote(note);
    return;
  }
  const parsed = parseSourcePosition(note.sourcePosition);
  pendingHighlight = parsed
    ? { quotation: note.quotation, start: parsed.start, end: parsed.end, x0: 0, y0: 0, x1: 0, y1: 0 }
    : { quotation: note.quotation, start: -1, end: -1, x0: 0, y0: 0, x1: 0, y1: 0 };
  let view = await window.zhiliu.library.open(note.sourceId);
  if (parsed && view.spineIndex !== parsed.spineIndex) {
    view = await window.zhiliu.library.jump(parsed.spineIndex);
  }
  showReading(view);
}

function handleJump(target: HTMLElement): boolean {
  const noteId = target.closest<HTMLButtonElement>('[data-jump-note]')?.dataset.jumpNote;
  const sourceId = target.closest<HTMLButtonElement>('[data-jump-source]')?.dataset.jumpSource;
  if (noteId) {
    void window.zhiliu.notes.get(noteId).then((note) => {
      if (note) {
        showSpace('library');
        return revealNote(note);
      }
      return undefined;
    });
    return true;
  }
  if (sourceId) {
    showSpace('library');
    void window.zhiliu.library.open(sourceId).then((view) => showReading(view));
    return true;
  }
  return false;
}

async function renderCitations(spans: ManuscriptSpan[]): Promise<void> {
  const editor = document.getElementById('citation-editor');
  const list = document.getElementById('citation-list');
  if (!editor || !list) {
    return;
  }
  const sourceIds = [...new Set(spans.map((span) => span.sourceId).filter((id): id is string => Boolean(id)))];
  editor.hidden = sourceIds.length === 0;
  list.replaceChildren();
  if (sourceIds.length === 0) {
    return;
  }
  const catalog = await window.zhiliu.library.list();
  for (const sourceId of sourceIds) {
    const source = catalog.find((item) => item.id === sourceId);
    const row = document.createElement('li');
    const label = document.createElement('label');
    label.textContent = '引用来源名称';
    const input = document.createElement('input');
    input.setAttribute('aria-label', `引用 ${source?.title ?? sourceId}`);
    input.dataset.citationSource = sourceId;
    input.value = citationLabels[sourceId] || source?.title || sourceId;
    citationLabels[sourceId] = input.value;
    label.append(input);
    row.append(label);
    list.append(row);
  }
}

async function openSearchHit(hit: SearchHit): Promise<void> {
  closeSearch();
  showSpace('library');
  if (hit.kind === 'note' && hit.noteId) {
    const note = await window.zhiliu.notes.get(hit.noteId);
    if (!note) {
      return;
    }
    await revealNote(note);
    return;
  }
  if (!hit.sourceId) {
    return;
  }
  pendingHighlight = { quotation: lastSearchQuery, start: -1, end: -1, x0: 0, y0: 0, x1: 0, y1: 0 };
  let view = await window.zhiliu.library.open(hit.sourceId);
  if (hit.spineIndex !== undefined && view.spineIndex !== hit.spineIndex) {
    view = await window.zhiliu.library.jump(hit.spineIndex);
  }
  showReading(view);
}

async function turnReading(direction: 'prev' | 'next'): Promise<void> {
  if (!isReading()) {
    return;
  }
  showReading(await window.zhiliu.library.turn(direction));
}

function renderReadFlag(status: ReadingStatus): void {
  currentStatus = status;
  const label = document.getElementById('reader-status');
  const button = document.getElementById('reader-read-flag') as HTMLButtonElement | null;
  if (label) {
    label.textContent = readingCopy[status];
  }
  if (!button) {
    return;
  }
  if (status === 'read') {
    button.textContent = '撤销已读';
    button.title = '撤销已读（Shift+R）';
  } else {
    button.textContent = '标记已读';
    button.title = '标记已读（Shift+R）';
  }
}

async function toggleReadFlag(): Promise<void> {
  if (!isReading() || !currentSourceId) {
    return;
  }
  const status =
    currentStatus === 'read'
      ? await window.zhiliu.library.unmarkRead(currentSourceId)
      : await window.zhiliu.library.markRead(currentSourceId);
  renderReadFlag(status);
}

async function jumpReading(spineIndex: number): Promise<void> {
  if (!isReading()) {
    return;
  }
  showReading(await window.zhiliu.library.jump(spineIndex));
  closeToc();
}

function renderToc(entries: TocEntry[]): void {
  const list = document.getElementById('toc-list');
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    button.dataset.spineIndex = String(entry.spineIndex);
    item.append(button);
    list.append(item);
  }
}

function closeToc(): void {
  const dialog = tocDialog();
  if (dialog.open) {
    dialog.close();
  }
}

function toggleToc(): void {
  if (!isReading()) {
    return;
  }
  const dialog = tocDialog();
  if (dialog.open) {
    dialog.close();
    return;
  }
  dialog.showModal();
  const first = dialog.querySelector<HTMLButtonElement>('#toc-list button');
  first?.focus();
}

function showReading(view: ReadingView): void {
  const browse = libraryBrowse();
  const reader = libraryReader();
  const title = document.getElementById('reader-title');
  const chapter = document.getElementById('reader-chapter');
  const frame = readerFrame();
  const prev = readerPrev();
  const next = readerNext();
  if (!browse || !reader || !title || !chapter || !frame || !prev || !next) {
    return;
  }
  browse.hidden = true;
  reader.hidden = false;
  title.textContent = view.title;
  chapter.textContent = view.chapterLabel;
  prev.disabled = !view.hasPrev;
  next.disabled = !view.hasNext;
  lastSelection = null;
  currentSourceId = view.sourceId;
  currentSpineIndex = view.spineIndex;
  currentKind = view.kind;
  currentHasTextLayer = view.hasTextLayer;
  const prevLabel = view.kind === 'pdf' ? '上一页' : '上一章';
  const nextLabel = view.kind === 'pdf' ? '下一页' : '下一章';
  prev.textContent = prevLabel;
  next.textContent = nextLabel;
  prev.title = view.kind === 'pdf' ? '上一页（←）' : '上一章（←）';
  next.title = view.kind === 'pdf' ? '下一页（→）' : '下一章（→）';
  const notice = document.getElementById('reader-text-layer-notice');
  if (notice) {
    notice.hidden = view.hasTextLayer;
    notice.textContent = view.hasTextLayer ? '' : '这份来源没有文本层，本版本无法选中文字。';
  }
  const highlight = pendingHighlight;
  frame.onload = () => {
    bindFrameKeys(frame);
    if (highlight && frame.contentDocument) {
      applyHighlight(frame.contentDocument, highlight);
    }
    if (pendingHighlight === highlight) {
      pendingHighlight = null;
    }
  };
  frame.srcdoc = readerDocument(view.html);
  renderToc(view.toc);
  renderReadFlag(view.status);
  void refreshSourceNotes(view.sourceId);
  reader.focus();
}

function showLibraryList(): void {
  const browse = libraryBrowse();
  const reader = libraryReader();
  const frame = readerFrame();
  if (!browse || !reader) {
    return;
  }
  closeToc();
  if (captureDialog().open) {
    captureDialog().close();
  }
  if (searchDialog().open) {
    searchDialog().close();
  }
  currentSourceId = null;
  currentSpineIndex = 0;
  lastSelection = null;
  captureDraft = null;
  pendingHighlight = null;
  renderSourceNotes([]);
  reader.hidden = true;
  browse.hidden = false;
  if (frame) {
    frame.srcdoc = '';
  }
}

async function openSettings(): Promise<void> {
  fillSettings(await window.zhiliu.models.view());
  document.getElementById('settings-saved')!.textContent = '';
  settingsDialog().showModal();
  input('fast-base-url').focus();
}

document.querySelectorAll<HTMLButtonElement>('[data-space]').forEach((button) => {
  button.addEventListener('click', () => {
    if (isSpace(button.dataset.space)) {
      showSpace(button.dataset.space);
    }
  });
});

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    onReaderKey(event);
    return;
  }

  if (event.key === ',') {
    event.preventDefault();
    void openSettings();
    return;
  }

  if (event.key === 'k' || event.key === 'K') {
    event.preventDefault();
    openSearch();
    return;
  }

  if (event.key === 'm' || event.key === 'M') {
    event.preventDefault();
    beginCapture();
    return;
  }

  const byKey: Record<string, Space> = {
    '1': 'library',
    '2': 'thoughts',
    '3': 'creation',
  };
  const space = byKey[event.key];
  if (!space) {
    return;
  }

  event.preventDefault();
  showSpace(space);
});

document.getElementById('import-epub')?.addEventListener('click', () => {
  void window.zhiliu.library.importEpubs().then((result) => {
    renderLibrary(result.sources);
    showLibraryFailures(result.failures);
    void refreshThoughts();
  });
});

function urlDialog(): HTMLDialogElement {
  return document.getElementById('url-dialog') as HTMLDialogElement;
}

document.getElementById('import-url')?.addEventListener('click', () => {
  const error = document.getElementById('url-error');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  const input = document.getElementById('url-input') as HTMLInputElement;
  input.value = '';
  urlDialog().showModal();
  input.focus();
});
document.getElementById('url-cancel')?.addEventListener('click', () => {
  urlDialog().close();
});
document.getElementById('url-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.getElementById('url-input') as HTMLInputElement;
  const error = document.getElementById('url-error');
  void window.zhiliu.library.importUrl(input.value.trim()).then((result) => {
    renderLibrary(result.sources);
    if (result.failures.length > 0) {
      if (error) {
        error.hidden = false;
        error.textContent = result.failures.map((failure) => failure.message).join(' ');
      }
      showLibraryFailures(result.failures);
      return;
    }
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    urlDialog().close();
    void refreshThoughts();
  });
});

document.getElementById('import-markdown')?.addEventListener('click', () => {
  void window.zhiliu.library.importMarkdown().then((report) => {
    const hint = document.getElementById('markdown-import-hint');
    if (hint) {
      hint.textContent = `导入是一次性复制，原文件夹之后的修改不会同步到知流。已复制 ${report.copied} 个文件。`;
    }
    void refreshThoughts();
    void refreshLibrary();
  });
});

document.getElementById('note-edit-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!editingNoteId) {
    return;
  }
  const quotation = (document.getElementById('note-edit-quotation') as HTMLTextAreaElement).value;
  const thought = (document.getElementById('note-edit-thought') as HTMLTextAreaElement).value;
  const id = editingNoteId;
  const base = editingBase;
  void window.zhiliu.notes
    .save({
      id,
      quotation,
      thought,
      baseQuotation: base?.quotation,
      baseThought: base?.thought,
    })
    .then(() => {
      editingNoteId = null;
      editingBase = null;
      noteEditDialog().close();
      void refreshThoughts();
    });
});
document.getElementById('note-edit-cancel')?.addEventListener('click', () => {
  editingNoteId = null;
  editingBase = null;
  noteEditDialog().close();
});

function repairDialog(): HTMLDialogElement {
  return document.getElementById('repair-dialog') as HTMLDialogElement;
}

function beginRepair(filePath: string, knownId?: string): void {
  repairingPath = filePath;
  (document.getElementById('repair-file') as HTMLElement).textContent = filePath.split(/[/\\]/).at(-1) ?? filePath;
  (document.getElementById('repair-id') as HTMLInputElement).value = knownId ?? '';
  repairDialog().showModal();
  document.getElementById('repair-id')?.focus();
}

document.getElementById('broken-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-repair-path]');
  const filePath = button?.dataset.repairPath;
  if (!filePath) {
    return;
  }
  beginRepair(filePath, button.dataset.repairId);
});
document.getElementById('conflict-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-conflict-path]');
  const filePath = button?.dataset.conflictPath;
  const keep = button?.dataset.conflictKeep;
  if (!filePath || (keep !== 'disk' && keep !== 'incoming')) {
    return;
  }
  void window.zhiliu.notes.resolveConflict(filePath, keep).then(() => {
    void refreshThoughts();
  });
});
document.getElementById('repair-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!repairingPath) {
    return;
  }
  const id = (document.getElementById('repair-id') as HTMLInputElement).value.trim();
  const filePath = repairingPath;
  void window.zhiliu.notes.repair(filePath, id).then(() => {
    repairingPath = null;
    repairDialog().close();
    void refreshThoughts();
  });
});
document.getElementById('repair-cancel')?.addEventListener('click', () => {
  repairingPath = null;
  repairDialog().close();
});

document.getElementById('agent-analyze')?.addEventListener('click', () => {
  const status = document.getElementById('agent-status');
  const result = document.getElementById('agent-result');
  if (status) {
    status.textContent = '正在分析…';
  }
  void window.zhiliu.agent
    .analyze()
    .then((outcome) => {
      if (status) {
        status.textContent = outcome.status;
      }
      if (result) {
        result.textContent = outcome.trace.result;
      }
    })
    .catch((error: unknown) => {
      if (status) {
        status.textContent = error instanceof Error ? error.message : '分析失败';
      }
    });
});

window.zhiliu.vault.onChanged(() => {
  void refreshThoughts();
  void refreshLibrary();
});

document.getElementById('library-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-open-source]');
  const id = button?.dataset.openSource;
  if (!id) {
    return;
  }
  void window.zhiliu.library.open(id).then(showReading).catch((error) => {
    const message = error instanceof Error ? error.message : '无法打开这本书';
    showLibraryFailures([{ filename: button.textContent ?? '', message }]);
  });
});

document.getElementById('reader-back')?.addEventListener('click', () => {
  void window.zhiliu.library.close().then(() => {
    showLibraryList();
    void refreshLibrary();
  });
});
document.getElementById('reader-prev')?.addEventListener('click', () => {
  void turnReading('prev');
});
document.getElementById('reader-next')?.addEventListener('click', () => {
  void turnReading('next');
});
document.getElementById('reader-toc')?.addEventListener('click', () => {
  toggleToc();
});
document.getElementById('toc-close')?.addEventListener('click', () => {
  closeToc();
});
document.getElementById('toc-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-spine-index]');
  const raw = button?.dataset.spineIndex;
  if (raw === undefined) {
    return;
  }
  void jumpReading(Number(raw));
});
document.getElementById('reader-read-flag')?.addEventListener('click', () => {
  void toggleReadFlag();
});
document.getElementById('reader-capture')?.addEventListener('mousedown', (event) => {
  event.preventDefault();
});
document.getElementById('reader-capture')?.addEventListener('click', () => {
  beginCapture();
});
document.getElementById('reader-notes-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-note-id]');
  const id = button?.dataset.noteId;
  if (!id) {
    return;
  }
  const note = sourceNotes.find((item) => item.id === id);
  if (!note) {
    return;
  }
  void jumpToSourceNote(note);
});
document.getElementById('capture-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveCapture();
});
document.getElementById('capture-thought')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void saveCapture();
  }
});
document.getElementById('capture-cancel')?.addEventListener('click', () => {
  captureDialog().close();
});
document.getElementById('capture-dialog')?.addEventListener('close', () => {
  captureDraft = null;
  document.getElementById('reader-capture')?.focus();
});

document.getElementById('open-search')?.addEventListener('click', () => {
  openSearch();
});
document.getElementById('search-close')?.addEventListener('click', () => {
  closeSearch();
});
document.getElementById('search-query')?.addEventListener('input', () => {
  void runSearch();
});
document.getElementById('search-semantic')?.addEventListener('change', () => {
  void runSearch();
});
document.getElementById('search-results')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-hit-index]');
  const raw = button?.dataset.hitIndex;
  if (raw === undefined) {
    return;
  }
  const hit = searchHits[Number(raw)];
  if (!hit) {
    return;
  }
  void openSearchHit(hit);
});
document.getElementById('search')?.addEventListener('close', () => {
  document.getElementById('open-search')?.focus();
});

document.getElementById('thoughts-to-library')?.addEventListener('click', () => {
  showSpace('library');
});
document.getElementById('thoughts-notes')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const edit = target.closest<HTMLButtonElement>('[data-edit-note-id]');
  if (edit?.dataset.editNoteId) {
    const note = thoughtNotes.find((item) => item.id === edit.dataset.editNoteId);
    if (note) {
      beginEditNote(note);
    }
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-thought-note-id]');
  const id = button?.dataset.thoughtNoteId;
  if (!id) {
    return;
  }
  const note = thoughtNotes.find((item) => item.id === id);
  if (!note) {
    return;
  }
  showSpace('library');
  void revealNote(note);
});
document.getElementById('history-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-rollback-id]');
  const id = button?.dataset.rollbackId;
  if (!id) {
    return;
  }
  beginRollback(id);
});
document.getElementById('rollback-confirm')?.addEventListener('click', () => {
  void confirmRollback();
});
document.getElementById('rollback-cancel')?.addEventListener('click', () => {
  pendingRollback = null;
  rollbackDialog().close();
});
document.getElementById('rollback-dialog')?.addEventListener('close', () => {
  pendingRollback = null;
});

document.getElementById('choose-vault')?.addEventListener('click', () => {
  const error = document.getElementById('first-run-error');
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  void window.zhiliu.vault
    .choose()
    .then((status) => {
      if (!status.firstRun) {
        showApp(false);
        void refreshLibrary();
      }
    })
    .catch((err: unknown) => {
      if (!error) {
        return;
      }
      const detail = err instanceof Error ? err.message : String(err);
      error.hidden = false;
      error.textContent = `无法打开知识库。${detail}`;
    });
});

document.getElementById('open-settings')?.addEventListener('click', () => {
  void openSettings();
});
document.getElementById('agent-open-settings')?.addEventListener('click', () => {
  void openSettings();
});
document.getElementById('settings-close')?.addEventListener('click', () => {
  settingsDialog().close();
});

document.querySelectorAll<HTMLButtonElement>('[data-probe]').forEach((button) => {
  button.addEventListener('click', () => {
    const role = button.dataset.probe as ModelRole;
    const status = document.querySelector(`[data-probe-result="${role}"]`);
    if (!status) {
      return;
    }
    status.textContent = '正在测试…';
    void window.zhiliu.models
      .probe({
        role,
        baseUrl: input(`${role}-base-url`).value,
        apiKey: input(`${role}-api-key`).value,
      })
      .then((outcome) => {
        status.textContent = probeCopy[outcome.result];
      });
  });
});

document.getElementById('settings-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  void window.zhiliu.models
    .save({
      fast: {
        baseUrl: input('fast-base-url').value,
        model: input('fast-model').value,
        apiKey: input('fast-api-key').value,
      },
      deep: {
        baseUrl: input('deep-base-url').value,
        model: input('deep-model').value,
        apiKey: input('deep-api-key').value,
      },
    })
    .then((view) => {
      fillSettings(view);
      document.getElementById('settings-saved')!.textContent = '已保存';
      return Promise.all([
        refreshAgent(view),
        window.zhiliu.workbench.saveBudgets({
          dailyTokens: Number(input('budget-daily-tokens').value) || 0,
          monthlyTokens: Number(input('budget-monthly-tokens').value) || 0,
          dailyRequests: Number(input('budget-daily-requests').value) || 0,
          monthlyRequests: Number(input('budget-monthly-requests').value) || 0,
          sharedHardCap: input('budget-shared').checked,
        }),
        window.zhiliu.workbench.savePrivacy({
          telemetry: input('telemetry').checked,
          crashReports: input('crash-reports').checked,
        }),
        window.zhiliu.workbench.saveTriggers({
          enabled: input('triggers-enabled').checked,
          onNewNotes: input('triggers-notes').checked,
        }),
        (() => {
          const prompt = (document.querySelector('#settings-form [name="prompt-override"]') as HTMLTextAreaElement)?.value.trim();
          return prompt ? window.zhiliu.workbench.savePrompt(prompt) : Promise.resolve();
        })(),
      ]);
    });
});

void window.zhiliu.vault.current().then(async (status) => {
  showApp(status.firstRun);
  if (!status.firstRun) {
    void refreshAgent();
    await refreshLibrary();
    await refreshWorkbench();
    const view = await window.zhiliu.library.resume();
    if (view) {
      showReading(view);
    }
  }
});

let currentDraftId: string | null = null;

async function refreshWorkbench(): Promise<void> {
  const bench = await window.zhiliu.workbench.view();
  const usage = document.getElementById('agent-usage');
  if (usage) {
    usage.textContent = `用量 交互式 ${bench.usage.interactive.requests} 次 / 后台 ${bench.usage.background.requests} 次${bench.usage.interactive.estimated ? '（估算）' : ''}`;
  }
  const paused = document.getElementById('agent-paused');
  if (paused) {
    paused.hidden = !bench.usage.paused;
  }
  const trigger = document.getElementById('trigger-status');
  if (trigger) {
    trigger.textContent = `自动工作：${bench.triggers.status}${bench.triggers.lastRun ? ` · 最近一次 ${bench.triggers.lastRun}` : ''}`;
  }
  renderManuscripts(bench.manuscripts);
  renderTopics(bench.topics);
  renderInbox(bench.inbox, bench.topics);
  renderProposals(bench.proposals);
  renderChats(bench.chats);
  renderStyleProposals(bench.styleProposals);
  const style = document.getElementById('style-text') as HTMLTextAreaElement | null;
  if (style && document.activeElement !== style) {
    style.value = bench.style.text;
  }
}

function renderManuscripts(items: { id: string; title: string; kind: string; status: string; body: string; trialId?: string; staleRefs: string[]; spans: { text: string; provenance: string }[] }[]): void {
  const list = document.getElementById('manuscript-list');
  const empty = document.getElementById('creation-empty');
  if (!list) {
    return;
  }
  list.replaceChildren();
  if (empty) {
    empty.hidden = items.length > 0;
  }
  for (const item of items) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.draftId = item.id;
    const trialMark = item.kind === 'trial' ? '试写 · 推测性的 AI 产物' : '正式';
    const related = item.trialId ? ` · 由试写稿派生` : '';
    button.textContent = `${item.title || '未命名'} · ${trialMark} · ${item.status === 'final' ? '定稿' : '草稿'}${related}`;
    row.append(button);
    if (item.staleRefs.length > 0) {
      const stale = document.createElement('p');
      stale.textContent = '证据已失效';
      row.append(stale);
    }
    if (item.kind === 'trial') {
      const promote = document.createElement('button');
      promote.type = 'button';
      promote.textContent = '从试写预填提案';
      promote.dataset.promoteTrial = item.id;
      row.append(promote);
    }
    list.append(row);
  }
}

function renderTopics(items: { id: string; title: string; origin: string; pinned: boolean }[]): void {
  const list = document.getElementById('topic-list');
  if (!list) {
    return;
  }
  list.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('li');
    const label = document.createElement('p');
    label.textContent = `${item.title} · ${item.origin === 'thought-signal' ? '思想线索' : '书库发现'}${item.pinned ? ' · 已固定' : ''}`;
    if (item.origin === 'library-discovery') {
      const hint = document.createElement('p');
      hint.textContent = '再写三条思想笔记，它会自动变成思想线索。';
      row.append(label, hint);
    } else {
      row.append(label);
    }
    const name = document.createElement('input');
    name.type = 'text';
    name.value = item.title;
    name.setAttribute('aria-label', '主题名称');
    name.dataset.renameInput = item.id;
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = '重命名';
    rename.dataset.renameTopic = item.id;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.textContent = item.pinned ? '取消固定' : '固定';
    pin.dataset.pinTopic = item.id;
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.textContent = '隐藏';
    hide.dataset.hideTopic = item.id;
    const proposal = document.createElement('button');
    proposal.type = 'button';
    proposal.textContent = '生成提案';
    proposal.dataset.proposalTopic = item.id;
    const split = document.createElement('button');
    split.type = 'button';
    split.textContent = '拆分';
    split.dataset.splitTopic = item.id;
    row.append(name, rename, pin, hide, proposal, split);
    const next = items[index + 1];
    if (next) {
      const merge = document.createElement('button');
      merge.type = 'button';
      merge.textContent = '合并到下一主题';
      merge.dataset.mergeFrom = item.id;
      merge.dataset.mergeInto = next.id;
      row.append(merge);
    }
    list.append(row);
  });
}

function renderInbox(
  items: { id: string; origin: string; title: string; copy: string; state: string; topicId: string }[],
  topics: { id: string; noteIds: string[]; sourceIds: string[] }[],
): void {
  const signal = document.getElementById('inbox-signal');
  const discovery = document.getElementById('inbox-discovery');
  if (!signal || !discovery) {
    return;
  }
  signal.replaceChildren();
  discovery.replaceChildren();
  for (const item of items.filter((entry) => entry.state === 'pending')) {
    const row = document.createElement('li');
    const title = document.createElement('p');
    title.textContent = item.title;
    const copy = document.createElement('p');
    copy.textContent = item.copy;
    row.append(title, copy);
    const topic = topics.find((entry) => entry.id === item.topicId);
    if (topic?.noteIds[0]) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.textContent = '跳转到笔记';
      jump.dataset.inboxNote = topic.noteIds[0];
      row.append(jump);
    }
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = '采纳';
    accept.dataset.inboxAccept = item.id;
    const ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.textContent = '忽略';
    ignore.dataset.inboxIgnore = item.id;
    row.append(accept, ignore);
    if (item.origin === 'thought-signal') {
      signal.append(row);
    } else {
      discovery.append(row);
    }
  }
}

function evidenceKindLabel(kind: string): string {
  if (kind === 'thought') {
    return '思想笔记';
  }
  if (kind === 'source') {
    return '来源证据';
  }
  if (kind === 'ai') {
    return 'AI 推演';
  }
  return '缺口';
}

function proposalReadyHint(item: ProposalView): string {
  if (item.ready) {
    return '';
  }
  if (!item.thesisConfirmed) {
    return '需要先确认或修改论点';
  }
  const thoughts = item.evidence.filter((entry) => entry.kind === 'thought' && entry.included && entry.confirmed);
  if (thoughts.length < 3) {
    return '至少需要三条已确认且纳入的思想笔记';
  }
  return '尚未写作就绪';
}

function renderProposals(items: ProposalView[]): void {
  const list = document.getElementById('proposal-list');
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const heading = document.createElement('p');
    heading.textContent = item.thesisFromAi ? '论点（AI 起草）' : '论点';
    const thesis = document.createElement('textarea');
    thesis.setAttribute('aria-label', '提案论点');
    thesis.rows = 2;
    thesis.value = item.thesis;
    thesis.dataset.thesisInput = item.id;
    const confirmThesis = document.createElement('button');
    confirmThesis.type = 'button';
    confirmThesis.textContent = item.thesisConfirmed ? '论点已确认' : '确认论点';
    confirmThesis.dataset.setThesis = item.id;
    row.append(heading, thesis, confirmThesis);
    for (const evidence of item.evidence) {
      const block = document.createElement('div');
      const label = document.createElement('p');
      label.textContent = `${evidenceKindLabel(evidence.kind)}：${evidence.text}`;
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.textContent = evidence.confirmed ? `已确认：${evidence.text}` : `确认：${evidence.text}`;
      confirm.dataset.confirmProposal = item.id;
      confirm.dataset.confirmEvidence = evidence.id;
      const include = document.createElement('button');
      include.type = 'button';
      include.textContent = evidence.included ? '排除' : '纳入';
      include.dataset.includeProposal = item.id;
      include.dataset.includeEvidence = evidence.id;
      include.dataset.includeNext = evidence.included ? 'false' : 'true';
      block.append(label, confirm, include);
      row.append(block);
    }
    const hint = document.createElement('p');
    hint.className = 'proposal-ready-hint';
    hint.textContent = proposalReadyHint(item);
    const generate = document.createElement('button');
    generate.type = 'button';
    generate.textContent = '生成正式稿';
    generate.dataset.generateProposal = item.id;
    generate.disabled = !item.ready;
    generate.title = item.ready ? '' : proposalReadyHint(item);
    row.append(hint, generate);
    list.append(row);
  }
}

function renderRevisions(items: ParallelRevision[]): void {
  const list = document.getElementById('revision-list');
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const status = document.createElement('p');
    status.textContent = item.accepted ? '已接受' : '待处理';
    const body = document.createElement('p');
    body.textContent = item.text;
    row.append(status, body);
    if (!item.accepted) {
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.textContent = '接受';
      accept.dataset.acceptRevision = item.id;
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.textContent = '拒绝';
      reject.dataset.rejectRevision = item.id;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '编辑后采用';
      edit.dataset.editRevision = item.id;
      row.append(accept, reject, edit);
    }
    list.append(row);
  }
}

function renderStyleProposals(items: StyleProposalView[]): void {
  const list = document.getElementById('style-proposals');
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const sample = document.createElement('p');
    sample.textContent = item.text;
    const evidence = document.createElement('p');
    evidence.textContent = `依据：${item.evidence}`;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = '确认样本';
    confirm.dataset.confirmStyle = item.id;
    row.append(sample, evidence, confirm);
    list.append(row);
  }
}

function renderChats(items: { id: string; question: string; paragraphs: { text: string; provenance: string }[]; partialIndex: boolean }[]): void {
  const list = document.getElementById('agent-chat');
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const turn of items) {
    const row = document.createElement('li');
    const q = document.createElement('p');
    q.textContent = turn.question;
    row.append(q);
    if (turn.partialIndex) {
      const partial = document.createElement('p');
      partial.textContent = '结果基于部分索引';
      row.append(partial);
    }
    turn.paragraphs.forEach((paragraph, index) => {
      if (paragraph.provenance === 'user') {
        return;
      }
      const p = document.createElement('p');
      p.textContent = `${paragraph.provenance === 'source' ? '有来源支撑' : '模型补充'}：${paragraph.text}`;
      if (paragraph.noteId || paragraph.sourceId) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = '跳转到来源';
        if (paragraph.noteId) {
          jump.dataset.jumpNote = paragraph.noteId;
        }
        if (paragraph.sourceId) {
          jump.dataset.jumpSource = paragraph.sourceId;
        }
        p.append(document.createTextNode(' '), jump);
      }
      const promote = document.createElement('button');
      promote.type = 'button';
      promote.textContent = '提炼为笔记';
      promote.dataset.promoteTurn = turn.id;
      promote.dataset.promoteIndex = String(index);
      row.append(p, promote);
    });
    list.append(row);
  }
}

document.getElementById('new-manuscript')?.addEventListener('click', () => {
  void window.zhiliu.workbench
    .createManuscript({ kind: 'formal', title: '未命名稿件', body: '' })
    .then((draft) => {
      currentDraftId = draft.id;
      (document.getElementById('draft-title') as HTMLInputElement).value = draft.title;
      (document.getElementById('draft-body') as HTMLTextAreaElement).value = draft.body;
      return refreshWorkbench();
    });
});
document.getElementById('draft-body')?.addEventListener('input', () => {
  const body = (document.getElementById('draft-body') as HTMLTextAreaElement).value;
  setDraftPreview(body);
});
document.getElementById('draft-save')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  const title = (document.getElementById('draft-title') as HTMLInputElement).value;
  const body = (document.getElementById('draft-body') as HTMLTextAreaElement).value;
  void window.zhiliu.workbench.saveManuscript({ id: currentDraftId, title, body }).then(() => refreshWorkbench());
});
document.getElementById('draft-finalize')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  void window.zhiliu.workbench.finalize(currentDraftId).then(() => refreshWorkbench());
});
document.getElementById('draft-unfinalize')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  void window.zhiliu.workbench.unfinalize(currentDraftId).then(() => refreshWorkbench());
});
document.getElementById('draft-export')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  const footnotes = (document.getElementById('export-footnotes') as HTMLInputElement).checked;
  void window.zhiliu.workbench.exportManuscript(currentDraftId, { footnotes, citations: citationLabels }).then((exported) => {
    const out = document.getElementById('export-output');
    if (out) {
      out.hidden = false;
      out.textContent = exported.markdown;
    }
  });
});
document.getElementById('draft-export-plain')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  const footnotes = (document.getElementById('export-footnotes') as HTMLInputElement).checked;
  void window.zhiliu.workbench.exportManuscript(currentDraftId, { footnotes, citations: citationLabels }).then((exported) => {
    const out = document.getElementById('export-output');
    if (out) {
      out.hidden = false;
      out.textContent = exported.text;
    }
  });
});
document.getElementById('draft-export-html')?.addEventListener('click', () => {
  if (!currentDraftId) {
    return;
  }
  const footnotes = (document.getElementById('export-footnotes') as HTMLInputElement).checked;
  void window.zhiliu.workbench.exportManuscript(currentDraftId, { footnotes, citations: citationLabels }).then((exported) => {
    const out = document.getElementById('export-output');
    if (out) {
      out.hidden = false;
      out.textContent = exported.html;
    }
  });
});
document.getElementById('organize-topics')?.addEventListener('click', () => {
  void window.zhiliu.agent.organize().then(() => refreshWorkbench());
});
document.getElementById('agent-organize')?.addEventListener('click', () => {
  void window.zhiliu.agent.organize().then(() => refreshWorkbench());
});
document.getElementById('agent-ask')?.addEventListener('click', () => {
  const question = (document.getElementById('agent-question') as HTMLTextAreaElement).value.trim();
  if (!question) {
    return;
  }
  const status = document.getElementById('agent-status');
  if (status) {
    status.textContent = '检索中…';
  }
  void window.zhiliu.agent
    .chat(question)
    .then(() => {
      if (status) {
        status.textContent = '已回答';
      }
      return refreshWorkbench();
    })
    .catch((error: unknown) => {
      if (status) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });
});
document.getElementById('style-save')?.addEventListener('click', () => {
  const text = (document.getElementById('style-text') as HTMLTextAreaElement).value;
  void window.zhiliu.workbench.saveStyle(text).then(() => refreshWorkbench());
});
document.getElementById('style-rollback')?.addEventListener('click', () => {
  void window.zhiliu.workbench.rollbackStyle().then(() => refreshWorkbench());
});
document.getElementById('style-reset')?.addEventListener('click', () => {
  void window.zhiliu.workbench.resetStyle().then(() => refreshWorkbench());
});
document.getElementById('prompt-reset')?.addEventListener('click', () => {
  void window.zhiliu.workbench.resetPrompt().then(() => {
    const prompt = document.querySelector('#settings-form [name="prompt-override"]') as HTMLTextAreaElement;
    if (prompt) {
      prompt.value = '';
    }
  });
});
document.getElementById('manuscript-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const trial = target.closest<HTMLButtonElement>('[data-promote-trial]')?.dataset.promoteTrial;
  if (trial) {
    void window.zhiliu.workbench.promoteTrial(trial).then(() => refreshWorkbench());
    return;
  }
  const id = target.closest<HTMLButtonElement>('[data-draft-id]')?.dataset.draftId;
  if (!id) {
    return;
  }
  void window.zhiliu.workbench.view().then((bench) => {
    const draft = bench.manuscripts.find((item) => item.id === id);
    if (!draft) {
      return;
    }
    currentDraftId = draft.id;
    (document.getElementById('draft-title') as HTMLInputElement).value = draft.title;
    (document.getElementById('draft-body') as HTMLTextAreaElement).value = draft.body;
    setDraftPreview(draft.body);
    void renderCitations(draft.spans);
    const spans = document.getElementById('draft-spans');
    if (spans) {
      spans.replaceChildren();
      spans.hidden = draft.spans.length === 0 && draft.staleRefs.length === 0;
      if (draft.spans.length > 0) {
        spans.setAttribute('aria-label', '来源归属');
      } else {
        spans.removeAttribute('aria-label');
      }
      for (const span of draft.spans) {
        const mark = document.createElement('button');
        mark.type = 'button';
        mark.textContent = span.provenance === 'user' ? '用户' : span.provenance === 'ai' ? 'AI' : '来源';
        mark.dataset.provenance = span.provenance;
        if (span.noteId) {
          mark.dataset.jumpNote = span.noteId;
        } else if (span.sourceId) {
          mark.dataset.jumpSource = span.sourceId;
        }
        spans.append(mark, document.createTextNode(span.text), document.createElement('br'));
      }
      if (draft.staleRefs.length > 0) {
        const stale = document.createElement('p');
        stale.textContent = '证据已失效';
        spans.append(stale);
      }
    }
  });
});
document.getElementById('topic-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const pin = target.closest<HTMLButtonElement>('[data-pin-topic]')?.dataset.pinTopic;
  if (pin) {
    void window.zhiliu.workbench.view().then((bench) => {
      const topic = bench.topics.find((item) => item.id === pin);
      return window.zhiliu.workbench.pinTopic(pin, !topic?.pinned);
    }).then(() => refreshWorkbench());
    return;
  }
  const hide = target.closest<HTMLButtonElement>('[data-hide-topic]')?.dataset.hideTopic;
  if (hide) {
    void window.zhiliu.workbench.hideTopic(hide, true).then(() => refreshWorkbench());
    return;
  }
  const rename = target.closest<HTMLButtonElement>('[data-rename-topic]')?.dataset.renameTopic;
  if (rename) {
    const field = document.querySelector<HTMLInputElement>(`[data-rename-input="${rename}"]`);
    void window.zhiliu.workbench.renameTopic(rename, field?.value.trim() || '未命名主题').then(() => refreshWorkbench());
    return;
  }
  const split = target.closest<HTMLButtonElement>('[data-split-topic]')?.dataset.splitTopic;
  if (split) {
    void window.zhiliu.workbench.view().then((bench) => {
      const topic = bench.topics.find((item) => item.id === split);
      const last = topic?.noteIds.at(-1);
      return last ? window.zhiliu.workbench.splitTopic(split, [last]) : bench.topics;
    }).then(() => refreshWorkbench());
    return;
  }
  const mergeFrom = target.closest<HTMLButtonElement>('[data-merge-from]')?.dataset.mergeFrom;
  const mergeInto = target.closest<HTMLButtonElement>('[data-merge-from]')?.dataset.mergeInto;
  if (mergeFrom && mergeInto) {
    void window.zhiliu.workbench.mergeTopics(mergeFrom, mergeInto).then(() => refreshWorkbench());
    return;
  }
  const topicId = target.closest<HTMLButtonElement>('[data-proposal-topic]')?.dataset.proposalTopic;
  if (topicId) {
    void window.zhiliu.workbench.createProposal(topicId).then(() => refreshWorkbench());
  }
});
document.getElementById('proposal-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const generate = target.closest<HTMLButtonElement>('[data-generate-proposal]')?.dataset.generateProposal;
  if (generate) {
    const status = document.getElementById('agent-status');
    void window.zhiliu.workbench
      .generateFormal(generate)
      .then((draft) => {
        currentDraftId = draft.id;
        return refreshWorkbench();
      })
      .catch((error: unknown) => {
        if (status) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
      });
    return;
  }
  const thesisId = target.closest<HTMLButtonElement>('[data-set-thesis]')?.dataset.setThesis;
  if (thesisId) {
    const field = document.querySelector<HTMLTextAreaElement>(`[data-thesis-input="${thesisId}"]`);
    void window.zhiliu.workbench.setThesis(thesisId, field?.value.trim() || '未命名论点').then(() => refreshWorkbench());
    return;
  }
  const includeProposal = target.closest<HTMLButtonElement>('[data-include-proposal]')?.dataset.includeProposal;
  const includeEvidence = target.closest<HTMLButtonElement>('[data-include-evidence]')?.dataset.includeEvidence;
  const includeNext = target.closest<HTMLButtonElement>('[data-include-next]')?.dataset.includeNext;
  if (includeProposal && includeEvidence) {
    void window.zhiliu.workbench
      .includeEvidence(includeProposal, includeEvidence, includeNext !== 'false')
      .then(() => refreshWorkbench());
    return;
  }
  const proposalId = target.closest<HTMLButtonElement>('[data-confirm-proposal]')?.dataset.confirmProposal;
  const evidenceId = target.closest<HTMLButtonElement>('[data-confirm-evidence]')?.dataset.confirmEvidence;
  if (proposalId && evidenceId) {
    void window.zhiliu.workbench.confirmEvidence(proposalId, evidenceId).then(() => refreshWorkbench());
  }
});
document.getElementById('agent-chat')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (handleJump(target)) {
    return;
  }
  const turnId = target.closest<HTMLButtonElement>('[data-promote-turn]')?.dataset.promoteTurn;
  const index = target.closest<HTMLButtonElement>('[data-promote-index]')?.dataset.promoteIndex;
  if (turnId && index !== undefined) {
    void window.zhiliu.workbench.promoteChat(turnId, Number(index), '从对话里留下的想法。').then(() => refreshWorkbench());
  }
});
document.getElementById('draft-spans')?.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement) {
    handleJump(target);
  }
});
document.getElementById('revision-list')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const accept = target.closest<HTMLButtonElement>('[data-accept-revision]')?.dataset.acceptRevision;
  if (accept) {
    void window.zhiliu.agent.acceptRevision(accept).then(() => refreshThoughts());
    return;
  }
  const reject = target.closest<HTMLButtonElement>('[data-reject-revision]')?.dataset.rejectRevision;
  if (reject) {
    void window.zhiliu.agent.rejectRevision(reject).then(() => refreshThoughts());
    return;
  }
  const edit = target.closest<HTMLButtonElement>('[data-edit-revision]')?.dataset.editRevision;
  if (edit) {
    editingRevisionId = edit;
    void window.zhiliu.workbench.view().then((bench) => {
      const revision = bench.revisions.find((item) => item.id === edit);
      (document.getElementById('revision-edit-text') as HTMLTextAreaElement).value = revision?.text ?? '';
      (document.getElementById('revision-edit-dialog') as HTMLDialogElement).showModal();
    });
  }
});
document.getElementById('revision-edit-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!editingRevisionId) {
    return;
  }
  const text = (document.getElementById('revision-edit-text') as HTMLTextAreaElement).value;
  const id = editingRevisionId;
  editingRevisionId = null;
  (document.getElementById('revision-edit-dialog') as HTMLDialogElement).close();
  void window.zhiliu.agent.editRevision(id, text).then(async () => {
    await window.zhiliu.agent.acceptRevision(id);
    await refreshThoughts();
  });
});
document.getElementById('revision-edit-cancel')?.addEventListener('click', () => {
  editingRevisionId = null;
  (document.getElementById('revision-edit-dialog') as HTMLDialogElement).close();
});
document.getElementById('style-proposals')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const id = target.closest<HTMLButtonElement>('[data-confirm-style]')?.dataset.confirmStyle;
  if (id) {
    void window.zhiliu.workbench.confirmStyleProposal(id).then(() => refreshWorkbench());
  }
});
document.getElementById('citation-list')?.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.citationSource) {
    return;
  }
  citationLabels[target.dataset.citationSource] = target.value;
});
document.getElementById('thoughts-notes')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const revise = target.closest<HTMLButtonElement>('[data-revise-note]')?.dataset.reviseNote;
  if (revise) {
    void window.zhiliu.agent.revise(revise).then(() => refreshThoughts());
  }
});
document.getElementById('inbox-signal')?.addEventListener('click', onInboxClick);
document.getElementById('inbox-discovery')?.addEventListener('click', onInboxClick);

function onInboxClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const accept = target.closest<HTMLButtonElement>('[data-inbox-accept]')?.dataset.inboxAccept;
  if (accept) {
    void window.zhiliu.workbench.inboxAct(accept, 'accept').then(() => refreshWorkbench());
    return;
  }
  const ignore = target.closest<HTMLButtonElement>('[data-inbox-ignore]')?.dataset.inboxIgnore;
  if (ignore) {
    void window.zhiliu.workbench.inboxAct(ignore, 'ignore').then(() => refreshWorkbench());
    return;
  }
  const noteId = target.closest<HTMLButtonElement>('[data-inbox-note]')?.dataset.inboxNote;
  if (!noteId) {
    return;
  }
  const note = thoughtNotes.find((item) => item.id === noteId);
  if (note) {
    showSpace('library');
    void revealNote(note);
    return;
  }
  void window.zhiliu.notes.get(noteId).then((found) => {
    if (found) {
      showSpace('library');
      return revealNote(found);
    }
    return undefined;
  });
}

