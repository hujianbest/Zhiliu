import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('未配置模型时仍可进入三个空间，Agent 给出未配置提示', async () => {
  const session = await launchZhiliu();
  try {
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await expect(session.window.getByText('尚未配置模型')).toBeVisible();
    await session.window.getByRole('button', { name: '思想' }).click();
    await expect(session.window.getByRole('heading', { name: '思想' })).toBeVisible();
    await expect(session.window.getByText('尚未配置模型')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('设置既有可见入口也有可发现的键盘路径', async () => {
  const session = await launchZhiliu();
  try {
    const settings = session.window.getByRole('button', { name: '设置' });
    await expect(settings).toBeVisible();
    await expect(settings).toHaveAttribute('title', /Ctrl\+,/);
    await settings.click();
    await expect(session.window.getByRole('dialog', { name: '设置' })).toBeVisible();
    await session.window.keyboard.press('Escape');
    await expect(session.window.getByRole('dialog', { name: '设置' })).toBeHidden();

    await session.window.keyboard.press('Control+,');
    await expect(session.window.getByRole('dialog', { name: '设置' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('两个模型角色可以独立配置，也可以配成同一端点', async () => {
  const session = await launchZhiliu({ preserveUserData: true, preserveVault: true });
  const userDataPath = session.userDataPath;
  const vaultPath = session.vaultPath as string;
  const secret = 'sk-e2e-keep-out-of-vault';
  try {
    await session.window.getByRole('button', { name: '设置' }).click();
    await fillRole(session.window, '快速/低成本', {
      baseUrl: session.fakeOpenAI.baseUrl,
      model: 'fast-model',
      apiKey: secret,
    });
    await fillRole(session.window, '深度写作', {
      baseUrl: session.fakeOpenAI.baseUrl,
      model: 'deep-model',
      apiKey: secret,
    });
    await session.window.getByRole('button', { name: '保存' }).click();
    await expect(session.window.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
    await expect(session.window.getByText('尚未配置模型')).toHaveCount(0);
  } finally {
    await session.close();
  }

  const restarted = await launchZhiliu({
    vaultPath,
    userDataPath,
    preserveVault: true,
  });
  try {
    await restarted.window.getByRole('button', { name: '设置' }).click();
    await expect(restarted.window.getByLabel('快速/低成本 模型名')).toHaveValue('fast-model');
    await expect(restarted.window.getByLabel('深度写作 模型名')).toHaveValue('deep-model');
    await expect(restarted.window.getByLabel('快速/低成本 接口地址')).toHaveValue(restarted.fakeOpenAI.baseUrl);
    await assertSecretAbsentFromPlainFiles(vaultPath, userDataPath, secret);
  } finally {
    await restarted.close();
  }
});

test('保存前的连通性测试区分成功、端点不可达与凭据无效', async () => {
  const session = await launchZhiliu();
  try {
    await session.window.getByRole('button', { name: '设置' }).click();
    const fast = session.window.getByRole('group', { name: '快速/低成本' });

    await fillRole(session.window, '快速/低成本', {
      baseUrl: session.fakeOpenAI.baseUrl,
      model: 'fast-model',
      apiKey: 'sk-e2e-valid',
    });
    await fast.getByRole('button', { name: '测试连通性' }).click();
    await expect(fast.getByRole('status')).toHaveText('连通成功');

    await session.window.getByLabel('快速/低成本 API Key').fill('sk-invalid');
    await fast.getByRole('button', { name: '测试连通性' }).click();
    await expect(fast.getByRole('status')).toHaveText('凭据无效');

    await session.window.getByLabel('快速/低成本 接口地址').fill('http://127.0.0.1:1');
    await session.window.getByLabel('快速/低成本 API Key').fill('sk-e2e-valid');
    await fast.getByRole('button', { name: '测试连通性' }).click();
    await expect(fast.getByRole('status')).toHaveText('端点不可达');
  } finally {
    await session.close();
  }
});

async function fillRole(
  window: import('@playwright/test').Page,
  role: '快速/低成本' | '深度写作',
  values: { baseUrl: string; model: string; apiKey: string },
): Promise<void> {
  await window.getByLabel(`${role} 接口地址`).fill(values.baseUrl);
  await window.getByLabel(`${role} 模型名`).fill(values.model);
  await window.getByLabel(`${role} API Key`).fill(values.apiKey);
}

async function assertSecretAbsentFromPlainFiles(
  vaultPath: string,
  userDataPath: string,
  secret: string,
): Promise<void> {
  const hits: string[] = [];
  for (const root of [vaultPath, userDataPath]) {
    for (const filePath of await listFiles(root)) {
      if (filePath.endsWith(`${path.sep}credentials.json`)) {
        continue;
      }
      const raw = await readFile(filePath, 'utf8');
      if (raw.includes(secret)) {
        hits.push(filePath);
      }
    }
  }
  expect(hits).toEqual([]);
}

async function listFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}
