import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImportFailure, ImportResult, ReadingStatus, SourceDocument, SourceKind } from '../shared/api';
import { parseEpub } from './epub';
import { parsePdf } from './pdf';
import { readProgress } from './reading-ledger';
import type { Vault } from './vault';
import { importWebArticle } from './web';

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
    if (this.env.ZHILIU_E2E !== '1') {
      return null;
    }
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

  sourcePath(id: string, kind: SourceKind = 'epub'): string {
    return path.join(this.requireRoot(), 'sources', `${id}.${extensionFor(kind)}`);
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
          message: error instanceof Error ? error.message : '无法打开：不是有效的来源文档',
        });
      }
    }
    return { sources: await this.list(), failures };
  }

  async importUrl(url: string): Promise<ImportResult> {
    const failures: ImportFailure[] = [];
    try {
      await this.importWeb(url);
    } catch (error) {
      failures.push({
        filename: url,
        message: error instanceof Error ? error.message : '无法导入这个页面',
      });
    }
    return { sources: await this.list(), failures };
  }

  private async importWeb(url: string): Promise<CatalogSource> {
    const root = this.requireRoot();
    const article = await importWebArticle(url);
    const id = randomUUID();
    const dest = path.join(root, 'sources', `${id}.html`);
    const header = [
      `<!-- zhiliu-web source_url=${article.sourceUrl} captured_at=${article.capturedAt} -->`,
      '',
    ].join('\n');
    await writeFile(dest, `${header}${article.html}\n`, 'utf8');
    const source: CatalogSource = {
      id,
      kind: 'web',
      title: article.title,
      authors: article.authors,
      indexStatus: 'pending',
      originalFilename: article.sourceUrl,
      sourceUrl: article.sourceUrl,
      capturedAt: article.capturedAt,
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

  private async importOne(filePath: string): Promise<CatalogSource> {
    const root = this.requireRoot();
    const originalFilename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const bytes = await readFile(filePath);
    const id = randomUUID();
    let kind: SourceKind;
    let title: string;
    let authors: string[];
    if (ext === '.pdf') {
      const parsed = await parsePdf(bytes);
      kind = 'pdf';
      title = parsed.title || stripExtension(originalFilename);
      authors = parsed.authors;
    } else if (ext === '.epub') {
      const parsed = await parseEpub(bytes);
      kind = 'epub';
      title = parsed.title || stripExtension(originalFilename);
      authors = parsed.authors;
    } else {
      throw new Error('无法打开：只支持 EPUB 与 PDF');
    }
    const dest = path.join(root, 'sources', `${id}.${kind}`);
    await writeFile(dest, bytes);
    const source: CatalogSource = {
      id,
      kind,
      title,
      authors,
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
  return filename.replace(/\.(epub|pdf)$/i, '');
}

function extensionFor(kind: SourceKind): string {
  if (kind === 'pdf') {
    return 'pdf';
  }
  if (kind === 'web') {
    return 'html';
  }
  if (kind === 'markdown') {
    return 'md';
  }
  return 'epub';
}
