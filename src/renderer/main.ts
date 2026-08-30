import type { ModelRole, ModelSettingsView, ProbeResult } from '../shared/api';

const spaces = ['library', 'thoughts', 'creation'] as const;
type Space = (typeof spaces)[number];

const probeCopy: Record<ProbeResult, string> = {
  ok: '连通成功',
  unauthorized: '凭据无效',
  unreachable: '端点不可达',
};

function isSpace(value: string | null): value is Space {
  return value === 'library' || value === 'thoughts' || value === 'creation';
}

function showSpace(space: Space): void {
  document.querySelectorAll<HTMLButtonElement>('[data-space]').forEach((button) => {
    const current = button.dataset.space === space;
    button.setAttribute('aria-current', current ? 'page' : 'false');
  });

  document.querySelectorAll<HTMLElement>('[data-space-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.spacePanel !== space;
  });
}

function showApp(firstRun: boolean): void {
  const firstRunScreen = document.getElementById('first-run');
  const shell = document.getElementById('app-shell');
  if (!firstRunScreen || !shell) {
    return;
  }
  firstRunScreen.hidden = !firstRun;
  shell.hidden = firstRun;
}

function settingsDialog(): HTMLDialogElement {
  return document.getElementById('settings') as HTMLDialogElement;
}

function input(name: string): HTMLInputElement {
  return document.querySelector(`#settings-form [name="${name}"]`) as HTMLInputElement;
}

async function refreshAgent(view?: ModelSettingsView): Promise<void> {
  const status = view ?? (await window.zhiliu.models.view());
  const unconfigured = document.getElementById('agent-unconfigured');
  const openSettings = document.getElementById('agent-open-settings');
  const copy = document.getElementById('agent-copy');
  if (!unconfigured || !openSettings || !copy) {
    return;
  }
  unconfigured.textContent = status.configured ? '' : '尚未配置模型。';
  unconfigured.hidden = status.configured;
  openSettings.hidden = status.configured;
  copy.hidden = !status.configured;
}

function fillSettings(view: ModelSettingsView): void {
  input('fast-base-url').value = view.fast.baseUrl;
  input('fast-model').value = view.fast.model;
  input('fast-api-key').value = '';
  input('fast-api-key').placeholder = view.fast.hasKey ? '已保存' : '';
  input('deep-base-url').value = view.deep.baseUrl;
  input('deep-model').value = view.deep.model;
  input('deep-api-key').value = '';
  input('deep-api-key').placeholder = view.deep.hasKey ? '已保存' : '';
}

async function openSettings(): Promise<void> {
  fillSettings(await window.zhiliu.models.view());
  document.getElementById('settings-saved')!.textContent = '';
  settingsDialog().showModal();
  input('fast-base-url').focus();
}

document.querySelectorAll<HTMLButtonElement>('[data-space]').forEach((button) => {
  button.addEventListener('click', () => {
    if (isSpace(button.dataset.space)) {
      showSpace(button.dataset.space);
    }
  });
});

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return;
  }

  if (event.key === ',') {
    event.preventDefault();
    void openSettings();
    return;
  }

  const byKey: Record<string, Space> = {
    '1': 'library',
    '2': 'thoughts',
    '3': 'creation',
  };
  const space = byKey[event.key];
  if (!space) {
    return;
  }

  event.preventDefault();
  showSpace(space);
});

document.getElementById('choose-vault')?.addEventListener('click', () => {
  void window.zhiliu.vault.choose().then((status) => {
    if (!status.firstRun) {
      showApp(false);
    }
  });
});

document.getElementById('open-settings')?.addEventListener('click', () => {
  void openSettings();
});
document.getElementById('agent-open-settings')?.addEventListener('click', () => {
  void openSettings();
});
document.getElementById('settings-close')?.addEventListener('click', () => {
  settingsDialog().close();
});

document.querySelectorAll<HTMLButtonElement>('[data-probe]').forEach((button) => {
  button.addEventListener('click', () => {
    const role = button.dataset.probe as ModelRole;
    const status = document.querySelector(`[data-probe-result="${role}"]`);
    if (!status) {
      return;
    }
    status.textContent = '正在测试…';
    void window.zhiliu.models
      .probe({
        role,
        baseUrl: input(`${role}-base-url`).value,
        apiKey: input(`${role}-api-key`).value,
      })
      .then((outcome) => {
        status.textContent = probeCopy[outcome.result];
      });
  });
});

document.getElementById('settings-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  void window.zhiliu.models
    .save({
      fast: {
        baseUrl: input('fast-base-url').value,
        model: input('fast-model').value,
        apiKey: input('fast-api-key').value,
      },
      deep: {
        baseUrl: input('deep-base-url').value,
        model: input('deep-model').value,
        apiKey: input('deep-api-key').value,
      },
    })
    .then((view) => {
      fillSettings(view);
      document.getElementById('settings-saved')!.textContent = '已保存';
      return refreshAgent(view);
    });
});

void window.zhiliu.vault.current().then((status) => {
  showApp(status.firstRun);
  if (!status.firstRun) {
    void refreshAgent();
  }
});
