import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const twoChapters = path.join(fixtures, 'two-chapters.epub');

const firesideSentence = '这是一本用于端到端测试的小书。';
const chapterTwoSentence = '第二章独有句：南巷已经打烊。';
const chapterOneSentence = '第一章独有句：北窗的灯还亮着。';

test.describe.configure({ mode: 'serial' });

async function importAndOpen(window: Page, title: string): Promise<void> {
  await window.getByRole('button', { name: '导入 EPUB' }).click();
  await window.getByRole('button', { name: title }).click();
}

async function selectInReader(window: Page, text: string): Promise<void> {
  const passage = window.frameLocator('iframe[title="正文"]').getByText(text);
  await expect(passage).toBeVisible();
  await passage.selectText();
}

async function savedNoteFiles(vaultPath: string): Promise<string[]> {
  const names = await readdir(path.join(vaultPath, 'notes'));
  return names.filter((name) => name.endsWith('.md')).map((name) => path.join(vaultPath, 'notes', name));
}

test('选中正文后可以记下想法并留在阅读界面', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    await selectInReader(session.window, firesideSentence);

    const capture = session.window.getByRole('button', { name: '记下这段' });
    await expect(capture).toBeVisible();
    await expect(capture).toHaveAttribute('title', '记下这段（Ctrl+M）');
    await capture.click();

    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(firesideSentence)).toBeVisible();
    await dialog.getByLabel('想法').fill('炉边这句值得反复读。');
    await dialog.getByLabel('想法').press('Enter');
    await expect(dialog).toBeHidden();

    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    await expect(session.window.getByRole('heading', { name: '思想', exact: true })).toHaveCount(0);
    await expect(session.window.frameLocator('iframe[title="正文"]').getByText(firesideSentence)).toBeVisible();

    const notes = session.window.getByRole('list', { name: '本书笔记' });
    await expect(notes.getByText(firesideSentence)).toBeVisible();
    await expect(notes.getByText('炉边这句值得反复读。')).toBeVisible();
    await expect(notes.getByText('思想笔记', { exact: true })).toBeVisible();

    const files = await savedNoteFiles(session.vaultPath as string);
    expect(files.length).toBe(1);
    const raw = await readFile(files[0], 'utf8');
    expect(raw.startsWith('---')).toBeTruthy();
    expect(raw).toContain(firesideSentence);
    expect(raw).toContain('炉边这句值得反复读。');
    expect(raw).toMatch(/kind:\s*thought_note/);
    expect(raw).toMatch(/source_id:/);
    expect(raw).toMatch(/source_position:\s*['"]?epub:\d+:\d+:\d+/);
    const sourceId = raw.match(/source_id:\s*['"]?([0-9a-f-]{36})/i)?.[1];
    expect(sourceId).toBeTruthy();
    const listed = await session.window.evaluate(
      async (id) => window.zhiliu.notes.listForSource(id),
      sourceId as string,
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.quotation).toBe(firesideSentence);
    expect(listed[0]?.thought).toBe('炉边这句值得反复读。');
    expect(listed[0]?.sourcePosition).toMatch(/^epub:\d+:\d+:\d+$/);
  } finally {
    await session.close();
  }
});

test('空想法的捕获保存为摘录，不离开阅读', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    await selectInReader(session.window, firesideSentence);
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await expect(dialog.getByLabel('想法')).toHaveValue('');
    await dialog.getByLabel('想法').press('Enter');
    await expect(dialog).toBeHidden();

    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    await expect(session.window.getByRole('list', { name: '本书笔记' }).getByText(firesideSentence)).toBeVisible();
    await expect(session.window.getByRole('list', { name: '本书笔记' }).getByText('摘录', { exact: true })).toBeVisible();

    const files = await savedNoteFiles(session.vaultPath as string);
    expect(files.length).toBe(1);
    const raw = await readFile(files[0], 'utf8');
    expect(raw).toMatch(/kind:\s*excerpt/);
    expect(raw).toContain(firesideSentence);
    expect(raw).toContain('（无）');
  } finally {
    await session.close();
  }
});

test('本书笔记列表区分摘录与思想笔记', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    await selectInReader(session.window, firesideSentence);
    await session.window.getByRole('button', { name: '记下这段' }).click();
    await session.window.getByRole('dialog', { name: '记下这段' }).getByLabel('想法').press('Enter');

    await selectInReader(session.window, firesideSentence);
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await dialog.getByLabel('想法').fill('这是想法。');
    await dialog.getByLabel('想法').press('Enter');

    const notes = session.window.getByRole('list', { name: '本书笔记' });
    await expect(notes.getByText('摘录', { exact: true })).toBeVisible();
    await expect(notes.getByText('思想笔记', { exact: true })).toBeVisible();
    const excerptRow = notes.getByRole('listitem').filter({ hasText: '摘录' });
    const thoughtRow = notes.getByRole('listitem').filter({ hasText: '思想笔记' });
    await expect(excerptRow.getByText('（无）')).toBeVisible();
    await expect(thoughtRow.getByText('这是想法。')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('点击本书笔记可以跳回引文所在章节', async () => {
  const session = await launchZhiliu({ chooseFiles: [twoChapters] });
  try {
    await importAndOpen(session.window, '双章试读');
    await session.window.getByRole('button', { name: '下一章' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(chapterTwoSentence)).toBeVisible();
    await selectInReader(session.window, chapterTwoSentence);
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await dialog.getByLabel('想法').fill('南巷这一句。');
    await dialog.getByLabel('想法').press('Enter');
    await expect(session.window.getByRole('list', { name: '本书笔记' }).getByText('南巷这一句。')).toBeVisible();

    await session.window.getByRole('button', { name: '上一章' }).click();
    await expect(body.getByText(chapterOneSentence)).toBeVisible();
    await expect(body.getByText(chapterTwoSentence)).toHaveCount(0);

    await session.window.getByRole('list', { name: '本书笔记' }).getByRole('button').click();
    await expect(body.getByText(chapterTwoSentence)).toBeVisible();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('重启后本书笔记仍在，并能跳回原文', async () => {
  const first = await launchZhiliu({
    chooseFiles: [twoChapters],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = first.vaultPath as string;
  const userDataPath = first.userDataPath;
  try {
    await importAndOpen(first.window, '双章试读');
    await first.window.getByRole('button', { name: '下一章' }).click();
    await selectInReader(first.window, chapterTwoSentence);
    await first.window.getByRole('button', { name: '记下这段' }).click();
    const dialog = first.window.getByRole('dialog', { name: '记下这段' });
    await dialog.getByLabel('想法').fill('重启后还要找得到。');
    await dialog.getByLabel('想法').press('Enter');
    await expect(first.window.getByRole('list', { name: '本书笔记' }).getByText('重启后还要找得到。')).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    await expect(second.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    const notes = second.window.getByRole('list', { name: '本书笔记' });
    await expect(notes.getByText(chapterTwoSentence)).toBeVisible();
    await expect(notes.getByText('重启后还要找得到。')).toBeVisible();

    await second.window.getByRole('button', { name: '上一章' }).click();
    const body = second.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(chapterOneSentence)).toBeVisible();
    await notes.getByRole('button').click();
    await expect(body.getByText(chapterTwoSentence)).toBeVisible();
  } finally {
    await second.close();
  }
});

test('记下这段是可见控件；无选区时提示而不是保存；Ctrl+M 打开捕获', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    const capture = session.window.getByRole('button', { name: '记下这段' });
    await expect(capture).toBeVisible();
    await expect(capture).toHaveAttribute('title', '记下这段（Ctrl+M）');

    await capture.click();
    await expect(session.window.getByRole('dialog', { name: '记下这段' })).toHaveCount(0);
    const hint = session.window.getByRole('status').filter({ hasText: '请先选中要记下的文字' });
    await expect(hint).toBeVisible();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();

    await selectInReader(session.window, firesideSentence);
    await session.window.keyboard.press('Control+M');
    const dialog = session.window.getByRole('dialog', { name: '记下这段' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(firesideSentence)).toBeVisible();
    await session.window.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();

    await selectInReader(session.window, firesideSentence);
    await session.window.keyboard.press('Meta+M');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('想法').press('Shift+Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('想法')).toHaveValue('\n');
  } finally {
    await session.close();
  }
});
