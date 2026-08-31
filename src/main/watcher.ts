import { watch, type FSWatcher } from 'node:fs';
import type { SearchIndex } from './search';
import type { Vault } from './vault';

export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly vault: Vault,
    private readonly search: SearchIndex,
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.stop();
    const root = this.vault.path;
    if (!root) {
      return;
    }
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        const name = String(filename ?? '').replaceAll('\\', '/');
        if (shouldIgnore(name)) {
          return;
        }
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
          void this.refresh();
        }, 200);
      });
    } catch {
      // Recursive watch is unavailable on some platforms; listing still works after restart.
    }
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async refresh(): Promise<void> {
    await this.search.rebuild();
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function shouldIgnore(name: string): boolean {
  return (
    name === '.git' ||
    name.startsWith('.git/') ||
    name.includes('/.git/') ||
    name.includes('.zhiliu/cache') ||
    name.includes('.zhiliu/traces') ||
    name.includes('.zhiliu/import-reports') ||
    name.endsWith('.epub') ||
    name.endsWith('.pdf')
  );
}
