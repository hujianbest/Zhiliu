import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const execFileAsync = promisify(execFile);

test.describe.configure({ mode: 'serial' });

const NOTE_BUDGET = {
  coldStartMs: 6_000,
  indexHitMs: 1_000,
  searchP95Ms: 1_000,
  rssBytes: 800 * 1024 * 1024,
} as const;

const CHUNK_BUDGET = {
  seedMs: 45_000,
  searchP95Ms: 2_000,
  rssBytes: 1_500 * 1024 * 1024,
} as const;

async function writeNotes(vault: string, count: number): Promise<void> {
  const notesDir = path.join(vault, 'notes');
  await mkdir(notesDir, { recursive: true });
  await mkdir(path.join(vault, '.zhiliu'), { recursive: true });
  await writeFile(path.join(vault, '.zhiliu', 'vault.json'), `${JSON.stringify({ version: 1, format: 'zhiliu-vault' }, null, 2)}\n`);
  const batch: Promise<void>[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const body = `---
id: ${id}
kind: thought_note
quotation: 规模引文 ${i}。
thought: 规模想法 ${i} 青瓷基准。
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
---
`;
    batch.push(writeFile(path.join(notesDir, `${id}.md`), body, 'utf8'));
    if (batch.length >= 400) {
      await Promise.all(batch);
      batch.length = 0;
    }
  }
  await Promise.all(batch);
  await execFileAsync('git', ['-c', 'user.name=知流', '-c', 'user.email=zhiliu@localhost', 'init'], { cwd: vault });
  await execFileAsync('git', ['-c', 'user.name=知流', '-c', 'user.email=zhiliu@localhost', 'add', '-A'], { cwd: vault });
  await execFileAsync('git', ['-c', 'user.name=知流', '-c', 'user.email=zhiliu@localhost', 'commit', '-m', '创建知识库'], {
    cwd: vault,
  });
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

test('一万条笔记与二十万块分块满足写死的性能预算', async () => {
  test.setTimeout(180_000);
  const vault = await mkdtemp(path.join(tmpdir(), 'zhiliu-bench-'));
  await writeNotes(vault, 10_000);
  const started = Date.now();
  const session = await launchZhiliu({ vaultPath: vault, preserveVault: true });
  try {
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    const coldStart = Date.now() - started;
    expect(coldStart).toBeLessThanOrEqual(NOTE_BUDGET.coldStartMs);

    const unique = `规模探针 ${Date.now()}`;
    const indexStarted = Date.now();
    await session.window.evaluate(async (thought) => {
      await window.zhiliu.notes.save({ quotation: '新增一条规模笔记。', thought });
    }, unique);
    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), unique);
    expect(hits.some((hit) => hit.snippet.includes(unique))).toBeTruthy();
    expect(Date.now() - indexStarted).toBeLessThanOrEqual(NOTE_BUDGET.indexHitMs);

    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const q = `规模想法 ${i * 500} 青瓷基准`;
      const t0 = Date.now();
      await session.window.evaluate(async (query) => window.zhiliu.search.query(query, { mode: 'keyword' }), q);
      samples.push(Date.now() - t0);
    }
    expect(percentile(samples, 95)).toBeLessThanOrEqual(NOTE_BUDGET.searchP95Ms);

    const rssNotes = await session.app.evaluate(() => process.memoryUsage().rss);
    expect(rssNotes).toBeLessThanOrEqual(NOTE_BUDGET.rssBytes);

    const seedStarted = Date.now();
    await session.window.evaluate(async () => window.zhiliu.search.seedBenchChunks(200_000));
    expect(Date.now() - seedStarted).toBeLessThanOrEqual(CHUNK_BUDGET.seedMs);

    const chunkSamples: number[] = [];
    for (const token of ['bench_chunk_0', 'bench_chunk_123456', 'bench_chunk_199999', 'bench_chunk_50', 'bench_chunk_99999']) {
      const t0 = Date.now();
      const found = await session.window.evaluate(async (query) => window.zhiliu.search.query(query, { mode: 'keyword' }), token);
      chunkSamples.push(Date.now() - t0);
      expect(found.some((hit) => hit.snippet.includes(token))).toBeTruthy();
    }
    expect(percentile(chunkSamples, 95)).toBeLessThanOrEqual(CHUNK_BUDGET.searchP95Ms);

    const rssChunks = await session.app.evaluate(() => process.memoryUsage().rss);
    expect(rssChunks).toBeLessThanOrEqual(CHUNK_BUDGET.rssBytes);

    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await dialog.getByRole('searchbox').fill('青瓷基准');
    await expect(dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' }).first()).toBeVisible();
  } finally {
    await session.close();
  }
});
