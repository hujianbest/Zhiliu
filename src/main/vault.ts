import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { AtomicNote, NoteRelation, SaveNoteInput, VaultStatus } from '../shared/api';
import type { PreferenceStore } from './preferences';

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
    private readonly preferences: PreferenceStore,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async openFromEnvironment(): Promise<VaultStatus> {
    const forced = this.env.ZHILIU_VAULT;
    if (forced) {
      await this.use(forced);
      return this.current();
    }

    const remembered = (await this.preferences.read()).vaultPath;
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
    await writeVaultGitignore(vaultPath);
    await ensureLibraryFile(vaultPath);
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
    if (input.id) {
      const existing = await this.getNote(input.id);
      if (!existing) {
        throw new Error('找不到这条笔记');
      }
      const note: AtomicNote = {
        ...existing,
        kind: thought.trim() === '' ? 'excerpt' : 'thought_note',
        quotation: input.quotation,
        thought,
        sourceId: input.sourceId ?? existing.sourceId,
        sourcePosition: input.sourcePosition ?? existing.sourcePosition,
        relations: input.relations ?? existing.relations,
        updated: now,
      };
      await writeFile(note.path, renderNote(note), 'utf8');
      return note;
    }
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

  async listNotes(): Promise<AtomicNote[]> {
    const notes: AtomicNote[] = [];
    for (const filePath of await listMarkdown(path.join(this.requirePath(), 'notes'))) {
      try {
        notes.push(parseNote(await readFile(filePath, 'utf8'), filePath));
      } catch {
        // Skip files that are not readable atomic notes.
      }
    }
    notes.sort((a, b) => a.created.localeCompare(b.created));
    return notes;
  }

  async listNotesForSource(sourceId: string): Promise<AtomicNote[]> {
    return (await this.listNotes()).filter((note) => note.sourceId === sourceId);
  }

  private async remember(): Promise<void> {
    if (!this.path) {
      return;
    }
    await this.preferences.update({ vaultPath: this.path });
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

const VAULT_GITIGNORE = [
  '# Source binaries and rebuildable artefacts. Knowledge text stays tracked.',
  '*.epub',
  '*.pdf',
  '.zhiliu/cache/',
  '.zhiliu/ocr/',
  'models/',
  '*.onnx',
  '',
].join('\n');

const REQUIRED_IGNORES = ['*.epub', '*.pdf', '.zhiliu/cache/', '.zhiliu/ocr/', 'models/', '*.onnx'];

async function writeVaultGitignore(vaultPath: string): Promise<void> {
  const gitignorePath = path.join(vaultPath, '.gitignore');
  let current = '';
  try {
    current = await readFile(gitignorePath, 'utf8');
  } catch {
    await writeFile(gitignorePath, VAULT_GITIGNORE, 'utf8');
    return;
  }
  const missing = REQUIRED_IGNORES.filter((line) => !current.split('\n').includes(line));
  if (missing.length === 0) {
    return;
  }
  const suffix = `${current.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`;
  await writeFile(gitignorePath, `${current}${suffix}`, 'utf8');
}

async function ensureLibraryFile(vaultPath: string): Promise<void> {
  const libraryPath = path.join(vaultPath, '.zhiliu', 'library.json');
  try {
    await readFile(libraryPath, 'utf8');
  } catch {
    await writeFile(libraryPath, `${JSON.stringify({ version: 1, sources: [] }, null, 2)}\n`, 'utf8');
  }
}
