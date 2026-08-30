import type { ImportResult, IndexStatus, ModelRole, ModelSettingsView, ProbeResult, ReadingStatus, ReadingView, SourceDocument, TocEntry } from '../shared/api';

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
  reading: '阅读中',
  read: '已读',
};

let currentSourceId: string | null = null;
let currentStatus: ReadingStatus = 'unread';

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
  if (settingsDialog().open || isTextEntry(event)) {
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
  frame.onload = () => bindFrameKeys(frame);
  frame.srcdoc = readerDocument(view.html);
  renderToc(view.toc);
  currentSourceId = view.sourceId;
  renderReadFlag(view.status);
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
  currentSourceId = null;
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
