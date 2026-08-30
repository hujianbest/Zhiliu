import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const execFileAsync = promisify(execFile);
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const twoChapters = path.join(fixtures, 'two-chapters.epub');
const firesideSentence = '这是一本用于端到端测试的小书。';

test.describe.configure({ mode: 'serial' });

async function configureModels(page: Page, baseUrl: string, apiKey = 'e2e-fake-key'): Promise<void> {
  await page.evaluate(
    async ({ baseUrl: url, apiKey: key }) => {
      await window.zhiliu.models.save({
        fast: { baseUrl: url, model: 'fake-fast', apiKey: key },
        deep: { baseUrl: url, model: 'fake-deep', apiKey: key },
      });
    },
    { baseUrl, apiKey },
  );
}

test('后台预算耗尽后暂停，交互式分析仍可用，用量为估算', async () => {
  const session = await launchZhiliu();
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    await session.window.evaluate(async () => {
      await window.zhiliu.workbench.saveBudgets({
        dailyTokens: 0,
        monthlyTokens: 0,
        dailyRequests: 0,
        monthlyRequests: 0,
        sharedHardCap: false,
      });
      await window.zhiliu.workbench.saveTriggers({ enabled: true, onNewNotes: false });
      await window.zhiliu.notes.save({ quotation: '预算引文。', thought: '分析这些摘录。' });
    });
    const paused = await session.window.evaluate(async () => window.zhiliu.agent.runBackground());
    expect(paused.status).toContain('暂停');
    const still = await session.window.evaluate(async () => window.zhiliu.agent.analyze('interactive'));
    expect(still.status).toBe('分析完成');
    const view = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(view.usage.interactive.requests).toBeGreaterThanOrEqual(1);
    expect(view.usage.interactive.estimated).toBeTruthy();
    expect(view.usage.paused).toBeTruthy();
    await expect(session.window.getByLabel('后台每日请求数')).toHaveCount(0);
    await session.window.getByRole('button', { name: '设置', exact: true }).click();
    await expect(session.window.getByLabel('后台每日请求数')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('跨来源聚类产生主题，未读状态不变，组织操作为一次提交', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside, twoChapters] });
  const vault = session.vaultPath as string;
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const sources = await session.window.evaluate(async () => window.zhiliu.library.list());
    expect(sources[0]?.readingStatus).toBe('unread');
    await session.window.evaluate(async (ids) => {
      await window.zhiliu.notes.save({ quotation: '炉火跨源。', thought: '青瓷灯芯把两本书连起来。', sourceId: ids[0] });
      await window.zhiliu.notes.save({ quotation: '南巷跨源。', thought: '青瓷灯芯在另一本书里也出现。', sourceId: ids[1] });
      await window.zhiliu.notes.save({ quotation: '第三句。', thought: '青瓷灯芯足够成为思想线索。', sourceId: ids[0] });
    }, sources.map((item) => item.id));
    await session.window.getByRole('button', { name: '组织主题' }).first().click();
    await session.window.getByRole('button', { name: '创作' }).click();
    await expect(session.window.getByRole('list', { name: '主题' }).getByText('思想线索')).toBeVisible();
    const after = await session.window.evaluate(async () => window.zhiliu.library.list());
    expect(after[0]?.readingStatus).toBe('unread');
    const { stdout } = await execFileAsync('git', ['log', '--format=%s', '-n', '5'], { cwd: vault });
    expect(stdout.split('\n')).toContain('组织主题');
  } finally {
    await session.close();
  }
});

test('知识库对话分段带来源或 AI 归属，部分索引会明示', async () => {
  const session = await launchZhiliu();
  try {
    await session.window.evaluate(async () => {
      await window.zhiliu.notes.save({ quotation: '炉火旁的证据。', thought: '青瓷对话探针。' });
    });
    await session.window.getByLabel('提问').fill('青瓷对话探针意味着什么？');
    await session.window.getByRole('button', { name: '提问', exact: true }).click();
    const chat = session.window.getByRole('list', { name: '对话' });
    await expect(chat.getByText('有来源支撑')).toBeVisible();
    await expect(chat.getByText('模型补充')).toBeVisible();
    const turn = await session.window.evaluate(async () => {
      const view = await window.zhiliu.workbench.view();
      return view.chats.at(-1);
    });
    expect(turn?.paragraphs.every((item) => item.provenance === 'source' || item.provenance === 'ai')).toBeTruthy();
    expect(turn?.paragraphs.some((item) => item.provenance === 'user')).toBeFalsy();
  } finally {
    await session.close();
  }
});

test('手工正式稿预览、定稿才进检索、撤回后不再命中', async () => {
  const session = await launchZhiliu();
  const unique = '定稿检索独角鲸探针';
  try {
    await session.window.getByRole('button', { name: '创作' }).click();
    await session.window.getByRole('button', { name: '新建正式稿' }).click();
    await session.window.getByLabel('稿件标题').fill('一篇正式稿');
    await session.window.getByLabel('稿件正文').fill(unique);
    await expect(session.window.getByLabel('预览')).toContainText(unique);
    await session.window.getByRole('button', { name: '保存稿件' }).click();
    const before = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), unique);
    expect(before.some((hit) => hit.snippet.includes(unique))).toBeFalsy();
    await session.window.getByRole('button', { name: '定稿' }).click();
    const after = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), unique);
    expect(after.some((hit) => hit.kind === 'draft' && hit.snippet.includes(unique))).toBeTruthy();
    await session.window.getByRole('button', { name: '撤回定稿' }).click();
    const again = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), unique);
    expect(again.some((hit) => hit.snippet.includes(unique))).toBeFalsy();
  } finally {
    await session.close();
  }
});

test('提示词覆盖反映到生成留痕版本，恢复默认后改回', async () => {
  const session = await launchZhiliu();
  const vault = session.vaultPath as string;
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    await session.window.evaluate(async () => {
      await window.zhiliu.workbench.savePrompt('自定义覆盖提示词。');
      await window.zhiliu.notes.save({ quotation: '覆盖引文。', thought: '分析这些摘录。' });
      await window.zhiliu.agent.analyze();
    });
    const overridden = await session.window.evaluate(async () => window.zhiliu.agent.latestTrace());
    expect(overridden?.promptVersion).toBe('override-v1');
    await session.window.evaluate(async () => {
      await window.zhiliu.workbench.resetPrompt();
      await window.zhiliu.agent.analyze();
    });
    const restored = await session.window.evaluate(async () => window.zhiliu.agent.latestTrace());
    expect(restored?.promptVersion).toBe('builtin-v1');
    const { stdout } = await execFileAsync('git', ['ls-files'], { cwd: vault });
    expect(stdout).toContain('.zhiliu/workbench.json');
  } finally {
    await session.close();
  }
});

test('遥测默认关闭；开启崩溃报告后负载不含原文与路径', async () => {
  const session = await launchZhiliu();
  try {
    const off = await session.window.evaluate(async () =>
      window.zhiliu.workbench.captureCrash({
        message: 'crash at /home/user/vault/notes/secret.md 炉火原文 sk-secret',
      }),
    );
    expect(off.outbound).toBeNull();
    await session.window.evaluate(async () => window.zhiliu.workbench.savePrivacy({ telemetry: false, crashReports: true }));
    const on = await session.window.evaluate(async () =>
      window.zhiliu.workbench.captureCrash({
        message: 'crash at /home/user/vault/notes/secret.md 炉火原文 sk-secret',
      }),
    );
    expect(on.outbound).toBeTruthy();
    expect(JSON.stringify(on.outbound)).not.toContain('/home/user');
    expect(JSON.stringify(on.outbound)).not.toContain('炉火原文');
    expect(JSON.stringify(on.outbound)).not.toContain('sk-secret');
    await session.window.getByRole('button', { name: '设置', exact: true }).click();
    await expect(session.window.getByText(/明文 Markdown/)).toBeVisible();
  } finally {
    await session.close();
  }
});

test('并列修订不改原文，检索顺序为用户、来源、AI', async () => {
  const session = await launchZhiliu();
  const word = '并列修订探针词';
  try {
    const note = await session.window.evaluate(async (w) => {
      const thought = await window.zhiliu.notes.save({ quotation: `${w} 引文。`, thought: `${w} 我的想法。` });
      await window.zhiliu.notes.save({ quotation: `${w} 摘录。` });
      return thought;
    }, word);
    const original = await session.window.evaluate(async (id) => {
      const found = await window.zhiliu.notes.get(id);
      return found;
    }, note.id);
    await session.window.evaluate(async (id) => window.zhiliu.agent.revise(id), note.id);
    const after = await session.window.evaluate(async (id) => window.zhiliu.notes.get(id), note.id);
    expect(after?.thought).toBe(original?.thought);
    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), word);
    const provenances = hits.filter((hit) => hit.snippet.includes(word)).map((hit) => hit.provenance);
    expect(provenances[0]).toBe('user');
    expect(provenances.includes('source')).toBeTruthy();
    expect(provenances.includes('ai')).toBeTruthy();
    expect(provenances.indexOf('user')).toBeLessThan(provenances.indexOf('source'));
    expect(provenances.indexOf('source')).toBeLessThan(provenances.indexOf('ai'));
  } finally {
    await session.close();
  }
});
