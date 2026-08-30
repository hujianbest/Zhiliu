import type { AtomicNote, ImportResult, IndexStatus, ModelRole, ModelSettingsView, ProbeResult, ReadingStatus, ReadingView, SearchHit, SearchKind, SearchMode, SourceDocument, SourceKind, TimelineEntry, TocEntry } from '../shared/api';

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
}

function rollbackDialog(): HTMLDialogElement {
  return document.getElementById('rollback-dialog') as HTMLDialogElement;
}

let pendingRollback: TimelineEntry | null = null;
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
    button.append(kind, quote, thought);
    item.append(button);
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
  const [notes, history] = await Promise.all([window.zhiliu.notes.list(), window.zhiliu.history.list()]);
  renderThoughtNotes(notes);
  renderHistory(history);
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
  if (settingsDialog().open || captureDialog().open || searchDialog().open || rollbackDialog().open || isTextEntry(event)) {
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
  const epub = /^epub:(\d+):(\d+):(\d+)$/.exec(value);
  if (!epub) {
    return null;
  }
  return { kind: 'epub', spineIndex: Number(epub[1]), start: Number(epub[2]), end: Number(epub[3]) };
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
    button.append(kind, title);
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
  void window.zhiliu.vault.choose().then((status) => {
    if (!status.firstRun) {
      showApp(false);
      void refreshLibrary();
    }
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
      return refreshAgent(view);
    });
});

void window.zhiliu.vault.current().then(async (status) => {
  showApp(status.firstRun);
  if (!status.firstRun) {
    void refreshAgent();
    await refreshLibrary();
    const view = await window.zhiliu.library.resume();
    if (view) {
      showReading(view);
    }
  }
});
