import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

async function snapshotDir(root: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        out.set(rel, await readFile(full));
      }
    }
  }
  await walk(root, '');
  return out;
}

function sameSnapshot(before: Map<string, Buffer>, after: Map<string, Buffer>): boolean {
  if (before.size !== after.size) {
    return false;
  }
  for (const [name, bytes] of before) {
    const next = after.get(name);
    if (!next || !bytes.equals(next)) {
      return false;
    }
  }
  return true;
}

async function latestReport(vault: string): Promise<string> {
  const dir = path.join(vault, '.zhiliu', 'import-reports');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.md')).sort();
  const last = names.at(-1);
  if (!last) {
    throw new Error('没有导入报告');
  }
  return readFile(path.join(dir, last), 'utf8');
}

test('导入 Markdown 文件夹后可检索，原文件夹不变，报告列出冲突与未映射字段', async () => {
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'zhiliu-md-'));
  await writeFile(
    path.join(sourceDir, 'hearth.md'),
    `---
id: 11111111-1111-1111-1111-111111111111
kind: thought_note
quotation: 炉火旁的旧笔记。
thought: 青瓷灯芯值得留下。
tags: leftover
---
## 引文
炉火旁的旧笔记。
`,
    'utf8',
  );
  const beforeFirst = await snapshotDir(sourceDir);

  const session = await launchZhiliu({ chooseMarkdownDir: sourceDir });
  const vault = session.vaultPath as string;
  try {
    await expect(session.window.getByText('一次性复制')).toBeVisible();
    await session.window.getByRole('button', { name: '导入 Markdown 文件夹' }).click();
    await expect(session.window.getByText(/已复制 1 个文件/)).toBeVisible();
    expect(sameSnapshot(beforeFirst, await snapshotDir(sourceDir))).toBeTruthy();

    const firstReport = await latestReport(vault);
    expect(firstReport).toContain('一次性复制');
    expect(firstReport).toContain('tags');

    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const search = session.window.getByRole('dialog', { name: '检索' });
    await search.getByRole('searchbox').fill('青瓷灯芯');
    await expect(search.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' })).toBeVisible();
    await session.window.keyboard.press('Escape');

    const conflictDir = await mkdtemp(path.join(tmpdir(), 'zhiliu-md-conflict-'));
    await writeFile(
      path.join(conflictDir, 'hearth.md'),
      `---
quotation: 第二份同名。
thought: 独角鲸索引探针
aliases: also-unmapped
---
`,
      'utf8',
    );
    const beforeSecond = await snapshotDir(conflictDir);
    await session.setMarkdownDir(conflictDir);
    await session.window.getByRole('button', { name: '导入 Markdown 文件夹' }).click();
    await expect(session.window.getByText(/已复制 1 个文件/)).toBeVisible();
    expect(sameSnapshot(beforeSecond, await snapshotDir(conflictDir))).toBeTruthy();
    expect(sameSnapshot(beforeFirst, await snapshotDir(sourceDir))).toBeTruthy();

    const report = await latestReport(vault);
    expect(report).toContain('一次性复制');
    expect(report).toContain('hearth-2.md');
    expect(report).toContain('aliases');

    await mkdir(path.join(vault, 'notes'), { recursive: true });
    const copied = await readdir(path.join(vault, 'notes'));
    expect(copied.some((name) => name === 'hearth-2.md')).toBeTruthy();
  } finally {
    await session.close();
  }
});
