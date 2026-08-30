import { contextBridge, ipcRenderer } from 'electron';
import type { SaveModelSettingsInput, SaveNoteInput, ZhiliuApi } from '../shared/api';

const api: ZhiliuApi = {
  vault: {
    current: () => ipcRenderer.invoke('vault:current'),
    choose: () => ipcRenderer.invoke('vault:choose'),
  },
  notes: {
    save: (input: SaveNoteInput) => ipcRenderer.invoke('notes:save', input),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
  },
  models: {
    view: () => ipcRenderer.invoke('models:view'),
    save: (input: SaveModelSettingsInput) => ipcRenderer.invoke('models:save', input),
    probe: (input) => ipcRenderer.invoke('models:probe', input),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    importEpubs: () => ipcRenderer.invoke('library:import'),
    open: (id) => ipcRenderer.invoke('library:open', id),
    turn: (direction) => ipcRenderer.invoke('library:turn', direction),
  },
};

contextBridge.exposeInMainWorld('zhiliu', api);
