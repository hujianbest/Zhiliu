import { existsSync } from 'node:fs';
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
import { Workbench } from './workbench';

app.setName('知流');

if (process.env.ZHILIU_USER_DATA) {
  app.setPath('userData', process.env.ZHILIU_USER_DATA);
}

function resolveAppIcon(): string | undefined {
  const files = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, '../../build/icon.icns'),
    path.join(process.resourcesPath, 'icon.icns'),
  ];
  return files.find((file) => existsSync(file));
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
const workbench = new Workbench(vault, search, agent, library);
search.attachWorkbench(workbench);
let mainWindow: BrowserWindow | null = null;
(globalThis as { __zhiliuPingWorker?: () => Promise<boolean> }).__zhiliuPingWorker = () => {
  if (!utilityWorker) {
    return Promise.reject(new Error('utilityProcess 尚未启动'));
  }
  return utilityWorker.ping();
};

function createWindow(): void {
  const icon = resolveAppIcon();
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4efe6',
    title: '知流',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
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
  if (note.path.endsWith('.conflict.md')) {
    await search.rebuild();
  } else {
    await search.indexNote(note);
  }
  await commitForNote(input, note.kind);
  if (await workbench.shouldRunOnNewNotes()) {
    void workbench.runBackground();
  }
  return note;
});
ipcMain.handle('notes:get', async (_event, id: string) => vault.getNote(id));
ipcMain.handle('notes:list', async () => vault.listNotes());
ipcMain.handle('notes:broken', async () => vault.listBroken());
ipcMain.handle('notes:conflicts', async () => vault.listConflicts());
ipcMain.handle('notes:resolveConflict', async (_event, filePath: string, keep: 'disk' | 'incoming') => {
  await vault.resolveConflict(typeof filePath === 'string' ? filePath : '', keep === 'incoming' ? 'incoming' : 'disk');
  await search.rebuild();
  await git.commit('解决冲突副本');
});
ipcMain.handle('notes:repair', async (_event, filePath: string, id: string) => {
  await vault.repairNote(filePath, id);
  await search.rebuild();
  await git.commit('修复笔记');
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

ipcMain.handle('agent:analyze', async (_event, channel?: 'interactive' | 'background') => {
  const used = channel === 'background' ? 'background' : 'interactive';
  if (!(await workbench.allow(used))) {
    throw new Error(used === 'background' ? '后台已暂停' : '已达到共享上限');
  }
  const view = await workbench.view();
  const outcome = await agent.analyze(used, view.prompt.version);
  await workbench.record(outcome.trace);
  await git.commit('分析知识库');
  return outcome;
});
ipcMain.handle('agent:latestTrace', async () => agent.latestTrace());
ipcMain.handle('agent:organize', async () => {
  const topics = await workbench.cluster();
  await git.commit('组织主题');
  return topics;
});
ipcMain.handle('agent:chat', async (_event, question: string) => {
  const turn = await workbench.chat(typeof question === 'string' ? question : '');
  await git.commit('知识库对话');
  return turn;
});
ipcMain.handle('agent:revise', async (_event, noteId: string) => {
  const revision = await workbench.revise(typeof noteId === 'string' ? noteId : '');
  await search.rebuild();
  await git.commit('生成并列修订');
  return revision;
});
ipcMain.handle('agent:acceptRevision', async (_event, id: string) => {
  await workbench.acceptRevision(typeof id === 'string' ? id : '');
  await search.rebuild();
  await git.commit('接受并列修订');
});
ipcMain.handle('agent:rejectRevision', async (_event, id: string) => {
  await workbench.rejectRevision(typeof id === 'string' ? id : '');
  await search.rebuild();
  await git.commit('拒绝并列修订');
});
ipcMain.handle('agent:editRevision', async (_event, id: string, text: string) => {
  await workbench.editRevision(typeof id === 'string' ? id : '', typeof text === 'string' ? text : '');
  await search.rebuild();
  await git.commit('编辑并列修订');
});
ipcMain.handle('agent:runBackground', async () => {
  const outcome = await workbench.runBackground();
  await git.commit('后台工作');
  return outcome;
});

ipcMain.handle('workbench:view', async () => workbench.view());
ipcMain.handle('workbench:saveBudgets', async (_event, input) => {
  const view = await workbench.saveBudgets(input);
  await git.commit('更新预算');
  return view;
});
ipcMain.handle('workbench:savePrivacy', async (_event, input) => {
  const view = await workbench.savePrivacy(input);
  await git.commit('更新隐私设置');
  return view;
});
ipcMain.handle('workbench:savePrompt', async (_event, text: string) => {
  const view = await workbench.savePrompt(typeof text === 'string' ? text : '');
  await git.commit('更新提示词');
  return view;
});
ipcMain.handle('workbench:resetPrompt', async () => {
  const view = await workbench.resetPrompt();
  await git.commit('恢复默认提示词');
  return view;
});
ipcMain.handle('workbench:saveTriggers', async (_event, input) => {
  const view = await workbench.saveTriggers(input);
  await git.commit('更新自动工作');
  return view;
});
ipcMain.handle('workbench:captureCrash', async (_event, payload) => workbench.crashReport(payload ?? {}));
ipcMain.handle('workbench:renameTopic', async (_event, id: string, title: string) => {
  const topic = await workbench.renameTopic(id, title);
  await git.commit('重命名主题');
  return topic;
});
ipcMain.handle('workbench:pinTopic', async (_event, id: string, pinned: boolean) => {
  const topic = await workbench.pinTopic(id, pinned);
  await git.commit(pinned ? '固定主题' : '取消固定主题');
  return topic;
});
ipcMain.handle('workbench:hideTopic', async (_event, id: string, hidden: boolean) => {
  const topic = await workbench.hideTopic(id, hidden);
  await git.commit(hidden ? '隐藏主题' : '取消隐藏主题');
  return topic;
});
ipcMain.handle('workbench:mergeTopics', async (_event, fromId: string, intoId: string) => {
  const topics = await workbench.mergeTopics(fromId, intoId);
  await git.commit('合并主题');
  return topics;
});
ipcMain.handle('workbench:splitTopic', async (_event, id: string, noteIds: string[]) => {
  const topics = await workbench.splitTopic(id, noteIds);
  await git.commit('拆分主题');
  return topics;
});
ipcMain.handle('workbench:createProposal', async (_event, topicId: string) => {
  const proposal = await workbench.createProposal(topicId);
  await git.commit('创建提案');
  return proposal;
});
ipcMain.handle('workbench:confirmEvidence', async (_event, proposalId: string, evidenceId: string) => {
  const proposal = await workbench.confirmEvidence(proposalId, evidenceId);
  await git.commit('确认提案证据');
  return proposal;
});
ipcMain.handle('workbench:setThesis', async (_event, proposalId: string, thesis: string) => {
  const proposal = await workbench.setThesis(proposalId, thesis);
  await git.commit('确认提案论点');
  return proposal;
});
ipcMain.handle('workbench:includeEvidence', async (_event, proposalId: string, evidenceId: string, included: boolean) => {
  const proposal = await workbench.includeEvidence(proposalId, evidenceId, included);
  await git.commit('纳入或排除提案证据');
  return proposal;
});
ipcMain.handle('workbench:createManuscript', async (_event, input) => {
  const draft = await workbench.createManuscript(input);
  await git.commit('保存稿件');
  return draft;
});
ipcMain.handle('workbench:saveManuscript', async (_event, input) => {
  const draft = await workbench.saveManuscript(input);
  await git.commit('保存稿件');
  await search.rebuild();
  return draft;
});
ipcMain.handle('workbench:finalize', async (_event, id: string) => {
  const draft = await workbench.finalize(id);
  await git.commit('定稿');
  await search.rebuild();
  return draft;
});
ipcMain.handle('workbench:unfinalize', async (_event, id: string) => {
  const draft = await workbench.unfinalize(id);
  await git.commit('撤回定稿');
  await search.rebuild();
  return draft;
});
ipcMain.handle('workbench:generateFormal', async (_event, proposalId: string) => {
  const draft = await workbench.generateFormal(proposalId);
  await git.commit('生成正式稿');
  return draft;
});
ipcMain.handle('workbench:promoteTrial', async (_event, id: string) => {
  const proposal = await workbench.promoteTrial(id);
  await git.commit('从试写预填提案');
  return proposal;
});
ipcMain.handle('workbench:exportManuscript', async (_event, id: string, options) => workbench.exportManuscript(id, options));
ipcMain.handle('workbench:promoteChat', async (_event, turnId: string, paragraphIndex: number, thought: string) => {
  const note = await workbench.promoteChat(turnId, paragraphIndex, thought);
  await search.indexNote(note);
  await git.commit('记下一条思想笔记');
  return note;
});
ipcMain.handle('workbench:saveStyle', async (_event, text: string) => {
  const style = await workbench.saveStyle(text);
  await git.commit('保存风格档案');
  return style;
});
ipcMain.handle('workbench:resetStyle', async () => {
  const style = await workbench.resetStyle();
  await git.commit('重置风格档案');
  return style;
});
ipcMain.handle('workbench:rollbackStyle', async () => {
  const style = await workbench.rollbackStyle();
  await git.commit('回滚风格档案');
  return style;
});
ipcMain.handle('workbench:learnStyle', async (_event, manuscriptId: string) => {
  const proposal = await workbench.learnStyle(manuscriptId);
  await git.commit('提出风格更新');
  return proposal;
});
ipcMain.handle('workbench:confirmStyleProposal', async (_event, id: string) => {
  const style = await workbench.confirmStyleProposal(id);
  await git.commit('确认风格更新');
  return style;
});
ipcMain.handle('workbench:inboxAct', async (_event, id: string, action: 'accept' | 'ignore') => {
  const inbox = await workbench.inboxAct(id, action);
  await git.commit(action === 'accept' ? '采纳收件箱建议' : '忽略收件箱建议');
  return inbox;
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    const icon = resolveAppIcon();
    if (icon) {
      try {
        app.dock.setIcon(icon);
      } catch {
        // Dock icon is best-effort for unpackaged launches.
      }
    }
  }
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
