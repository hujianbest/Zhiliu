import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const selectable = path.join(fixtures, 'selectable-notes.pdf');
const firesideSentence = '这是一本用于端到端测试的小书。';
const shots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.scratch/demo-walk');

test.describe.configure({ mode: 'serial' });

test('演示路径：选择知识库、导入、阅读捕获、提案、正式稿、导出', async () => {
  test.skip(!process.env.ZHILIU_WALK, '本地演示自测，设置 ZHILIU_WALK=1 后运行');
  test.setTimeout(180_000);
  await mkdir(shots, { recursive: true });
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'zhiliu-walk-'));
  const session = await launchZhiliu({
    unpackaged: true,
    vaultPath: null,
    chooseDirectory: vaultDir,
    chooseFiles: [fireside, selectable],
  });
  const shot = (name: string) => session.window.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  try {
    await expect(session.window.getByRole('button', { name: '选择知识库位置' })).toBeVisible();
    await session.window.getByRole('button', { name: '选择知识库位置' }).click();
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await shot('01-library');

    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await expect(session.window.getByRole('listitem').filter({ hasText: '炉边小札' })).toBeVisible();
    await expect(session.window.getByRole('listitem').filter({ hasText: 'selectable-notes' })).toBeVisible();
    await shot('02-imported');

    await session.window.evaluate(async (url) => {
      await window.zhiliu.models.save({
        fast: { baseUrl: url, model: 'fake-fast', apiKey: 'e2e-fake-key' },
        deep: { baseUrl: url, model: 'fake-deep', apiKey: 'e2e-fake-key' },
      });
    }, session.fakeOpenAI.baseUrl);

    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(firesideSentence)).toBeVisible();
    for (const thought of ['青瓷线索一。', '青瓷线索二。', '青瓷线索三。']) {
      await body.getByText(firesideSentence).selectText();
      await session.window.getByRole('button', { name: '记下这段' }).click();
      const capture = session.window.getByRole('dialog', { name: '记下这段' });
      await capture.getByLabel('想法').fill(thought);
      await capture.getByLabel('想法').press('Enter');
      await expect(capture).toBeHidden();
    }
    await shot('03-reading');

    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    await expect(session.window.getByRole('heading', { name: '思想', exact: true })).toBeVisible();
    await expect(session.window.getByRole('button', { name: '记下这段' })).toBeHidden();
    await expect(session.window.getByRole('list', { name: '全部笔记' }).getByText('青瓷线索一。')).toBeVisible();
    await session.window.getByRole('button', { name: '生成修订' }).first().click();
    await expect(session.window.getByRole('button', { name: '接受' })).toBeVisible();
    await expect(session.window.getByRole('button', { name: '拒绝' })).toBeVisible();
    await expect(session.window.getByRole('list', { name: '并列修订' })).not.toContainText('{"summary"');
    await shot('04-thoughts');

    await session.window.getByRole('button', { name: '创作', exact: true }).click();
    await session.window.getByRole('button', { name: '组织主题（主栏）' }).click();
    await expect(session.window.getByRole('list', { name: '主题' }).getByText('· 思想线索').first()).toBeVisible();
    await session.window
      .getByRole('list', { name: '主题' })
      .locator('li')
      .filter({ hasText: '· 思想线索' })
      .getByRole('button', { name: '生成提案' })
      .click();
    await session.window.getByLabel('提案论点').fill('青瓷值得写成一篇。');
    await session.window.getByRole('button', { name: '确认论点' }).click();
    const thoughtConfirms = session.window.getByRole('button', { name: /^确认：青瓷线索/ });
    await expect(thoughtConfirms).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await thoughtConfirms.first().click();
      await expect(session.window.getByRole('button', { name: /^已确认：青瓷线索/ })).toHaveCount(i + 1);
    }
    await expect(session.window.getByRole('button', { name: '生成正式稿' })).toBeEnabled();
    await session.window.getByRole('button', { name: '生成正式稿' }).click();
    await expect
      .poll(async () => session.window.getByRole('list', { name: '稿件' }).getByRole('button').filter({ hasText: '正式' }).count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    await session.window.getByRole('list', { name: '稿件' }).getByRole('button').filter({ hasText: '正式' }).first().click();
    await expect(session.window.getByLabel('来源归属').getByText('用户', { exact: true }).first()).toBeVisible();
    await shot('05-draft');

    await session.window.getByRole('button', { name: '定稿', exact: true }).click();
    await session.window.getByRole('button', { name: '导出 Markdown' }).click();
    await expect(session.window.getByText('## 来源')).toBeVisible();
    await expect(session.window.getByRole('button', { name: '确认样本' })).toBeVisible();
    await session.window.getByRole('button', { name: '确认样本' }).click();
    await shot('06-export-style');

    await session.window.getByLabel('提问').fill('青瓷线索是什么？');
    await session.window.getByRole('button', { name: '提问' }).click();
    await expect(session.window.getByRole('list', { name: '对话' }).getByRole('listitem').first()).toBeVisible({
      timeout: 20_000,
    });
    await shot('07-agent');
  } finally {
    await session.close();
  }
});
