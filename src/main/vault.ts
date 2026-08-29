import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { AtomicNote, NoteRelation, SaveNoteInput, VaultStatus } from '../shared/api';

const PREFERENCES_FILE = 'preferences.json';
const VAULT_MANIFEST = path.join('.zhiliu', 'vault.json');

type NoteFrontmatter = {
  id: string;
  kind: 'excerpt' | 'thought_note';
  source_id: string | null;
  source_position: string | null;
  quotation: string;
  thought: string;
  created: string;
  updated: string;
  provenance: AtomicNote['provenance'];
  relations: NoteRelation[];
};

export class Vault {
  path: string | null = null;

  constructor(
    private readonly userDataPath: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async openFromEnvironment(): Promise<VaultStatus> {
    const forced = this.env.ZHILIU_VAULT;
    if (forced) {
      await this.use(forced);
      return this.current();
    }

    const remembered = await this.readPreferences();
    if (remembered) {
      try {
        await this.use(remembered);
        return this.current();
      } catch {
        // Remembered directory is gone; treat as first run.
      }
    }

    return { firstRun: true, path: null };
  }

  async use(vaultPath: string): Promise<VaultStatus> {
    await mkdir(path.join(vaultPath, 'notes'), { recursive: true });
    await mkdir(path.join(vaultPath, 'sources'), { recursive: true });
    await mkdir(path.join(vaultPath, '.zhiliu', 'cache'), { recursive: true });
    const manifestPath = path.join(vaultPath, VAULT_MANIFEST);
    try {
      await readFile(manifestPath, 'utf8');
    } catch {
      await writeFile(
        manifestPath,
        `${JSON.stringify({ version: 1, format: 'zhiliu-vault' }, null, 2)}\n`,
        'utf8',
      );
    }
    this.path = vaultPath;
    await this.remember();
    return this.current();
  }

  current(): VaultStatus {
    if (!this.path) {
      return { firstRun: true, path: null };
    }
    return { firstRun: false, path: this.path };
  }

  stubbedChoice(): string | null {
    return this.env.ZHILIU_CHOOSE_DIRECTORY ?? null;
  }

  async saveNote(input: SaveNoteInput): Promise<AtomicNote> {
    const root = this.requirePath();
    const now = new Date().toISOString();
    const thought = input.thought ?? '';
    const note: AtomicNote = {
      id: randomUUID(),
      kind: thought.trim() === '' ? 'excerpt' : 'thought_note',
      sourceId: input.sourceId ?? null,
      sourcePosition: input.sourcePosition ?? null,
      quotation: input.quotation,
      thought,
      created: now,
      updated: now,
      provenance: { quotation: 'source', thought: 'user' },
      relations: input.relations ?? [],
      path: '',
    };
    note.path = path.join(root, 'notes', `${note.id}.md`);
    await mkdir(path.dirname(note.path), { recursive: true });
    await writeFile(note.path, renderNote(note), 'utf8');
    return note;
  }

  async getNote(id: string): Promise<AtomicNote | null> {
    const filePath = await this.findNoteFile(id);
    if (!filePath) {
      return null;
    }
    return parseNote(await readFile(filePath, 'utf8'), filePath);
  }

  private async remember(): Promise<void> {
    if (!this.path) {
      return;
    }
    await mkdir(this.userDataPath, { recursive: true });
    await writeFile(
      path.join(this.userDataPath, PREFERENCES_FILE),
      `${JSON.stringify({ vaultPath: this.path }, null, 2)}\n`,
      'utf8',
    );
  }

  private async readPreferences(): Promise<string | null> {
    try {
      const raw = await readFile(path.join(this.userDataPath, PREFERENCES_FILE), 'utf8');
      const parsed = JSON.parse(raw) as { vaultPath?: string };
      return parsed.vaultPath ?? null;
    } catch {
      return null;
    }
  }

  private requirePath(): string {
    if (!this.path) {
      throw new Error('还没有打开知识库');
    }
    return this.path;
  }

  private async findNoteFile(id: string): Promise<string | null> {
    for (const filePath of await listMarkdown(path.join(this.requirePath(), 'notes'))) {
      const parsed = matter(await readFile(filePath, 'utf8'));
      if (parsed.data.id === id) {
        return filePath;
      }
    }
    return null;
  }
}

async function listMarkdown(root: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

function renderNote(note: AtomicNote): string {
  const data: NoteFrontmatter = {
    id: note.id,
    kind: note.kind,
    source_id: note.sourceId,
    source_position: note.sourcePosition,
    quotation: note.quotation,
    thought: note.thought,
    created: note.created,
    updated: note.updated,
    provenance: note.provenance,
    relations: note.relations,
  };
  const body = ['## 引文', '', note.quotation, '', '## 想法', '', note.thought || '（无）', ''].join('\n');
  return matter.stringify(body, data);
}

function parseNote(raw: string, filePath: string): AtomicNote {
  const parsed = matter(raw);
  const data = parsed.data as NoteFrontmatter;
  return {
    id: String(data.id),
    kind: data.kind,
    sourceId: data.source_id ?? null,
    sourcePosition: data.source_position ?? null,
    quotation: String(data.quotation ?? ''),
    thought: String(data.thought ?? ''),
    created: String(data.created),
    updated: String(data.updated),
    provenance: data.provenance,
    relations: data.relations ?? [],
    path: filePath,
  };
}
