import { access } from 'node:fs/promises';
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
  chooseFiles?: string[];
  preserveUserData?: boolean;
  preserveVault?: boolean;
};

export type ZhiliuSession = {
  app: ElectronApplication;
  window: Page;
  vaultPath: string | null;
  userDataPath: string;
  fakeOpenAI: FakeOpenAI;
  executablePath: string;
  close(): Promise<void>;
};

export function packagedExecutablePath(): string {
  if (process.env.ZHILIU_PACKAGED_APP) {
    return process.env.ZHILIU_PACKAGED_APP;
  }
  if (process.platform === 'darwin') {
    return path.join(repoRoot, 'release/mac/知流.app/Contents/MacOS/zhiliu');
  }
  if (process.platform === 'win32') {
    return path.join(repoRoot, 'release/win-unpacked/zhiliu.exe');
  }
  return path.join(repoRoot, 'release/linux-unpacked/zhiliu');
}

export async function launchZhiliu(options: LaunchOptions = {}): Promise<ZhiliuSession> {
  const vaultPath =
    options.vaultPath === null ? null : (options.vaultPath ?? (await mkdtemp(path.join(tmpdir(), 'zhiliu-vault-'))));
  const userDataPath = options.userDataPath ?? (await mkdtemp(path.join(tmpdir(), 'zhiliu-user-data-')));
  const fakeOpenAI = await startFakeOpenAI();
  const executablePath = packagedExecutablePath();

  try {
    await access(executablePath);
  } catch {
    throw new Error(`找不到打包二进制 ${executablePath}。请先运行 npm run pack:dir。`);
  }

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

  if (options.chooseFiles && options.chooseFiles.length > 0) {
    env.ZHILIU_CHOOSE_FILES = JSON.stringify(options.chooseFiles);
  }

  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer'],
    env,
    timeout: 60_000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return {
    app,
    window,
    vaultPath,
    userDataPath,
    fakeOpenAI,
    executablePath,
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
