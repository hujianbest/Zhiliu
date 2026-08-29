import { access, mkdir, readFile, rename, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('首次运行选择知识库后磁盘上出现可读结构', async () => {
  const vaultPath = path.join(tmpdir(), `zhiliu-chosen-${randomUUID()}`);
  await mkdir(vaultPath, { recursive: true });
  const session = await launchZhiliu({ vaultPath: null, chooseDirectory: vaultPath });
  try {
    await expect(session.window.getByRole('button', { name: '选择知识库位置' })).toBeVisible();
    await session.window.getByRole('button', { name: '选择知识库位置' }).click();
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await access(path.join(vaultPath, 'notes'));
    await access(path.join(vaultPath, 'sources'));
    await access(path.join(vaultPath, '.zhiliu', 'vault.json'));
    const manifest = JSON.parse(await readFile(path.join(vaultPath, '.zhiliu', 'vault.json'), 'utf8')) as {
      version: number;
    };
    expect(manifest.version).toBe(1);
  } finally {
    await session.close();
    await rm(vaultPath, { recursive: true, force: true });
  }
});

test('重启后无需再次选择即可打开同一知识库', async () => {
  const vaultPath = path.join(tmpdir(), `zhiliu-chosen-${randomUUID()}`);
  await mkdir(vaultPath, { recursive: true });
  const first = await launchZhiliu({
    vaultPath: null,
    chooseDirectory: vaultPath,
    preserveUserData: true,
    preserveVault: true,
  });
  const userDataPath = first.userDataPath;
  try {
    await first.window.getByRole('button', { name: '选择知识库位置' }).click();
    await expect(first.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
  } finally {
    await first.close();
  }

  const second = await launchZhiliu({ vaultPath: null, userDataPath, preserveVault: true });
  try {
    await expect(second.window.getByRole('button', { name: '选择知识库位置' })).toHaveCount(0);
    await expect(second.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    const opened = await second.window.evaluate(async () => window.zhiliu.vault.current());
    expect(opened.path).toBe(vaultPath);
  } finally {
    await second.close();
    await rm(vaultPath, { recursive: true, force: true });
  }
});

test('原子笔记是带稳定标识的 Markdown，可被外部编辑器阅读', async () => {
  const session = await launchZhiliu();
  try {
    const note = await session.window.evaluate(async () =>
      window.zhiliu.notes.save({
        quotation: '阅读产生思想。',
        thought: '这是我自己的判断。',
        sourceId: 'src-1',
        sourcePosition: 'ch-1:12',
      }),
    );
    expect(note.id.length).toBeGreaterThan(8);
    const raw = await readFile(note.path, 'utf8');
    expect(raw.startsWith('---')).toBeTruthy();
    expect(raw).toContain(note.id);
    expect(raw).toContain('阅读产生思想。');
    expect(raw).toContain('这是我自己的判断。');
  } finally {
    await session.close();
  }
});

test('外部重命名并移动笔记文件后仍能按稳定标识取回', async () => {
  const session = await launchZhiliu();
  try {
    const note = await session.window.evaluate(async () =>
      window.zhiliu.notes.save({
        quotation: '出处不会丢。',
        thought: '标识不依赖文件名。',
      }),
    );
    const movedDir = path.join(session.vaultPath as string, 'notes', 'relocated');
    await mkdir(movedDir, { recursive: true });
    const movedPath = path.join(movedDir, 'renamed.md');
    await rename(note.path, movedPath);

    const found = await session.window.evaluate(async (id) => window.zhiliu.notes.get(id), note.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(note.id);
    expect(found?.thought).toBe('标识不依赖文件名。');
    expect(found?.path).toBe(movedPath);
  } finally {
    await session.close();
  }
});

test('把知识库目录复制到别处后打开，内容与关系仍完整', async () => {
  const session = await launchZhiliu({ preserveVault: true });
  const originalVault = session.vaultPath as string;
  try {
    const note = await session.window.evaluate(async () =>
      window.zhiliu.notes.save({
        quotation: '可搬迁。',
        thought: '整份目录就是全部。',
        relations: [{ type: 'supports', id: 'topic-1' }],
      }),
    );
    await session.close();

    const copyPath = path.join(tmpdir(), `zhiliu-copy-${randomUUID()}`);
    await cp(originalVault, copyPath, { recursive: true });
    const copied = await launchZhiliu({ vaultPath: copyPath });
    try {
      const found = await copied.window.evaluate(async (id) => window.zhiliu.notes.get(id), note.id);
      expect(found?.quotation).toBe('可搬迁。');
      expect(found?.thought).toBe('整份目录就是全部。');
      expect(found?.relations).toEqual([{ type: 'supports', id: 'topic-1' }]);
    } finally {
      await copied.close();
    }
  } finally {
    await rm(originalVault, { recursive: true, force: true });
  }
});

