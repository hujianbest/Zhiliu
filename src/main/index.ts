import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { SaveModelSettingsInput, SaveNoteInput, SearchQueryOptions, TurnDirection } from '../shared/api';
import { AgentRuntime } from './agent';
import { createCredentialStore } from './credentials';
import { createEmbeddingAdapter } from './embeddings';
import { VaultGit } from './git';
import { Library } from './library';
import { MarkdownImporter } from './markdown-import';
import { ModelSettings } from './models';
import { PreferenceStore } from './preferences';
import { Reading } from './reading';
import { SearchIndex } from './search';
import { UtilityWorkerHost } from './utility-host';
import { Vault } from './vault';
import { VaultWatcher } from './watcher';

if (process.env.ZHILIU_USER_DATA) {
  app.setPath('userData', process.env.ZHILIU_USER_DATA);
}

if (process.env.ZHILIU_E2E === '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.disableHardwareAcceleration();
}

const preferences = new PreferenceStore(app.getPath('userData'));
const vault = new Vault(preferences, process.env);
const git = new VaultGit(() => vault.path);
const library = new Library(vault, process.env);
const reading = new Reading(library, preferences);
let utilityWorker: UtilityWorkerHost | null = null;
const search = new SearchIndex(vault, library, createEmbeddingAdapter(process.env, () => utilityWorker));
const models = new ModelSettings(preferences, createCredentialStore(app.getPath('userData'), process.env));
const markdown = new MarkdownImporter(vault);
const agent = new AgentRuntime(vault, models, search, process.env);
const watcher = new VaultWatcher(vault, search);
let mainWindow: BrowserWindow | null = null;
(globalThis as { __zhiliuPingWorker?: () => Promise<boolean> }).__zhiliuPingWorker = () => {
  if (!utilityWorker) {
    return Promise.reject(new Error('utilityProcess 尚未启动'));
  }
  return utilityWorker.ping();
};

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4efe6',
    title: '知流',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  window.once('ready-to-show', () => {
    window.show();
  });
}

async function openVault(vaultPath: string) {
  const status = await vault.use(vaultPath);
  await git.commit('创建知识库');
  await search.rebuild();
  watcher.start();
  return status;
}

function commitForNote(input: SaveNoteInput, kind: 'excerpt' | 'thought_note'): Promise<void> {
  if (input.id) {
    return git.commit('更新一条笔记');
  }
  return git.commit(kind === 'excerpt' ? '记下一条摘录' : '记下一条思想笔记');
}

ipcMain.handle('vault:current', async () => vault.current());

ipcMain.handle('vault:choose', async () => {
  const stub = vault.stubbedChoice();
  if (stub) {
    return openVault(stub);
  }
  const picked = await dialog.showOpenDialog({
    title: '选择知识库位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return vault.current();
  }
  return openVault(picked.filePaths[0]);
});

ipcMain.handle('notes:save', async (_event, input: SaveNoteInput) => {
  const note = await vault.saveNote(input);
  await search.indexNote(note);
  await commitForNote(input, note.kind);
  return note;
});
ipcMain.handle('notes:get', async (_event, id: string) => vault.getNote(id));
ipcMain.handle('notes:list', async () => vault.listNotes());
ipcMain.handle('notes:broken', async () => vault.listBroken());
ipcMain.handle('notes:conflicts', async () => vault.listConflicts());
ipcMain.handle('notes:resolveConflict', async (_event, filePath: string, keep: 'disk' | 'incoming') => {
  await vault.resolveConflict(typeof filePath === 'string' ? filePath : '', keep === 'incoming' ? 'incoming' : 'disk');
  await search.rebuild();
  await git.commit('更新一条笔记');
});
ipcMain.handle('notes:repair', async (_event, filePath: string, id: string) => {
  await vault.repairNote(filePath, id);
  await search.rebuild();
  await git.commit('更新一条笔记');
});
ipcMain.handle('notes:listForSource', async (_event, sourceId: string) => vault.listNotesForSource(sourceId));
ipcMain.handle('history:list', async () => git.history());
ipcMain.handle('history:rollback', async (_event, id: string) => {
  await git.rollback(typeof id === 'string' ? id : '');
  await search.rebuild();
  return git.history();
});
ipcMain.handle('search:query', async (_event, q: string, options?: SearchQueryOptions) =>
  search.query(typeof q === 'string' ? q : '', options),
);
ipcMain.handle('search:queryDetailed', async (_event, q: string, options?: SearchQueryOptions) =>
  search.queryDetailed(typeof q === 'string' ? q : '', options),
);
ipcMain.handle('search:embedCalls', async () => search.embedCalls());
ipcMain.handle('search:seedBenchChunks', async (_event, count: number) => {
  await search.seedBenchChunks(typeof count === 'number' ? count : 0);
});
ipcMain.handle('models:view', async () => models.view());
ipcMain.handle('models:save', async (_event, input: SaveModelSettingsInput) => models.save(input));
ipcMain.handle(
  'models:probe',
  async (_event, input: { baseUrl: string; apiKey: string; role?: 'fast' | 'deep' }) => models.probe(input),
);

ipcMain.handle('library:list', async () => library.list());
ipcMain.handle('library:open', async (_event, id: string) => reading.open(id));
ipcMain.handle('library:turn', async (_event, direction: TurnDirection) => reading.turn(direction));
ipcMain.handle('library:jump', async (_event, spineIndex: number) => reading.jump(spineIndex));
ipcMain.handle('library:close', async () => reading.close());
ipcMain.handle('library:resume', async () => reading.resume());
ipcMain.handle('library:markRead', async (_event, id: string) => reading.markRead(id));
ipcMain.handle('library:unmarkRead', async (_event, id: string) => reading.unmarkRead(id));
ipcMain.handle('library:recordAgentLook', async (_event, sourceId: string) =>
  reading.recordAgentLook(sourceId),
);

ipcMain.handle('library:import', async () => {
  const stub = library.stubbedFiles();
  if (stub) {
    const result = await library.importPaths(stub);
    await git.commit('导入来源文档');
    void search.indexImportedSources();
    return result;
  }
  const picked = await dialog.showOpenDialog({
    title: '导入 EPUB 或 PDF',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'EPUB 与 PDF', extensions: ['epub', 'pdf'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'PDF', extensions: ['pdf'] },
    ],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { sources: await library.list(), failures: [] };
  }
  const result = await library.importPaths(picked.filePaths);
  await git.commit('导入来源文档');
  void search.indexImportedSources();
  return result;
});

ipcMain.handle('library:importUrl', async (_event, url: string) => {
  const result = await library.importUrl(typeof url === 'string' ? url : '');
  if (result.failures.length === 0) {
    await git.commit('导入来源文档');
    void search.indexImportedSources();
  }
  return result;
});

ipcMain.handle('library:importMarkdown', async () => {
  const stub = markdown.stubbedDirectory(process.env);
  if (stub) {
    const report = await markdown.importFolder(stub);
    await git.commit('导入来源文档');
    await search.rebuild();
    return report;
  }
  const picked = await dialog.showOpenDialog({
    title: '导入 Markdown 文件夹',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { reportPath: '', copied: 0, renamed: [], unmapped: [] };
  }
  const report = await markdown.importFolder(picked.filePaths[0]);
  await git.commit('导入来源文档');
  await search.rebuild();
  return report;
});

ipcMain.handle('agent:analyze', async () => {
  const outcome = await agent.analyze();
  await git.commit('分析知识库');
  return outcome;
});
ipcMain.handle('agent:latestTrace', async () => agent.latestTrace());

app.whenReady().then(async () => {
  utilityWorker = new UtilityWorkerHost();
  await vault.openFromEnvironment();
  await git.commit('创建知识库');
  await search.rebuild();
  watcher.onChange(() => {
    mainWindow?.webContents.send('vault:changed');
  });
  watcher.start();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
