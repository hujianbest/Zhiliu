import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { AtomicNote, BrokenNote, NoteConflict, NoteRelation, SaveNoteInput, VaultStatus } from '../shared/api';
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
      const diskRaw = await readFile(existing.path, 'utf8');
      const disk = parseNote(diskRaw, existing.path);
      const baseQuotation = input.baseQuotation;
      const baseThought = input.baseThought;
      const concurrent =
        baseQuotation !== undefined &&
        baseThought !== undefined &&
        (disk.quotation !== baseQuotation || disk.thought !== baseThought);
      if (concurrent) {
        const conflictPath = conflictPathFor(existing.path);
        await writeFile(conflictPath, renderNote({ ...note, path: conflictPath }), 'utf8');
        return { ...note, path: conflictPath };
      }
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
    return (await this.inspectNotes()).notes;
  }

  async listBroken(): Promise<BrokenNote[]> {
    return (await this.inspectNotes()).broken;
  }

  async listConflicts(): Promise<NoteConflict[]> {
    const conflicts: NoteConflict[] = [];
    for (const filePath of await listMarkdown(path.join(this.requirePath(), 'notes'))) {
      if (!isConflictPath(filePath)) {
        continue;
      }
      try {
        const note = parseNote(await readFile(filePath, 'utf8'), filePath);
        conflicts.push({ path: filePath, id: note.id, quotation: note.quotation, thought: note.thought });
      } catch {
        conflicts.push({ path: filePath, id: '', quotation: '', thought: '' });
      }
    }
    return conflicts;
  }

  async resolveConflict(filePath: string, keep: 'disk' | 'incoming'): Promise<void> {
    const root = this.requirePath();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.join(root, 'notes')) || !isConflictPath(resolved)) {
      throw new Error('只能处理知识库内的冲突副本');
    }
      if (keep === 'incoming') {
      const incoming = await readFile(resolved, 'utf8');
      const target = resolved.replace(/\.conflict\.md$/, '.md');
      await writeFile(target, incoming, 'utf8');
    }
    await unlink(resolved);
  }

  async repairNote(filePath: string, id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed || trimmed === 'undefined') {
      throw new Error('稳定标识不能为空');
    }
    const root = this.requirePath();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.join(root, 'notes'))) {
      throw new Error('只能修复知识库内的笔记');
    }
    const raw = await readFile(resolved, 'utf8');
    const parsed = matter(raw);
    parsed.data.id = id;
    await writeFile(resolved, matter.stringify(parsed.content, parsed.data), 'utf8');
  }

  private async inspectNotes(): Promise<{ notes: AtomicNote[]; broken: BrokenNote[] }> {
    const notes: AtomicNote[] = [];
    const broken: BrokenNote[] = [];
    const byId = new Map<string, AtomicNote[]>();
    for (const filePath of await listMarkdown(path.join(this.requirePath(), 'notes'))) {
      if (isConflictPath(filePath) || isRevisionPath(filePath)) {
        continue;
      }
      try {
        const note = parseNote(await readFile(filePath, 'utf8'), filePath);
        if (!note.id || note.id === 'undefined') {
          broken.push({ path: filePath, reason: 'missing-id' });
          continue;
        }
        const group = byId.get(note.id) ?? [];
        group.push(note);
        byId.set(note.id, group);
      } catch {
        broken.push({ path: filePath, reason: 'invalid' });
      }
    }
    for (const [id, group] of byId) {
      if (group.length > 1) {
        for (const note of group) {
          broken.push({ path: note.path, reason: 'duplicate-id', id });
        }
        continue;
      }
      notes.push(group[0]);
    }
    notes.sort((a, b) => a.created.localeCompare(b.created));
    return { notes, broken };
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
      if (isConflictPath(filePath) || isRevisionPath(filePath)) {
        continue;
      }
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

function isConflictPath(filePath: string): boolean {
  return filePath.endsWith('.conflict.md');
}

function isRevisionPath(filePath: string): boolean {
  return filePath.endsWith('.revision.md');
}

function conflictPathFor(filePath: string): string {
  return filePath.replace(/\.md$/, '.conflict.md');
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
  const data = parsed.data as Partial<NoteFrontmatter> & Record<string, unknown>;
  const thought = String(data.thought ?? '');
  const kind = data.kind === 'excerpt' || data.kind === 'thought_note' ? data.kind : thought.trim() ? 'thought_note' : 'excerpt';
  return {
    id: data.id == null ? '' : String(data.id),
    kind,
    sourceId: (data.source_id as string | null | undefined) ?? null,
    sourcePosition: (data.source_position as string | null | undefined) ?? null,
    quotation: String(data.quotation ?? ''),
    thought,
    created: String(data.created ?? ''),
    updated: String(data.updated ?? ''),
    provenance: data.provenance ?? { quotation: 'source', thought: 'user' },
    relations: Array.isArray(data.relations) ? data.relations : [],
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
