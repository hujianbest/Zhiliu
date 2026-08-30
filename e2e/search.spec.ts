import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');

const firesideSentence = '这是一本用于端到端测试的小书。';
const bookPhrase = '用于端到端测试';
const chineseThought = '青瓷灯芯值得记下。';
const chineseKeyword = '青瓷灯芯';
const englishKeyword = 'emberglow';
const newThought = '独角鲸索引探针';

test.describe.configure({ mode: 'serial' });

async function importBook(window: Page, title: string): Promise<void> {
  await window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
  await expect(window.getByRole('button', { name: title })).toBeVisible();
}

async function importAndOpen(window: Page, title: string): Promise<void> {
  await importBook(window, title);
  await window.getByRole('button', { name: title }).click();
}

async function selectInReader(window: Page, text: string): Promise<void> {
  const passage = window.frameLocator('iframe[title="正文"]').getByText(text);
  await expect(passage).toBeVisible();
  await passage.selectText();
}

async function captureThought(window: Page, thought: string): Promise<void> {
  await selectInReader(window, firesideSentence);
  await window.getByRole('button', { name: '记下这段' }).click();
  const dialog = window.getByRole('dialog', { name: '记下这段' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('想法').fill(thought);
  await dialog.getByLabel('想法').press('Enter');
  await expect(dialog).toBeHidden();
}

async function openSearch(window: Page): Promise<ReturnType<Page['getByRole']>> {
  await window.getByRole('button', { name: '检索', exact: true }).click();
  const dialog = window.getByRole('dialog', { name: '检索' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('检索中文想法可以命中笔记并跳回引文', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    const searchButton = session.window.getByRole('button', { name: '检索', exact: true });
    await expect(searchButton).toBeVisible();
    await expect(searchButton).toHaveAttribute('title', '检索（Ctrl+K）');
    await expect(searchButton).not.toHaveAttribute('aria-current', 'page');

    await importAndOpen(session.window, '炉边小札');
    await captureThought(session.window, chineseThought);
    await session.window.getByRole('button', { name: '返回书库' }).click();
    await expect(session.window.getByRole('button', { name: '导入 EPUB 或 PDF' })).toBeVisible();

    await session.window.keyboard.press('Control+K');
    const dialog = session.window.getByRole('dialog', { name: '检索' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').fill(chineseKeyword);

    const results = dialog.getByRole('list', { name: '检索结果' });
    const hit = results.getByRole('button').filter({ hasText: '笔记' });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(chineseKeyword);
    await expect(hit.getByText('部分索引')).toHaveCount(0);

    await hit.click();
    await expect(dialog).toBeHidden();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    await expect(session.window.frameLocator('iframe[title="正文"]').getByText(firesideSentence)).toBeVisible();
  } finally {
    await session.close();
  }
});

test('两字中文词也可以命中笔记', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    await captureThought(session.window, chineseThought);
    const dialog = await openSearch(session.window);
    await dialog.getByRole('searchbox').fill('青瓷');
    const hit = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText('青瓷');
    await access(path.join(session.vaultPath as string, '.zhiliu', 'cache', 'search.sqlite'));
  } finally {
    await session.close();
  }
});

test('英文关键词可以命中笔记', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importBook(session.window, '炉边小札');
    const saved = await session.window.evaluate(async (keyword) => {
      return window.zhiliu.notes.save({
        quotation: `A lamplighted hearth keeps the ${keyword}.`,
        thought: `${keyword} stays with me.`,
      });
    }, englishKeyword);
    expect(saved.thought).toContain(englishKeyword);

    const apiHits = await session.window.evaluate(async (keyword) => window.zhiliu.search.query(keyword), englishKeyword);
    expect(apiHits.some((hit) => hit.kind === 'note')).toBeTruthy();
    expect(apiHits.every((hit) => hit.kind === 'epub' || hit.kind === 'pdf' || hit.kind === 'note' || hit.kind === 'article' || hit.kind === 'draft')).toBeTruthy();
    expect(apiHits.filter((hit) => hit.kind === 'note').every((hit) => hit.partialIndex === false)).toBeTruthy();

    const dialog = await openSearch(session.window);
    await dialog.getByRole('searchbox').fill(englishKeyword);
    const hit = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(englishKeyword);
  } finally {
    await session.close();
  }
});

test('检索书籍正文可以命中并跳到章节，且标注部分索引', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importBook(session.window, '炉边小札');
    const dialog = await openSearch(session.window);
    await dialog.getByRole('searchbox').fill(bookPhrase);
    const hit = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: /书籍|来源/ });
    await expect(hit).toBeVisible();
    await expect(hit.getByText('部分索引')).toBeVisible();
    await expect(hit).toContainText(bookPhrase);

    await hit.click();
    await expect(dialog).toBeHidden();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    await expect(session.window.frameLocator('iframe[title="正文"]').getByText(firesideSentence)).toBeVisible();
  } finally {
    await session.close();
  }
});

test('记下新想法后检索立刻能找到', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importAndOpen(session.window, '炉边小札');
    const dialog = await openSearch(session.window);
    await dialog.getByRole('searchbox').fill(newThought);
    await expect(dialog.getByRole('list', { name: '检索结果' }).getByRole('button')).toHaveCount(0);
    await session.window.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await captureThought(session.window, newThought);

    await openSearch(session.window);
    await dialog.getByRole('searchbox').fill(newThought);
    const hit = dialog.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(newThought);
  } finally {
    await session.close();
  }
});

test('检索时不会发出网络请求', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await importBook(session.window, '炉边小札');
    const remote: string[] = [];
    session.window.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        remote.push(url);
      }
    });

    const dialog = await openSearch(session.window);
    await dialog.getByRole('searchbox').fill(bookPhrase);
    await expect(dialog.getByRole('list', { name: '检索结果' }).getByRole('button')).not.toHaveCount(0);
    await session.window.waitForTimeout(400);
    expect(remote).toEqual([]);

    const csp = await session.window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toBeTruthy();
    expect(csp).not.toMatch(/https:/i);
    expect(csp).not.toMatch(/connect-src[^;]*\*/i);
  } finally {
    await session.close();
  }
});

test('首次运行时 Ctrl+K 不打开检索', async () => {
  const session = await launchZhiliu({ vaultPath: null });
  try {
    await expect(session.window.getByRole('button', { name: '选择知识库位置' })).toBeVisible();
    await session.window.keyboard.press('Control+K');
    await expect(session.window.getByRole('dialog', { name: '检索' })).toHaveCount(0);
    await expect(session.window.getByRole('button', { name: '检索', exact: true })).toHaveCount(0);
  } finally {
    await session.close();
  }
});
