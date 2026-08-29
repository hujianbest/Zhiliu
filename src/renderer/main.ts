const spaces = ['library', 'thoughts', 'creation'] as const;
type Space = (typeof spaces)[number];

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

void window.zhiliu.vault.current().then((status) => {
  showApp(status.firstRun);
});
