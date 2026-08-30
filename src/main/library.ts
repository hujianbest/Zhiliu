import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImportFailure, ImportResult, ReadingStatus, SourceDocument } from '../shared/api';
import { parseEpub } from './epub';
import { readProgress } from './reading-ledger';
import type { Vault } from './vault';

type CatalogSource = Omit<SourceDocument, 'readingStatus'>;

type LibraryFile = {
  version: 1;
  sources: CatalogSource[];
};

export class Library {
  constructor(
    private readonly vault: Vault,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  stubbedFiles(): string[] | null {
    const raw = this.env.ZHILIU_CHOOSE_FILES;
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('ZHILIU_CHOOSE_FILES 必须是 JSON 字符串数组');
    }
    return parsed;
  }

  async list(): Promise<SourceDocument[]> {
    const sources = (await this.read()).sources;
    let statuses: Record<string, ReadingStatus> = {};
    try {
      const progress = await readProgress(this.requireRoot());
      for (const [id, book] of Object.entries(progress.books)) {
        statuses[id] = book.status;
      }
    } catch {
      statuses = {};
    }
    return sources.map((source) => ({
      ...source,
      readingStatus: statuses[source.id] ?? 'unread',
    }));
  }

  async get(id: string): Promise<CatalogSource | null> {
    return (await this.read()).sources.find((source) => source.id === id) ?? null;
  }

  sourcePath(id: string): string {
    return path.join(this.requireRoot(), 'sources', `${id}.epub`);
  }

  root(): string {
    return this.requireRoot();
  }

  async importPaths(filePaths: string[]): Promise<ImportResult> {
    const failures: ImportFailure[] = [];
    for (const filePath of filePaths) {
      try {
        await this.importOne(filePath);
      } catch (error) {
        failures.push({
          filename: path.basename(filePath),
          message: error instanceof Error ? error.message : '无法打开：不是有效的 EPUB',
        });
      }
    }
    return { sources: await this.list(), failures };
  }

  private async importOne(filePath: string): Promise<CatalogSource> {
    const root = this.requireRoot();
    const originalFilename = path.basename(filePath);
    const bytes = await readFile(filePath);
    const parsed = await parseEpub(bytes);
    const id = randomUUID();
    const dest = path.join(root, 'sources', `${id}.epub`);
    await writeFile(dest, bytes);
    const source: CatalogSource = {
      id,
      kind: 'epub',
      title: parsed.title || stripExtension(originalFilename),
      authors: parsed.authors,
      indexStatus: 'pending',
      originalFilename,
    };
    try {
      const current = await this.read();
      current.sources.push(source);
      await this.write(current);
      return source;
    } catch (error) {
      await rm(dest, { force: true });
      throw error;
    }
  }

  private async read(): Promise<LibraryFile> {
    const root = this.requireRoot();
    try {
      return JSON.parse(await readFile(path.join(root, '.zhiliu', 'library.json'), 'utf8')) as LibraryFile;
    } catch {
      return { version: 1, sources: [] };
    }
  }

  private async write(file: LibraryFile): Promise<void> {
    const root = this.requireRoot();
    await writeFile(path.join(root, '.zhiliu', 'library.json'), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }

  private requireRoot(): string {
    if (!this.vault.path) {
      throw new Error('还没有打开知识库');
    }
    return this.vault.path;
  }
}

function stripExtension(filename: string): string {
  return filename.replace(/\.epub$/i, '');
}
