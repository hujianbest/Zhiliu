import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

const shared = '青瓷排序探针';

test('同一词的思想笔记排在摘录前，标签为用户与来源，且没有手工改归属的入口', async () => {
  const session = await launchZhiliu();
  try {
    await session.window.evaluate(async (word) => {
      await window.zhiliu.notes.save({ quotation: `${word} 的引文。`, thought: `${word} 是我自己的想法。` });
      await window.zhiliu.notes.save({ quotation: `${word} 的摘录。` });
    }, shared);

    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await dialog.getByRole('searchbox').fill(shared);
    const results = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' });
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toContainText('用户');
    await expect(results.nth(0)).toContainText('是我自己的想法');
    await expect(results.nth(1)).toContainText('来源');
    await expect(results.nth(1)).toContainText('的摘录');

    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), shared);
    const notes = hits.filter((hit) => hit.kind === 'note');
    expect(notes.map((hit) => hit.provenance)).toEqual(['user', 'source']);

    await session.window.keyboard.press('Escape');
    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    await expect(session.window.getByRole('combobox')).toHaveCount(0);
    await expect(session.window.getByLabel('来源归属')).toHaveCount(0);
    await expect(session.window.getByRole('button', { name: /设为用户|改为用户|改归属/ })).toHaveCount(0);
  } finally {
    await session.close();
  }
});
