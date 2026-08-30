import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { SaveModelSettingsInput, SaveNoteInput, SearchQueryOptions, TurnDirection } from '../shared/api';
import { createCredentialStore } from './credentials';
import { createEmbeddingAdapter } from './embeddings';
import { Library } from './library';
import { ModelSettings } from './models';
import { PreferenceStore } from './preferences';
import { Reading } from './reading';
import { SearchIndex } from './search';
import { UtilityWorkerHost } from './utility-host';
import { Vault } from './vault';

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
const library = new Library(vault, process.env);
const reading = new Reading(library, preferences);
const search = new SearchIndex(vault, library, createEmbeddingAdapter(process.env));
const models = new ModelSettings(preferences, createCredentialStore(app.getPath('userData'), process.env));
let utilityWorker: UtilityWorkerHost | null = null;
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

  void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  window.once('ready-to-show', () => {
    window.show();
  });
}

ipcMain.handle('vault:current', async () => vault.current());

ipcMain.handle('vault:choose', async () => {
  const stub = vault.stubbedChoice();
  if (stub) {
    const status = await vault.use(stub);
    await search.rebuild();
    return status;
  }
  const picked = await dialog.showOpenDialog({
    title: '选择知识库位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return vault.current();
  }
  const status = await vault.use(picked.filePaths[0]);
  await search.rebuild();
  return status;
});

ipcMain.handle('notes:save', async (_event, input: SaveNoteInput) => {
  const note = await vault.saveNote(input);
  await search.indexNote(note);
  return note;
});
ipcMain.handle('notes:get', async (_event, id: string) => vault.getNote(id));
ipcMain.handle('notes:listForSource', async (_event, sourceId: string) => vault.listNotesForSource(sourceId));
ipcMain.handle('search:query', async (_event, q: string, options?: SearchQueryOptions) =>
  search.query(typeof q === 'string' ? q : '', options),
);
ipcMain.handle('search:embedCalls', async () => search.embedCalls());
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
    await search.indexImportedSources();
    return result;
  }
  const picked = await dialog.showOpenDialog({
    title: '导入 EPUB',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { sources: await library.list(), failures: [] };
  }
  const result = await library.importPaths(picked.filePaths);
  await search.indexImportedSources();
  return result;
});

app.whenReady().then(async () => {
  utilityWorker = new UtilityWorkerHost();
  await vault.openFromEnvironment();
  await search.rebuild();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
