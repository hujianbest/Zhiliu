import http from 'node:http';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

const articleHtml = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<title>窗边的雨</title>
<meta name="author" content="陈北">
</head><body>
<article>
<script>window.__pwned = true;</script>
<h1>窗边的雨</h1>
<p>公开网页里的一句可检索正文：青石阶还没干。雨停之后石缝里还留着昨夜的潮气，巷口的灯也还亮着。</p>
</article>
</body></html>`;

const loginHtml = `<!DOCTYPE html>
<html><head><title>请登录</title></head>
<body>
<p>请登录后继续阅读。</p>
<form><input type="password" name="password"></form>
</body></html>`;

async function serve(pages: Record<string, { status?: number; body: string }>): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const page = pages[req.url ?? ''];
    if (!page) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('missing');
      return;
    }
    res.writeHead(page.status ?? 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page.body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('假网页服务未能绑定端口');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test('粘贴公开文章 URL 后进入书库，脚本被净化；登录墙明确失败且不留条目', async () => {
  const web = await serve({
    '/article': { body: articleHtml },
    '/login': { status: 401, body: loginHtml },
  });
  const session = await launchZhiliu();
  try {
    await session.window.getByRole('button', { name: '导入网页' }).click();
    const dialog = session.window.getByRole('dialog', { name: '导入网页' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('文章网址').fill(`${web.baseUrl}/article`);
    await dialog.getByRole('button', { name: '导入', exact: true }).click();
    await expect(dialog).toBeHidden();

    const item = session.window.getByRole('listitem').filter({ hasText: '窗边的雨' });
    await expect(item).toBeVisible();
    await expect(item.getByText('陈北')).toBeVisible();

    await session.window.getByRole('button', { name: '窗边的雨' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('青石阶还没干。')).toBeVisible();
    await expect(body.locator('script')).toHaveCount(0);

    await session.window.getByRole('button', { name: '返回书库' }).click();
    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const search = session.window.getByRole('dialog', { name: '检索' });
    await search.getByRole('searchbox').fill('青石阶还没干');
    await expect(search.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '文章' })).toBeVisible();
    await session.window.keyboard.press('Escape');

    await session.window.getByRole('button', { name: '导入网页' }).click();
    await dialog.getByLabel('文章网址').fill(`${web.baseUrl}/login`);
    await dialog.getByRole('button', { name: '导入', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(/登录|付费/);
    await expect(session.window.getByRole('listitem').filter({ hasText: '窗边的雨' })).toHaveCount(1);
    await expect(session.window.getByRole('listitem')).toHaveCount(1);
  } finally {
    await session.close();
    await web.close();
  }
});
