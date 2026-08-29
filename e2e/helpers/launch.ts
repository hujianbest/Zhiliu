import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { startFakeOpenAI, type FakeOpenAI } from './fake-openai.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type ZhiliuSession = {
  app: ElectronApplication;
  window: Page;
  vaultPath: string;
  fakeOpenAI: FakeOpenAI;
  close(): Promise<void>;
};

export async function launchZhiliu(): Promise<ZhiliuSession> {
  const vaultPath = await mkdtemp(path.join(tmpdir(), 'zhiliu-vault-'));
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'zhiliu-user-data-'));
  const fakeOpenAI = await startFakeOpenAI();

  const app = await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      repoRoot,
    ],
    env: {
      ...process.env,
      ZHILIU_VAULT: vaultPath,
      ZHILIU_USER_DATA: userDataPath,
      ZHILIU_OPENAI_BASE_URL: fakeOpenAI.baseUrl,
      ZHILIU_OPENAI_API_KEY: 'e2e-fake-key',
      ZHILIU_E2E: '1',
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return {
    app,
    window,
    vaultPath,
    fakeOpenAI,
    async close() {
      await app.close().catch(() => undefined);
      await fakeOpenAI.close().catch(() => undefined);
      await rm(vaultPath, { recursive: true, force: true });
      await rm(userDataPath, { recursive: true, force: true });
    },
  };
}
