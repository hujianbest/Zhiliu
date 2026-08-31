import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const uniqueThought = '青瓷索引探针可以单独命中';
const uniqueKeyword = '青瓷索引探针';
const firesideSentence = '这是一本用于端到端测试的小书。';

test.describe.configure({ mode: 'serial' });

const degradeCopy = {
  missing: '本地语义模型不可用，目前只用关键词检索。',
  onnx: '语义引擎未能加载，目前只用关键词检索。',
  crash: '后台语义进程已停止，目前只用关键词检索。',
} as const;

async function assertDegraded(
  fail: 'missing' | 'onnx' | 'crash',
  copy: string,
): Promise<void> {
  const session = await launchZhiliu({ embeddingFail: fail });
  try {
    await session.window.evaluate(async (thought) => {
      await window.zhiliu.notes.save({ quotation: '一段引文。', thought });
    }, uniqueThought);

    const detailed = await session.window.evaluate(
      async (q) => window.zhiliu.search.queryDetailed(q, { mode: 'mix' }),
      uniqueKeyword,
    );
    expect(detailed.hits.some((hit) => hit.snippet.includes(uniqueKeyword))).toBeTruthy();
    expect(detailed.degraded).toBe(
      fail === 'missing' ? 'missing-model' : fail === 'onnx' ? 'onnx' : 'worker',
    );

    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await dialog.getByRole('searchbox').fill(uniqueKeyword);
    await expect(dialog.getByText(copy)).toBeVisible();
    await expect(dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' })).toBeVisible();
  } finally {
    await session.close();
  }
}

test('模型文件缺失时检索降为关键词并明示', async () => {
  await assertDegraded('missing', degradeCopy.missing);
});

test('ONNX 加载失败时检索降为关键词并明示', async () => {
  await assertDegraded('onnx', degradeCopy.onnx);
});

test('后台工作进程崩溃时检索降为关键词并明示', async () => {
  await assertDegraded('crash', degradeCopy.crash);
});

test('全量嵌入未完成时仍可打开来源并记下笔记', async () => {
  const started = Date.now();
  const session = await launchZhiliu({ chooseFiles: [fireside], embedDelayMs: 8_000 });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await expect(session.window.getByRole('button', { name: '炉边小札' })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(4_000);

    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(firesideSentence)).toBeVisible();
    await body.getByText(firesideSentence).selectText();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await capture.getByLabel('想法').fill('嵌入还在跑也能记下。');
    await capture.getByLabel('想法').press('Enter');
    await expect(capture).toBeHidden();
    await expect(session.window.getByRole('list', { name: '本书笔记' }).getByText('嵌入还在跑也能记下。')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(6_000);
  } finally {
    await session.close();
  }
});
