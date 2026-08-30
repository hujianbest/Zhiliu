import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchZhiliu, packagedExecutablePath } from './helpers/launch.js';

const fireside = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fireside-notes.epub');

test.describe.configure({ mode: 'serial' });

test('Playwright 启动的是打包后的二进制', async () => {
  const session = await launchZhiliu();
  try {
    expect(session.executablePath).toBe(packagedExecutablePath());
    const execPath = await session.app.evaluate(() => process.execPath);
    expect(execPath).toBe(session.executablePath);
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('打包应用可以启动、打开文件、读取凭据并完成一次 EPUB 导入', async () => {
  const session = await launchZhiliu({
    chooseFiles: [fireside],
    preserveUserData: true,
    preserveVault: true,
  });
  const vaultPath = session.vaultPath as string;
  const userDataPath = session.userDataPath;
  const secret = 'sk-packaged-smoke-key';
  try {
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    const item = session.window.getByRole('listitem').filter({ hasText: '炉边小札' });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: '炉边小札' }).click();
    await expect(session.window.getByRole('button', { name: '返回书库' })).toBeVisible();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText('这是一本用于端到端测试的小书。')).toBeVisible();

    await session.window.getByRole('button', { name: '设置', exact: true }).click();
    await session.window.getByLabel('快速/低成本 接口地址').fill(session.fakeOpenAI.baseUrl);
    await session.window.getByLabel('快速/低成本 模型名').fill('fast-model');
    await session.window.getByLabel('快速/低成本 API Key').fill(secret);
    await session.window.getByLabel('深度写作 接口地址').fill(session.fakeOpenAI.baseUrl);
    await session.window.getByLabel('深度写作 模型名').fill('deep-model');
    await session.window.getByLabel('深度写作 API Key').fill(secret);
    await session.window.getByRole('button', { name: '保存' }).click();
    await expect(session.window.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  } finally {
    await session.close();
  }

  const restarted = await launchZhiliu({ vaultPath, userDataPath, preserveVault: true });
  try {
    await restarted.window.getByRole('button', { name: '设置', exact: true }).click();
    await expect(restarted.window.getByLabel('快速/低成本 模型名')).toHaveValue('fast-model');
    await expect(restarted.window.getByLabel('快速/低成本 API Key')).toHaveAttribute('placeholder', '已保存');
    const stored = await readdir(path.join(vaultPath, 'sources'));
    expect(stored.some((name) => name.endsWith('.epub'))).toBeTruthy();
  } finally {
    await restarted.close();
  }
});

test('utilityProcess 在打包应用中可响应，且 keytar 已从 asar 解出', async () => {
  const session = await launchZhiliu();
  try {
    const pong = await session.app.evaluate(() => {
      const ping = (globalThis as { __zhiliuPingWorker?: () => Promise<boolean> }).__zhiliuPingWorker;
      if (!ping) {
        throw new Error('没有 utilityProcess ping');
      }
      return ping();
    });
    expect(pong).toBe(true);

    const unpackedRoot = path.dirname(session.executablePath);
    const unpacked = path.join(unpackedRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'keytar');
    await access(unpacked);
  } finally {
    await session.close();
  }
});
