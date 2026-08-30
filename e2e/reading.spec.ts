import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const twoChapters = path.join(fixtures, 'two-chapters.epub');
const scripted = path.join(fixtures, 'scripted.epub');

test.describe.configure({ mode: 'serial' });

test('从书库打开 EPUB 可以看到正文', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const item = session.window.getByRole('listitem').filter({ hasText: '炉边小札' });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: '炉边小札' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('这是一本用于端到端测试的小书。')).toBeVisible();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    await session.window.getByRole('button', { name: '返回书库' }).click();
    await expect(session.window.getByRole('listitem').filter({ hasText: '炉边小札' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('可以用上一章下一章和方向键连续翻阅', async () => {
  const session = await launchZhiliu({ chooseFiles: [twoChapters] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '双章试读' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toBeVisible();

    const next = session.window.getByRole('button', { name: '下一章' });
    const prev = session.window.getByRole('button', { name: '上一章' });
    await expect(next).toHaveAttribute('title', /→|ArrowRight|右/);
    await expect(prev).toHaveAttribute('title', /←|ArrowLeft|左/);

    await next.click();
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toHaveCount(0);

    await prev.click();
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toBeVisible();

    await session.window.keyboard.press('ArrowRight');
    await expect(body.getByText('第二章独有句：南巷已经打烊。')).toBeVisible();

    await session.window.keyboard.press('ArrowLeft');
    await expect(body.getByText('第一章独有句：北窗的灯还亮着。')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('阅读正文可以选中', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const frame = session.window.frameLocator('iframe[title="正文"]');
    const passage = frame.getByText('这是一本用于端到端测试的小书。');
    await expect(passage).toBeVisible();
    await expect(passage).toHaveCSS('user-select', /text|auto|contain/);
    await passage.selectText();
    const selected = await session.window
      .locator('iframe[title="正文"]')
      .evaluate((node) => {
        const iframe = node as HTMLIFrameElement;
        return iframe.contentDocument?.getSelection()?.toString() ?? '';
      });
    expect(selected).toContain('这是一本用于端到端测试的小书。');
  } finally {
    await session.close();
  }
});

test('打开含脚本的 EPUB 时脚本与活动内容不会执行', async () => {
  const session = await launchZhiliu({ chooseFiles: [scripted] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '含脚本的书' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('这段正文应当可见。')).toBeVisible();

    const parentPwned = await session.window.evaluate(() => (window as Window & { __zhiliuPwned?: boolean }).__zhiliuPwned);
    expect(parentPwned).not.toBe(true);

    const frame = session.window.locator('iframe[title="正文"]');
    await expect(frame).toHaveAttribute('sandbox', /^((?!allow-scripts).)*$/);
    const rendered = await frame.evaluate((node) => {
      const iframe = node as HTMLIFrameElement;
      const doc = iframe.contentDocument;
      return {
        html: iframe.srcdoc,
        iframePwned: (iframe.contentWindow as Window & { __zhiliuPwned?: boolean }).__zhiliuPwned,
        scripts: doc?.querySelectorAll('script').length ?? -1,
        iframes: doc?.querySelectorAll('iframe').length ?? -1,
        objects: doc?.querySelectorAll('object').length ?? -1,
        embeds: doc?.querySelectorAll('embed').length ?? -1,
        forms: doc?.querySelectorAll('form').length ?? -1,
        handlers: doc?.querySelector('[onerror], [onload]') ? true : false,
        javascriptHref: Boolean(doc?.querySelector('a[href^="javascript:"]')),
      };
    });
    expect(rendered.iframePwned).not.toBe(true);
    expect(rendered.scripts).toBe(0);
    expect(rendered.iframes).toBe(0);
    expect(rendered.objects).toBe(0);
    expect(rendered.embeds).toBe(0);
    expect(rendered.forms).toBe(0);
    expect(rendered.handlers).toBe(false);
    expect(rendered.javascriptHref).toBe(false);
    expect(rendered.html).not.toMatch(/<script/i);
    expect(rendered.html).not.toMatch(/javascript:/i);
  } finally {
    await session.close();
  }
});

test('阅读过程中不会发出网络请求', async () => {
  const session = await launchZhiliu({ chooseFiles: [scripted] });
  const remote: string[] = [];
  session.window.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      remote.push(url);
    }
  });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '含脚本的书' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('这段正文应当可见。')).toBeVisible();
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
