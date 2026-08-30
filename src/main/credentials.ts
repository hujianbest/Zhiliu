import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface CredentialStore {
  set(account: string, secret: string): Promise<void>;
  get(account: string): Promise<string | null>;
  delete(account: string): Promise<void>;
}

export class FakeCredentialStore implements CredentialStore {
  constructor(private readonly filePath: string) {}

  async set(account: string, secret: string): Promise<void> {
    const all = await this.readAll();
    all[account] = secret;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(all)}\n`, 'utf8');
  }

  async get(account: string): Promise<string | null> {
    const all = await this.readAll();
    return all[account] ?? null;
  }

  async delete(account: string): Promise<void> {
    const all = await this.readAll();
    delete all[account];
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(all)}\n`, 'utf8');
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }
}

type Keytar = {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

export class OsCredentialStore implements CredentialStore {
  private async keytar(): Promise<Keytar> {
    return import('keytar') as Promise<Keytar>;
  }

  async set(account: string, secret: string): Promise<void> {
    const keytar = await this.keytar();
    await keytar.setPassword('zhiliu', account, secret);
  }

  async get(account: string): Promise<string | null> {
    const keytar = await this.keytar();
    return keytar.getPassword('zhiliu', account);
  }

  async delete(account: string): Promise<void> {
    const keytar = await this.keytar();
    await keytar.deletePassword('zhiliu', account);
  }
}

export function createCredentialStore(userDataPath: string, env: NodeJS.ProcessEnv): CredentialStore {
  if (env.ZHILIU_E2E === '1') {
    return new FakeCredentialStore(path.join(userDataPath, 'credentials.json'));
  }
  return new OsCredentialStore();
}
