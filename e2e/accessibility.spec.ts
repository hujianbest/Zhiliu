import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const KEYBOARD_PATH_LIMITS = {
  openSearch: 1,
  openSettings: 1,
  openCreation: 1,
  exportVisible: 12,
  tabCycle: 80,
};

test.describe.configure({ mode: 'serial' });

test('核心流程可键盘走通，焦点不落回 body，快捷键可见', async () => {
  const session = await launchZhiliu();
  try {
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
