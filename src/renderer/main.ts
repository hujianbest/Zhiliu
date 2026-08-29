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
