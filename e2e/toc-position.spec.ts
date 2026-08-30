import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const twoChapters = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'two-chapters.epub');

test.describe.configure({ mode: 'serial' });

test('打开目录可以跳到对应章节，快捷键 T 可开合目录', async () => {
  const session = await launchZhiliu({ chooseFiles: [twoChapters] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '双章试读' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toBeVisible();

    const tocButton = session.window.getByRole('button', { name: '目录', exact: true });
    await expect(tocButton).toBeVisible();
    await expect(tocButton).toHaveAttribute('title', /目录（T）/);

    await tocButton.click();
    const toc = session.window.getByRole('dialog', { name: '目录' });
    await expect(toc).toBeVisible();
    await expect(toc.getByRole('button', { name: '第一章' })).toBeVisible();
    await expect(toc.getByRole('button', { name: '第二章' })).toBeVisible();

    await toc.getByRole('button', { name: '第二章' }).click();
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toHaveCount(0);
    await expect(toc).toBeHidden();

    await session.window.keyboard.press('T');
    await expect(toc).toBeVisible();
    await session.window.keyboard.press('T');
    await expect(toc).toBeHidden();

    await session.window.keyboard.press('T');
    await expect(toc).toBeVisible();
    await session.window.keyboard.press('Escape');
    await expect(toc).toBeHidden();

    await session.window.getByRole('button', { name: '设置', exact: true }).click();
    await session.window.getByLabel('快速/低成本 接口地址').fill('');
    await session.window.getByLabel('快速/低成本 接口地址').pressSequentially('T');
    await expect(session.window.getByLabel('快速/低成本 接口地址')).toHaveValue('T');
    await expect(toc).toBeHidden();
  } finally {
    await session.close();
  }
});

test('关闭应用后重新打开会回到上次阅读的章节', async () => {
  const first = await launchZhiliu({
    chooseFiles: [twoChapters],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  try {
    await first.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await first.window.getByRole('button', { name: '双章试读' }).click();
    await first.window.getByRole('button', { name: '下一章' }).click();
    const body = first.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    await expect(second.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    const body = second.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toHaveCount(0);
  } finally {
    await second.close();
  }
});

test('返回书库后再启动停在书库，重新打开仍落在上次章节', async () => {
  const first = await launchZhiliu({
    chooseFiles: [twoChapters],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  try {
    await first.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await first.window.getByRole('button', { name: '双章试读' }).click();
    await first.window.getByRole('button', { name: '下一章' }).click();
    const body = first.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
    await first.window.getByRole('button', { name: '返回书库' }).click();
    await expect(first.window.getByRole('button', { name: '双章试读' })).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    await expect(second.window.getByRole('button', { name: '双章试读' })).toBeVisible();
    await expect(second.window.getByRole('button', { name: '返回书库' })).toHaveCount(0);
    await second.window.getByRole('button', { name: '双章试读' }).click();
    const body = second.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
  } finally {
    await second.close();
  }
});

test('阅读状态只随本地阅读或显式标记变化，Shift+R 可切换已读', async () => {
  const first = await launchZhiliu({
    chooseFiles: [twoChapters],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  try {
    await first.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const item = first.window.getByRole('listitem').filter({ hasText: '双章试读' });
    await expect(item.getByText('未读')).toBeVisible();

    await first.window.getByRole('button', { name: '双章试读' }).click();
    await expect(first.window.locator('#library-reader').getByText('在读', { exact: true })).toBeVisible();

    const mark = first.window.getByRole('button', { name: '标记已读' });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute('title', /Shift\+R/);
    await mark.click();
    await expect(first.window.locator('#library-reader').getByText('已读', { exact: true })).toBeVisible();
    await expect(first.window.getByRole('button', { name: '撤销已读' })).toBeVisible();

    await first.window.getByRole('button', { name: '返回书库' }).click();
    await expect(item.getByText('已读')).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    const item = second.window.getByRole('listitem').filter({ hasText: '双章试读' });
    await expect(item.getByText('已读')).toBeVisible();

    await second.window.getByRole('button', { name: '双章试读' }).click();
    await expect(second.window.locator('#library-reader').getByText('已读', { exact: true })).toBeVisible();
    const unmark = second.window.getByRole('button', { name: '撤销已读' });
    await expect(unmark).toHaveAttribute('title', /Shift\+R/);
    await unmark.click();
    await expect(second.window.locator('#library-reader').getByText('在读', { exact: true })).toBeVisible();

    await second.window.keyboard.press('Shift+R');
    await expect(second.window.locator('#library-reader').getByText('已读', { exact: true })).toBeVisible();
    await second.window.keyboard.press('Shift+R');
    await expect(second.window.locator('#library-reader').getByText('在读', { exact: true })).toBeVisible();
  } finally {
    await second.close();
  }
});

test('读到末章会变为已读，撤销后回到在读', async () => {
  const session = await launchZhiliu({ chooseFiles: [twoChapters] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '双章试读' }).click();
    await expect(session.window.locator('#library-reader').getByText('在读', { exact: true })).toBeVisible();

    await session.window.getByRole('button', { name: '下一章' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
    await expect(session.window.locator('#library-reader').getByText('已读', { exact: true })).toBeVisible();

    await session.window.getByRole('button', { name: '撤销已读' }).click();
    await expect(session.window.locator('#library-reader').getByText('在读', { exact: true })).toBeVisible();
    await expect(session.window.locator('#library-reader').getByText('已读', { exact: true })).toHaveCount(0);

    await session.window.getByRole('button', { name: '上一章' }).click();
    await session.window.getByRole('button', { name: '目录', exact: true }).click();
    await session.window.getByRole('dialog', { name: '目录' }).getByRole('button', { name: '第二章' }).click();
    await expect(session.window.locator('#library-reader').getByText('已读', { exact: true })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('模型对来源的分析或摘要不会把书标为已读', async () => {
  const first = await launchZhiliu({
    chooseFiles: [twoChapters],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  let sourceId = '';
  try {
    await first.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const item = first.window.getByRole('listitem').filter({ hasText: '双章试读' });
    await expect(item.getByText('未读')).toBeVisible();

    sourceId = await first.window.evaluate(async () => {
      const sources = await window.zhiliu.library.list();
      return sources[0]?.id ?? '';
    });
    expect(sourceId.length).toBeGreaterThan(8);

    await first.window.evaluate(
      async ({ baseUrl, id }) => {
        await window.zhiliu.models.probe({ baseUrl, apiKey: 'e2e-fake-key' });
        await window.zhiliu.library.recordAgentLook(id);
      },
      { baseUrl: first.fakeOpenAI.baseUrl, id: sourceId },
    );

    await mkdir(path.join(vaultPath, '.zhiliu', 'cache'), { recursive: true });
    await writeFile(
      path.join(vaultPath, '.zhiliu', 'cache', `analysis-${sourceId}.json`),
      `${JSON.stringify({ sourceId, summary: '模型认为这本书已经读完。' }, null, 2)}\n`,
      'utf8',
    );

    await expect(item.getByText('未读')).toBeVisible();
    await expect(item.getByText('已读')).toHaveCount(0);
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    const item = second.window.getByRole('listitem').filter({ hasText: '双章试读' });
    await expect(item.getByText('未读')).toBeVisible();
    await expect(item.getByText('已读')).toHaveCount(0);
    await expect(item.getByText('在读')).toHaveCount(0);
  } finally {
    await second.close();
  }
});
