import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');

const englishQuotation = 'The hearth keeps a quiet lamplight.';
const englishThought = 'warmth without naming 灯.';
const chineseQuotation = '炉火余温把屋子照亮。';
const chineseThought = '灯火近旁不必点名。';
const chinesePhrase = '炉火余温';
const bookPhrase = '用于端到端测试';
const decoyQuotation = 'A brass astrolabe waits on the desk.';
const decoyThought = 'unrelated instrument.';

test.describe.configure({ mode: 'serial' });

test('中文语义检索可以召回不含相同关键词的英文笔记', async () => {
  const session = await launchZhiliu();
  try {
    const english = await session.window.evaluate(async ({ quotation, thought }) => {
      return window.zhiliu.notes.save({ quotation, thought });
    }, { quotation: englishQuotation, thought: englishThought });
    await session.window.evaluate(async ({ quotation, thought }) => {
      return window.zhiliu.notes.save({ quotation, thought });
    }, { quotation: chineseQuotation, thought: chineseThought });
    await session.window.evaluate(async ({ quotation, thought }) => {
      return window.zhiliu.notes.save({ quotation, thought });
    }, { quotation: decoyQuotation, thought: decoyThought });

    const keywordHits = await session.window.evaluate(
      async (phrase) => window.zhiliu.search.query(phrase, { mode: 'keyword' }),
      chinesePhrase,
    );
    expect(keywordHits.some((hit) => hit.noteId === english.id)).toBeFalsy();
    expect(keywordHits.some((hit) => hit.snippet.includes('lamplight') || hit.snippet.includes('hearth'))).toBeFalsy();

    const semanticHits = await session.window.evaluate(
      async (phrase) => window.zhiliu.search.query(phrase, { mode: 'semantic' }),
      chinesePhrase,
    );
    const englishHit = semanticHits.find((hit) => hit.noteId === english.id);
    expect(englishHit).toBeTruthy();
    expect(englishHit?.kind).toBe('note');
    expect(englishHit?.partialIndex).toBe(false);
    expect(semanticHits.some((hit) => hit.snippet.includes('astrolabe'))).toBeFalsy();

    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    await expect(dialog).toBeVisible();
    const semanticToggle = dialog.getByRole('checkbox', { name: '语义' });
    await expect(semanticToggle).toBeVisible();
    await expect(semanticToggle).toBeChecked();
    await dialog.getByRole('searchbox').fill(chinesePhrase);
    const results = dialog.getByRole('list', { name: '检索结果' });
    const mixedHit = results.getByRole('button').filter({ hasText: '笔记' }).filter({ hasText: 'lamplight' });
    await expect(mixedHit).toBeVisible();
    await expect(mixedHit.getByText('部分索引')).toHaveCount(0);

    await semanticToggle.uncheck();
    await expect(results.getByRole('button').filter({ hasText: 'lamplight' })).toHaveCount(0);
    await expect(results.getByRole('button').filter({ hasText: '笔记' })).not.toHaveCount(0);
  } finally {
    await session.close();
  }
});

test('保存第二条笔记时不会重新嵌入第一条', async () => {
  const session = await launchZhiliu();
  try {
    const first = await session.window.evaluate(async ({ quotation, thought }) => {
      return window.zhiliu.notes.save({ quotation, thought });
    }, { quotation: englishQuotation, thought: englishThought });
    const afterFirst = await session.window.evaluate(() => window.zhiliu.search.embedCalls());
    const firstId = `note:${first.id}`;
    const firstCount = afterFirst.filter((call) => call.id === firstId).length;
    expect(firstCount).toBeGreaterThan(0);

    const second = await session.window.evaluate(async ({ quotation, thought }) => {
      return window.zhiliu.notes.save({ quotation, thought });
    }, { quotation: chineseQuotation, thought: chineseThought });
    const afterSecond = await session.window.evaluate(() => window.zhiliu.search.embedCalls());
    expect(afterSecond.filter((call) => call.id === firstId).length).toBe(firstCount);
    expect(afterSecond.some((call) => call.id === `note:${second.id}`)).toBeTruthy();
  } finally {
    await session.close();
  }
});

test('语义检索书籍命中仍标注部分索引，且不发出网络请求', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB' }).click();
    await expect(session.window.getByRole('button', { name: '炉边小札' })).toBeVisible();

    const remote: string[] = [];
    session.window.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        remote.push(url);
      }
    });

    const bookHits = await session.window.evaluate(
      async (phrase) => window.zhiliu.search.query(phrase, { mode: 'semantic' }),
      bookPhrase,
    );
    expect(bookHits.some((hit) => hit.kind === 'epub' && hit.partialIndex)).toBeTruthy();

    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').fill(bookPhrase);
    const bookHit = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: /书籍|来源/ });
    await expect(bookHit).toBeVisible();
    await expect(bookHit.getByText('部分索引')).toBeVisible();

    await session.window.waitForTimeout(400);
    expect(remote).toEqual([]);
  } finally {
    await session.close();
  }
});
