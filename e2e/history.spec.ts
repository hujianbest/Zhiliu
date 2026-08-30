import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const execFileAsync = promisify(execFile);
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const firesideSentence = '这是一本用于端到端测试的小书。';
const originalThought = '炉边这句值得反复读。';
const revisedThought = '这是改过之后的措辞。';

test.describe.configure({ mode: 'serial' });

async function gitLsFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files'], { cwd });
  return stdout.split('\n').filter(Boolean);
}

async function gitLogSubjects(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd });
  return stdout.split('\n').filter(Boolean);
}

async function importAndOpen(window: Page, title: string): Promise<void> {
  await window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
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

test('捕获产生提交且来源二进制不入库；改笔记后可从时间线回滚', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  const vaultPath = session.vaultPath as string;
  try {
    await importAndOpen(session.window, '炉边小札');
    await selectInReader(session.window, firesideSentence);
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await capture.getByLabel('想法').fill(originalThought);
    await capture.getByLabel('想法').press('Enter');
    await expect(capture).toBeHidden();

    const files = await savedNoteFiles(vaultPath);
    expect(files.length).toBe(1);
    expect(await readFile(files[0], 'utf8')).toContain(originalThought);

    const tracked = await gitLsFiles(vaultPath);
    expect(tracked.some((file) => file.endsWith('.epub'))).toBe(false);
    expect(tracked.some((file) => file.endsWith('.pdf'))).toBe(false);
    expect(tracked.some((file) => file.includes('.zhiliu/cache/'))).toBe(false);
    expect(tracked.some((file) => file.startsWith('notes/') && file.endsWith('.md'))).toBe(true);

    const subjects = await gitLogSubjects(vaultPath);
    expect(subjects).toContain('记下一条思想笔记');
    expect(subjects).toContain('导入来源文档');
    expect(subjects).toContain('创建知识库');

    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    const notes = session.window.getByRole('list', { name: '全部笔记' });
    await expect(notes.getByText(originalThought)).toBeVisible();
    const timeline = session.window.getByRole('list', { name: '历史时间线' });
    await expect(timeline.getByText('记下一条思想笔记')).toBeVisible();
    await expect(timeline.getByText('导入来源文档')).toBeVisible();
    await expect(session.window.getByRole('button', { name: '回滚到此处' }).first()).toBeVisible();
    await expect(session.window.getByRole('button', { name: /分支|rebase|远端/ })).toHaveCount(0);

    const noteId = await session.window.evaluate(async () => {
      const listed = await window.zhiliu.notes.list();
      return listed[0]?.id ?? '';
    });
    expect(noteId).toBeTruthy();
    await session.window.evaluate(
      async ({ id, quotation, thought }) => {
        await window.zhiliu.notes.save({ id, quotation, thought });
      },
      { id: noteId, quotation: firesideSentence, thought: revisedThought },
    );
    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    await expect(notes.getByText(revisedThought)).toBeVisible();
    await expect(await readFile(files[0], 'utf8')).toContain(revisedThought);
    expect(await gitLogSubjects(vaultPath)).toContain('更新一条笔记');

    const afterEdit = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), revisedThought);
    expect(afterEdit.some((hit) => hit.snippet.includes(revisedThought))).toBeTruthy();
    const oldGone = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), originalThought);
    expect(oldGone.some((hit) => hit.snippet.includes(originalThought))).toBeFalsy();

    const captureRow = timeline.getByRole('listitem').filter({ hasText: '记下一条思想笔记' });
    await captureRow.getByRole('button', { name: '回滚到此处' }).click();
    const confirm = session.window.getByRole('dialog', { name: '回滚到此处' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '确定回滚' }).click();
    await expect(confirm).toBeHidden();

    await expect(notes.getByText(originalThought)).toBeVisible();
    await expect(notes.getByText(revisedThought)).toHaveCount(0);
    expect(await readFile(files[0], 'utf8')).toContain(originalThought);
    expect(await readFile(files[0], 'utf8')).not.toContain(revisedThought);

    const restored = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), originalThought);
    expect(restored.some((hit) => hit.snippet.includes(originalThought))).toBeTruthy();
    const revisedHits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), revisedThought);
    expect(revisedHits.some((hit) => hit.snippet.includes(revisedThought))).toBeFalsy();

    expect(await gitLogSubjects(vaultPath)).not.toContain('更新一条笔记');
  } finally {
    await session.close();
  }
});
