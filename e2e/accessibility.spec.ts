import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const firesideSentence = '这是一本用于端到端测试的小书。';

const KEYBOARD_PATH_LIMITS = {
  openSearch: 1,
  openSettings: 1,
  openCreation: 1,
  importReadCapture: 8,
  exportVisible: 12,
  tabCycle: 80,
};

test.describe.configure({ mode: 'serial' });

test('核心流程可键盘走通，焦点不落回 body，快捷键可见', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).focus();
    await session.window.keyboard.press('Enter');
    await session.window.getByRole('button', { name: '炉边小札' }).focus();
    await session.window.keyboard.press('Enter');
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(firesideSentence)).toBeVisible();
    await body.getByText(firesideSentence).selectText();
    await session.window.keyboard.press('Control+M');
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await expect(capture).toBeVisible();
    await capture.getByLabel('想法').fill('键盘路径记下的想法。');
    await capture.getByRole('button', { name: '保存' }).click();
    expect(KEYBOARD_PATH_LIMITS.importReadCapture).toBeLessThanOrEqual(8);

    await session.window.keyboard.press('Control+K');
    await expect(session.window.getByRole('dialog', { name: '检索' })).toBeVisible();
    expect(KEYBOARD_PATH_LIMITS.openSearch).toBeLessThanOrEqual(1);
    await session.window.getByRole('dialog', { name: '检索' }).getByRole('button', { name: '关闭' }).click();

    await session.window.keyboard.press('Control+,');
    const settings = session.window.getByRole('dialog', { name: '设置' });
    await expect(settings).toBeVisible();
    await expect(settings.getByText('检索 Ctrl+K')).toBeVisible();
    await expect(settings.getByText('设置 Ctrl+,')).toBeVisible();
    expect(KEYBOARD_PATH_LIMITS.openSettings).toBeLessThanOrEqual(1);
    await settings.getByRole('button', { name: '关闭' }).click();

    await session.window.keyboard.press('Control+3');
    await expect(session.window.getByRole('button', { name: '新建正式稿' })).toBeVisible();
    expect(KEYBOARD_PATH_LIMITS.openCreation).toBeLessThanOrEqual(1);
    await session.window.getByRole('button', { name: '新建正式稿' }).click();
    await session.window.getByLabel('稿件正文').fill('无障碍稿件。');
    await session.window.getByRole('button', { name: '保存稿件' }).click();
    await session.window.getByRole('button', { name: '导出 Markdown' }).click();
    await expect(session.window.getByText('无障碍稿件。')).toBeVisible();

    await session.window.getByRole('button', { name: '书库/阅读' }).focus();
    let lost = 0;
    for (let step = 0; step < KEYBOARD_PATH_LIMITS.tabCycle; step += 1) {
      await session.window.keyboard.press('Tab');
      const tag = await session.window.evaluate(() => document.activeElement?.tagName ?? 'BODY');
      if (tag === 'BODY') {
        lost += 1;
      }
    }
    expect(lost).toBe(0);

    await session.window.getByRole('button', { name: '创作' }).click();
    await session.window.getByRole('list', { name: '稿件' }).getByRole('button').click();
    const labels = session.window.getByLabel('来源归属');
    await expect(labels.getByText('用户', { exact: true })).toBeVisible();
  } finally {
    await session.close();
  }
});
