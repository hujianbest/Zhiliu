import type { ModelRole, ModelSettingsView, ProbeOutcome, SaveModelSettingsInput } from '../shared/api';
import type { CredentialStore } from './credentials';
import { probeOpenAI } from './openai-probe';
import type { PreferenceStore } from './preferences';

const ACCOUNTS: Record<ModelRole, string> = {
  fast: 'model-role-fast',
  deep: 'model-role-deep',
};

export class ModelSettings {
  constructor(
    private readonly preferences: PreferenceStore,
    private readonly credentials: CredentialStore,
  ) {}

  async view(): Promise<ModelSettingsView> {
    const prefs = await this.preferences.read();
    const fastKey = await this.credentials.get(ACCOUNTS.fast);
    const deepKey = await this.credentials.get(ACCOUNTS.deep);
    const fast = {
      baseUrl: prefs.models?.fast?.baseUrl ?? '',
      model: prefs.models?.fast?.model ?? '',
      hasKey: Boolean(fastKey),
    };
    const deep = {
      baseUrl: prefs.models?.deep?.baseUrl ?? '',
      model: prefs.models?.deep?.model ?? '',
      hasKey: Boolean(deepKey),
    };
    return {
      configured: (fast.baseUrl && fast.model && fast.hasKey) || (deep.baseUrl && deep.model && deep.hasKey)
        ? true
        : false,
      fast,
      deep,
    };
  }

  async save(input: SaveModelSettingsInput): Promise<ModelSettingsView> {
    await this.preferences.update({
      models: {
        fast: { baseUrl: input.fast.baseUrl.trim(), model: input.fast.model.trim() },
        deep: { baseUrl: input.deep.baseUrl.trim(), model: input.deep.model.trim() },
      },
    });
    await this.writeKey('fast', input.fast.apiKey);
    await this.writeKey('deep', input.deep.apiKey);
    return this.view();
  }

  async resolve(role: ModelRole = 'fast'): Promise<{ baseUrl: string; model: string; apiKey: string } | null> {
    const view = await this.view();
    const chosen = view[role].hasKey && view[role].baseUrl ? view[role] : view.fast.hasKey ? view.fast : view.deep;
    if (!chosen.baseUrl || !chosen.model || !chosen.hasKey) {
      return null;
    }
    const account = chosen === view.deep ? ACCOUNTS.deep : ACCOUNTS.fast;
    const apiKey = (await this.credentials.get(account)) ?? '';
    if (!apiKey) {
      return null;
    }
    return { baseUrl: chosen.baseUrl, model: chosen.model, apiKey };
  }

  async probe(input: { baseUrl: string; apiKey: string; role?: ModelRole }): Promise<ProbeOutcome> {
    let apiKey = input.apiKey;
    if (!apiKey && input.role) {
      apiKey = (await this.credentials.get(ACCOUNTS[input.role])) ?? '';
    }
    const result = await probeOpenAI(input.baseUrl, apiKey);
    return { result };
  }

  private async writeKey(role: ModelRole, apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return;
    }
    await this.credentials.set(ACCOUNTS[role], trimmed);
  }
}
