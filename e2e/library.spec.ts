import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const execFileAsync = promisify(execFile);
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const windowRain = path.join(fixtures, 'window-rain.epub');
const corrupt = path.join(fixtures, 'corrupt.epub');

test.describe.configure({ mode: 'serial' });

test('导入 EPUB 后书库立刻列出标题、作者与索引状态', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  const vaultPath = session.vaultPath as string;
  try {
    await session.window.getByRole('button', { name: '导入 EPUB' }).click();
    const item = session.window.getByRole('listitem').filter({ hasText: '炉边小札' });
    await expect(item).toBeVisible();
    await expect(item.getByText('林间')).toBeVisible();
    await expect(item.getByText('待索引')).toBeVisible();
    const stored = await readdir(path.join(vaultPath, 'sources'));
    expect(stored.some((name) => name.endsWith('.epub'))).toBeTruthy();
  } finally {
    await session.close();
  }
});

test('一次可以选择多本 EPUB，书库统一列出', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside, windowRain] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB' }).click();
    await expect(session.window.getByRole('listitem').filter({ hasText: '炉边小札' })).toBeVisible();
    await expect(session.window.getByRole('listitem').filter({ hasText: '窗雨' })).toBeVisible();
    await expect(session.window.getByRole('listitem').filter({ hasText: '陈北' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('书籍二进制原件与派生提取产物不进入 Git 历史', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  const vaultPath = session.vaultPath as string;
  try {
    await session.window.getByRole('button', { name: '导入 EPUB' }).click();
    await expect(session.window.getByRole('listitem').filter({ hasText: '炉边小札' })).toBeVisible();
    await execFileAsync('git', ['init'], { cwd: vaultPath });
    await execFileAsync('git', ['add', '-A'], { cwd: vaultPath });
    const { stdout } = await execFileAsync('git', ['ls-files'], { cwd: vaultPath });
    const tracked = stdout.split('\n').filter(Boolean);
    expect(tracked.some((file) => file.endsWith('.epub'))).toBe(false);
    expect(tracked.some((file) => file.includes('.zhiliu/cache/'))).toBe(false);
  } finally {
    await session.close();
  }
});

test('导入损坏的 EPUB 时给出失败原因，不留下半成品条目', async () => {
  const session = await launchZhiliu({ chooseFiles: [corrupt] });
  const vaultPath = session.vaultPath as string;
  try {
    await session.window.getByRole('button', { name: '导入 EPUB' }).click();
    await expect(session.window.getByRole('alert')).toContainText(/不是有效的 EPUB|无法打开/);
    await expect(session.window.getByRole('listitem')).toHaveCount(0);
    const stored = await readdir(path.join(vaultPath, 'sources'));
    expect(stored).toEqual([]);
    const library = JSON.parse(
      await readFile(path.join(vaultPath, '.zhiliu', 'library.json'), 'utf8'),
    ) as { sources: unknown[] };
    expect(library.sources).toEqual([]);
  } finally {
    await session.close();
  }
});
