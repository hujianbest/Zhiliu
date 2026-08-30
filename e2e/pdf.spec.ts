import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const selectable = path.join(fixtures, 'selectable-notes.pdf');
const imageOnly = path.join(fixtures, 'image-only.pdf');
const pageOne = 'Bramblepoint page one sentence.';
const pageTwo = 'Willowgate page two sentence.';

test.describe.configure({ mode: 'serial' });

test('导入文本型 PDF 后可以翻页、选中并保存带页内坐标的笔记', async () => {
  const session = await launchZhiliu({ chooseFiles: [selectable] });
  const vaultPath = session.vaultPath as string;
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const item = session.window.getByRole('listitem').filter({ hasText: 'selectable-notes' });
    await expect(item).toBeVisible();
    await expect(item.getByText('待索引')).toBeVisible();
    await item.getByRole('button').click();

    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(pageOne)).toBeVisible();
    await expect(session.window.getByRole('button', { name: '下一页' })).toBeVisible();
    await expect(session.window.getByRole('button', { name: '目录', exact: true })).toBeVisible();

    await session.window.getByRole('button', { name: '目录', exact: true }).click();
    const toc = session.window.getByRole('dialog', { name: '目录' });
    await expect(toc.getByRole('button', { name: 'Page Two' })).toBeVisible();
    await toc.getByRole('button', { name: 'Page Two' }).click();
    await expect(body.getByText(pageTwo)).toBeVisible();

    await body.getByText(pageTwo).selectText();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await dialog.getByLabel('想法').fill('第二页这句要跳回去。');
    await dialog.getByLabel('想法').press('Enter');
    await expect(session.window.getByRole('list', { name: '本书笔记' }).getByText('第二页这句要跳回去。')).toBeVisible();

    const notesDir = path.join(vaultPath, 'notes');
    const files = (await readdir(notesDir)).filter((name) => name.endsWith('.md'));
    expect(files.length).toBe(1);
    const raw = await readFile(path.join(notesDir, files[0]), 'utf8');
    expect(raw).toMatch(/source_position:\s*['"]?pdf:1:\d+:\d+:-?\d+:-?\d+:-?\d+:-?\d+/);
    expect(raw).toContain(pageTwo);

    await session.window.getByRole('button', { name: '上一页' }).click();
    await expect(body.getByText(pageOne)).toBeVisible();
    await session.window.getByRole('list', { name: '本书笔记' }).getByRole('button').click();
    await expect(body.getByText(pageTwo)).toBeVisible();
  } finally {
    await session.close();
  }
});

test('关闭后重新打开 PDF 回到上次阅读页，索引未完成也可阅读', async () => {
  const first = await launchZhiliu({
    chooseFiles: [selectable],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  try {
    await first.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await first.window.getByRole('button', { name: /selectable-notes/ }).click();
    await first.window.getByRole('button', { name: '下一页' }).click();
    const body = first.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(pageTwo)).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    const body = second.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(pageTwo)).toBeVisible();
    await expect(second.window.getByRole('button', { name: '返回书库' })).toBeVisible();
  } finally {
    await second.close();
  }
});

test('没有文本层的 PDF 可以翻页查看，并明确说明无法选中文字', async () => {
  const session = await launchZhiliu({ chooseFiles: [imageOnly] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: /image-only/ }).click();
    await expect(session.window.getByText('这份来源没有文本层，本版本无法选中文字。')).toBeVisible();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    await expect(session.window.locator('#capture-hint')).toHaveText('这份来源没有文本层，本版本无法选中文字。');
  } finally {
    await session.close();
  }
});
