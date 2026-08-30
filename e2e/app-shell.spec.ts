import { access } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('启动后展示三个主空间与全局 Agent 侧栏', async () => {
  const session = await launchZhiliu();
  try {
    const { window } = session;
    await expect(window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await expect(window.getByRole('button', { name: '思想' })).toBeVisible();
    await expect(window.getByRole('button', { name: '创作' })).toBeVisible();
    await expect(window.getByRole('complementary', { name: 'Agent' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('可以用鼠标在三个主空间之间切换', async () => {
  const session = await launchZhiliu();
  try {
    const { window } = session;
    await window.getByRole('button', { name: '思想' }).click();
    await expect(window.getByRole('button', { name: '思想' })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('heading', { name: '思想' })).toBeVisible();

    await window.getByRole('button', { name: '创作' }).click();
    await expect(window.getByRole('button', { name: '创作' })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('heading', { name: '创作' })).toBeVisible();

    await window.getByRole('button', { name: '书库/阅读' }).click();
    await expect(window.getByRole('button', { name: '书库/阅读' })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('heading', { name: '书库/阅读' })).toBeVisible();
  } finally {
    await session.close();
  }
});

test('可以用键盘在三个主空间之间切换', async () => {
  const session = await launchZhiliu();
  try {
    const { window } = session;
    await window.keyboard.press('Control+2');
    await expect(window.getByRole('button', { name: '思想' })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('heading', { name: '思想' })).toBeVisible();

    await window.keyboard.press('Control+3');
    await expect(window.getByRole('button', { name: '创作' })).toHaveAttribute('aria-current', 'page');

    await window.keyboard.press('Control+1');
    await expect(window.getByRole('button', { name: '书库/阅读' })).toHaveAttribute('aria-current', 'page');
  } finally {
    await session.close();
  }
});

test('端到端运行使用隔离知识库并在结束时清理', async () => {
  const session = await launchZhiliu();
  const { vaultPath } = session;
  try {
    await access(vaultPath);
    const configured = await session.app.evaluate(() => process.env.ZHILIU_VAULT);
    expect(configured).toBe(vaultPath);
  } finally {
    await session.close();
  }
  await expect(access(vaultPath)).rejects.toThrow();
});

test('模型调用指向假 OpenAI 服务且不需要真实凭据', async () => {
  const session = await launchZhiliu();
  try {
    const baseUrl = await session.app.evaluate(() => process.env.ZHILIU_OPENAI_BASE_URL);
    const apiKey = await session.app.evaluate(() => process.env.ZHILIU_OPENAI_API_KEY);
    expect(baseUrl).toBe(session.fakeOpenAI.baseUrl);
    expect(apiKey).toBe('e2e-fake-key');
    expect(session.fakeOpenAI.baseUrl.startsWith('http://127.0.0.1:')).toBeTruthy();
  } finally {
    await session.close();
  }
});
