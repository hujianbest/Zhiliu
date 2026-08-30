import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ModelRoleConfig = {
  baseUrl: string;
  model: string;
};

export type AppPreferences = {
  vaultPath?: string;
  models?: {
    fast?: ModelRoleConfig;
    deep?: ModelRoleConfig;
  };
  openSourceId?: string | null;
};

export class PreferenceStore {
  constructor(private readonly userDataPath: string) {}

  async read(): Promise<AppPreferences> {
    try {
      const raw = await readFile(path.join(this.userDataPath, 'preferences.json'), 'utf8');
      return JSON.parse(raw) as AppPreferences;
    } catch {
      return {};
    }
  }

  async update(patch: AppPreferences): Promise<AppPreferences> {
    const current = await this.read();
    const next: AppPreferences = {
      ...current,
      ...patch,
      models: patch.models ? { ...current.models, ...patch.models } : current.models,
    };
    await mkdir(this.userDataPath, { recursive: true });
    await writeFile(
      path.join(this.userDataPath, 'preferences.json'),
      `${JSON.stringify(next, null, 2)}\n`,
      'utf8',
    );
    return next;
  }
}
