import { contextBridge, ipcRenderer } from 'electron';
import type { SaveModelSettingsInput, SaveNoteInput, ZhiliuApi } from '../shared/api';

const api: ZhiliuApi = {
  vault: {
    current: () => ipcRenderer.invoke('vault:current'),
    choose: () => ipcRenderer.invoke('vault:choose'),
    onChanged: (listener) => {
      const wrapped = () => listener();
      ipcRenderer.on('vault:changed', wrapped);
      return () => {
        ipcRenderer.off('vault:changed', wrapped);
      };
    },
  },
  notes: {
    save: (input: SaveNoteInput) => ipcRenderer.invoke('notes:save', input),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    list: () => ipcRenderer.invoke('notes:list'),
    listForSource: (sourceId) => ipcRenderer.invoke('notes:listForSource', sourceId),
    broken: () => ipcRenderer.invoke('notes:broken'),
    repair: (filePath, id) => ipcRenderer.invoke('notes:repair', filePath, id),
    conflicts: () => ipcRenderer.invoke('notes:conflicts'),
    resolveConflict: (filePath, keep) => ipcRenderer.invoke('notes:resolveConflict', filePath, keep),
  },
  search: {
    query: (q, options) => ipcRenderer.invoke('search:query', q, options),
    queryDetailed: (q, options) => ipcRenderer.invoke('search:queryDetailed', q, options),
    embedCalls: () => ipcRenderer.invoke('search:embedCalls'),
    seedBenchChunks: (count) => ipcRenderer.invoke('search:seedBenchChunks', count),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    rollback: (id) => ipcRenderer.invoke('history:rollback', id),
  },
  agent: {
    analyze: (channel) => ipcRenderer.invoke('agent:analyze', channel),
    latestTrace: () => ipcRenderer.invoke('agent:latestTrace'),
    organize: () => ipcRenderer.invoke('agent:organize'),
    chat: (question) => ipcRenderer.invoke('agent:chat', question),
    revise: (noteId) => ipcRenderer.invoke('agent:revise', noteId),
    acceptRevision: (id) => ipcRenderer.invoke('agent:acceptRevision', id),
    rejectRevision: (id) => ipcRenderer.invoke('agent:rejectRevision', id),
    runBackground: () => ipcRenderer.invoke('agent:runBackground'),
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
    importMarkdown: () => ipcRenderer.invoke('library:importMarkdown'),
    open: (id) => ipcRenderer.invoke('library:open', id),
    turn: (direction) => ipcRenderer.invoke('library:turn', direction),
    jump: (spineIndex) => ipcRenderer.invoke('library:jump', spineIndex),
    close: () => ipcRenderer.invoke('library:close'),
    resume: () => ipcRenderer.invoke('library:resume'),
    markRead: (id) => ipcRenderer.invoke('library:markRead', id),
    unmarkRead: (id) => ipcRenderer.invoke('library:unmarkRead', id),
    recordAgentLook: (sourceId) => ipcRenderer.invoke('library:recordAgentLook', sourceId),
  },
  workbench: {
    view: () => ipcRenderer.invoke('workbench:view'),
    saveBudgets: (input) => ipcRenderer.invoke('workbench:saveBudgets', input),
    savePrivacy: (input) => ipcRenderer.invoke('workbench:savePrivacy', input),
    savePrompt: (text) => ipcRenderer.invoke('workbench:savePrompt', text),
    resetPrompt: () => ipcRenderer.invoke('workbench:resetPrompt'),
    saveTriggers: (input) => ipcRenderer.invoke('workbench:saveTriggers', input),
    captureCrash: (payload) => ipcRenderer.invoke('workbench:captureCrash', payload),
    renameTopic: (id, title) => ipcRenderer.invoke('workbench:renameTopic', id, title),
    pinTopic: (id, pinned) => ipcRenderer.invoke('workbench:pinTopic', id, pinned),
    hideTopic: (id, hidden) => ipcRenderer.invoke('workbench:hideTopic', id, hidden),
    mergeTopics: (fromId, intoId) => ipcRenderer.invoke('workbench:mergeTopics', fromId, intoId),
    splitTopic: (id, noteIds) => ipcRenderer.invoke('workbench:splitTopic', id, noteIds),
    confirmEvidence: (proposalId, evidenceId) => ipcRenderer.invoke('workbench:confirmEvidence', proposalId, evidenceId),
    setThesis: (proposalId, thesis) => ipcRenderer.invoke('workbench:setThesis', proposalId, thesis),
    includeEvidence: (proposalId, evidenceId, included) =>
      ipcRenderer.invoke('workbench:includeEvidence', proposalId, evidenceId, included),
    createProposal: (topicId) => ipcRenderer.invoke('workbench:createProposal', topicId),
    createManuscript: (input) => ipcRenderer.invoke('workbench:createManuscript', input),
    saveManuscript: (input) => ipcRenderer.invoke('workbench:saveManuscript', input),
    finalize: (id) => ipcRenderer.invoke('workbench:finalize', id),
    unfinalize: (id) => ipcRenderer.invoke('workbench:unfinalize', id),
    generateFormal: (proposalId) => ipcRenderer.invoke('workbench:generateFormal', proposalId),
    promoteTrial: (id) => ipcRenderer.invoke('workbench:promoteTrial', id),
    exportManuscript: (id, options) => ipcRenderer.invoke('workbench:exportManuscript', id, options),
    promoteChat: (turnId, paragraphIndex, thought) =>
      ipcRenderer.invoke('workbench:promoteChat', turnId, paragraphIndex, thought),
    saveStyle: (text) => ipcRenderer.invoke('workbench:saveStyle', text),
    resetStyle: () => ipcRenderer.invoke('workbench:resetStyle'),
    rollbackStyle: () => ipcRenderer.invoke('workbench:rollbackStyle'),
    learnStyle: (manuscriptId) => ipcRenderer.invoke('workbench:learnStyle', manuscriptId),
    confirmStyleProposal: (id) => ipcRenderer.invoke('workbench:confirmStyleProposal', id),
    inboxAct: (id, action) => ipcRenderer.invoke('workbench:inboxAct', id, action),
  },
};

contextBridge.exposeInMainWorld('zhiliu', api);
