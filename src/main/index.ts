import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { SaveModelSettingsInput, SaveNoteInput, TurnDirection } from '../shared/api';
import { createCredentialStore } from './credentials';
import { Library } from './library';
import { ModelSettings } from './models';
import { PreferenceStore } from './preferences';
import { Reading } from './reading';
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
const models = new ModelSettings(preferences, createCredentialStore(app.getPath('userData'), process.env));

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
    return vault.use(stub);
  }
  const picked = await dialog.showOpenDialog({
    title: '选择知识库位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return vault.current();
  }
  return vault.use(picked.filePaths[0]);
});

ipcMain.handle('notes:save', async (_event, input: SaveNoteInput) => vault.saveNote(input));
ipcMain.handle('notes:get', async (_event, id: string) => vault.getNote(id));
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
    return library.importPaths(stub);
  }
  const picked = await dialog.showOpenDialog({
    title: '导入 EPUB',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { sources: await library.list(), failures: [] };
  }
  return library.importPaths(picked.filePaths);
});

app.whenReady().then(async () => {
  await vault.openFromEnvironment();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
