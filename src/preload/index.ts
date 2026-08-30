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
    list: () => ipcRenderer.invoke('notes:list'),
    listForSource: (sourceId) => ipcRenderer.invoke('notes:listForSource', sourceId),
  },
  search: {
    query: (q, options) => ipcRenderer.invoke('search:query', q, options),
    queryDetailed: (q, options) => ipcRenderer.invoke('search:queryDetailed', q, options),
    embedCalls: () => ipcRenderer.invoke('search:embedCalls'),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    rollback: (id) => ipcRenderer.invoke('history:rollback', id),
  },
  models: {
    view: () => ipcRenderer.invoke('models:view'),
    save: (input: SaveModelSettingsInput) => ipcRenderer.invoke('models:save', input),
    probe: (input) => ipcRenderer.invoke('models:probe', input),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    importEpubs: () => ipcRenderer.invoke('library:import'),
    importUrl: (url) => ipcRenderer.invoke('library:importUrl', url),
    open: (id) => ipcRenderer.invoke('library:open', id),
    turn: (direction) => ipcRenderer.invoke('library:turn', direction),
    jump: (spineIndex) => ipcRenderer.invoke('library:jump', spineIndex),
    close: () => ipcRenderer.invoke('library:close'),
    resume: () => ipcRenderer.invoke('library:resume'),
    markRead: (id) => ipcRenderer.invoke('library:markRead', id),
    unmarkRead: (id) => ipcRenderer.invoke('library:unmarkRead', id),
    recordAgentLook: (sourceId) => ipcRenderer.invoke('library:recordAgentLook', sourceId),
  },
};

contextBridge.exposeInMainWorld('zhiliu', api);
