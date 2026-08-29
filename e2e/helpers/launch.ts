import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { startFakeOpenAI, type FakeOpenAI } from './fake-openai.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type LaunchOptions = {
  vaultPath?: string | null;
  userDataPath?: string;
  chooseDirectory?: string;
  preserveUserData?: boolean;
  preserveVault?: boolean;
};

export type ZhiliuSession = {
  app: ElectronApplication;
  window: Page;
  vaultPath: string | null;
  userDataPath: string;
  fakeOpenAI: FakeOpenAI;
  close(): Promise<void>;
};

export async function launchZhiliu(options: LaunchOptions = {}): Promise<ZhiliuSession> {
  const vaultPath =
    options.vaultPath === null ? null : (options.vaultPath ?? (await mkdtemp(path.join(tmpdir(), 'zhiliu-vault-'))));
  const userDataPath = options.userDataPath ?? (await mkdtemp(path.join(tmpdir(), 'zhiliu-user-data-')));
  const fakeOpenAI = await startFakeOpenAI();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ZHILIU_USER_DATA: userDataPath,
    ZHILIU_OPENAI_BASE_URL: fakeOpenAI.baseUrl,
    ZHILIU_OPENAI_API_KEY: 'e2e-fake-key',
    ZHILIU_E2E: '1',
  };

  if (vaultPath) {
    env.ZHILIU_VAULT = vaultPath;
  } else {
    delete env.ZHILIU_VAULT;
  }

  if (options.chooseDirectory) {
    env.ZHILIU_CHOOSE_DIRECTORY = options.chooseDirectory;
  }

  const app = await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      repoRoot,
    ],
    env,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return {
    app,
    window,
    vaultPath,
    userDataPath,
    fakeOpenAI,
    async close() {
      await app.close().catch(() => undefined);
      await fakeOpenAI.close().catch(() => undefined);
      if (!options.preserveVault && vaultPath) {
        await rm(vaultPath, { recursive: true, force: true });
      }
      if (!options.preserveUserData) {
        await rm(userDataPath, { recursive: true, force: true });
      }
    },
  };
}
