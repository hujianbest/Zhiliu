import { readFile } from 'node:fs/promises';
import sanitizeHtml from 'sanitize-html';
import type { AtomicNote, EmbedCall, SearchHit, SearchQueryOptions, SearchQueryResult } from '../shared/api';
import { EmbeddingError } from './embeddings';
import type { EmbeddingAdapter } from './embeddings';
import { extractReading } from './epub';
import { KeywordIndex, type KeywordDoc } from './keyword-index';
import type { Library } from './library';
import { extractPdfReading } from './pdf';
import type { Vault } from './vault';

const SEMANTIC_THRESHOLD = 0.5;

type VectorDoc = KeywordDoc & { vector: number[] };

function stripTags(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpine(position: string | null): number {
  const match = /^(?:epub|pdf|web):(\d+):/.exec(position ?? '');
  return match ? Number(match[1]) : 0;
}

function snippet(text: string, query: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const haystack = compact.toLowerCase();
  const needle = query.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index < 0) {
    return compact.slice(0, 96);
  }
  const start = Math.max(0, index - 24);
  const end = Math.min(compact.length, index + query.length + 24);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < compact.length ? '…' : '';
  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function hitKey(hit: SearchHit): string {
  if (hit.noteId) {
    return `note:${hit.noteId}`;
  }
  return `${hit.kind}:${hit.sourceId}:${hit.spineIndex ?? 0}`;
}

function toHit(doc: KeywordDoc, query: string): SearchHit {
  const hit: SearchHit = {
    kind: doc.kind,
    title: doc.title,
    snippet: snippet(doc.text, query),
    sourceId: doc.sourceId,
    partialIndex: doc.partialIndex,
    spineIndex: doc.spineIndex,
    provenance: doc.kind === 'note' ? 'user' : 'source',
  };
  if (doc.noteId) {
    hit.noteId = doc.noteId;
  }
  if (doc.sourcePosition) {
    hit.sourcePosition = doc.sourcePosition;
  }
  return hit;
}

function parseOptions(options: SearchQueryOptions | undefined): SearchQueryOptions {
  const mode = options?.mode;
  if (mode === 'keyword' || mode === 'semantic' || mode === 'mix') {
    return { mode };
  }
  return {};
}

export class SearchIndex {
  private docs: KeywordDoc[] = [];
  private readonly keyword = new KeywordIndex();
  private readonly vectors = new Map<string, VectorDoc>();
  private degraded: SearchQueryResult['degraded'] = null;

  constructor(
    private readonly vault: Vault,
    private readonly library: Library,
    private readonly embeddings: EmbeddingAdapter,
  ) {}

  embedCalls(): EmbedCall[] {
    return this.embeddings.embedCalls();
  }

  async rebuild(): Promise<void> {
    this.vectors.clear();
    await this.rebuildKeyword();
    for (const doc of this.docs) {
      await this.upsertVector(doc);
    }
  }

  async indexNote(note: AtomicNote): Promise<void> {
    await this.rebuildKeyword();
    const doc = this.docs.find((item) => item.id === `note:${note.id}`);
    if (doc) {
      await this.upsertVector(doc);
    }
  }

  async indexImportedSources(): Promise<void> {
    await this.rebuildKeyword();
    void this.embedMissing();
  }

  async queryDetailed(q: string, options?: SearchQueryOptions): Promise<SearchQueryResult> {
    const hits = await this.query(q, options);
    return { hits, degraded: this.degraded };
  }

  async query(q: string, options?: SearchQueryOptions): Promise<SearchHit[]> {
    const trimmed = q.trim();
    if (trimmed === '') {
      return [];
    }
    const mode = parseOptions(options).mode ?? 'mix';
    const keywordHits = mode === 'semantic' ? [] : this.keyword.query(trimmed);
    const semanticHits = mode === 'keyword' ? [] : await this.semanticQuery(trimmed);
    if (mode === 'keyword') {
      return keywordHits;
    }
    if (mode === 'semantic') {
      return semanticHits;
    }
    return mergeHits(keywordHits, semanticHits);
  }

  private async rebuildKeyword(): Promise<void> {
    if (!this.vault.path) {
      this.docs = [];
      this.keyword.close();
      return;
    }
    this.keyword.open(this.vault.path);
    this.docs = await this.collectDocs();
    this.keyword.replaceAll(this.docs);
  }

  private async embedMissing(): Promise<void> {
    for (const doc of this.docs) {
      if ((doc.kind === 'epub' || doc.kind === 'pdf' || doc.kind === 'article') && !this.vectors.has(doc.id)) {
        await this.upsertVector(doc);
      }
    }
  }

  private async upsertVector(doc: KeywordDoc): Promise<void> {
    try {
      const vector = await this.embeddings.embed(doc.id, doc.text);
      this.vectors.set(doc.id, { ...doc, vector });
    } catch (error) {
      this.degraded = classifyDegraded(error);
    }
  }

  private async collectDocs(): Promise<KeywordDoc[]> {
    if (!this.vault.path) {
      return [];
    }
    const docs: KeywordDoc[] = [];
    const sources = await this.library.list();
    const titles = new Map(sources.map((source) => [source.id, source.title]));

    for (const note of await this.vault.listNotes()) {
      const sourceTitle = note.sourceId ? titles.get(note.sourceId) : undefined;
      docs.push({
        id: `note:${note.id}`,
        kind: 'note',
        title: sourceTitle || note.thought.trim() || note.quotation.slice(0, 40) || '笔记',
        text: `${note.quotation}\n${note.thought}`,
        sourceId: note.sourceId ?? '',
        noteId: note.id,
        sourcePosition: note.sourcePosition ?? '',
        spineIndex: parseSpine(note.sourcePosition),
        partialIndex: false,
      });
    }

    for (const source of sources) {
      try {
        if (source.kind === 'pdf') {
          const extracted = await extractPdfReading(await readFile(this.library.sourcePath(source.id, source.kind)));
          const partialIndex = source.indexStatus !== 'ready';
          extracted.pages.forEach((page, spineIndex) => {
            docs.push({
              id: `pdf:${source.id}:${spineIndex}`,
              kind: 'pdf',
              title: source.title,
              text: stripTags(page.html),
              sourceId: source.id,
              noteId: '',
              sourcePosition: `pdf:${spineIndex}:0:0:0:0:0:0`,
              spineIndex,
              partialIndex,
            });
          });
          continue;
        }
        if (source.kind === 'web' || source.kind === 'markdown') {
          const raw = await readFile(this.library.sourcePath(source.id, source.kind), 'utf8');
          docs.push({
            id: `article:${source.id}:0`,
            kind: 'article',
            title: source.title,
            text: stripTags(raw),
            sourceId: source.id,
            noteId: '',
            sourcePosition: `web:0:0:0`,
            spineIndex: 0,
            partialIndex: source.indexStatus !== 'ready',
          });
          continue;
        }
        if (source.kind !== 'epub') {
          continue;
        }
        const extracted = await extractReading(await readFile(this.library.sourcePath(source.id, source.kind)));
        const partialIndex = source.indexStatus !== 'ready';
        extracted.chapters.forEach((chapter, spineIndex) => {
          docs.push({
            id: `epub:${source.id}:${spineIndex}`,
            kind: 'epub',
            title: source.title,
            text: stripTags(chapter.html),
            sourceId: source.id,
            noteId: '',
            sourcePosition: `epub:${spineIndex}:0:0`,
            spineIndex,
            partialIndex,
          });
        });
      } catch {
        // Skip sources that cannot be extracted for search.
      }
    }

    return docs;
  }

  private async semanticQuery(trimmed: string): Promise<SearchHit[]> {
    let queryVector: number[];
    try {
      queryVector = await this.embeddings.embed('query', trimmed);
    } catch (error) {
      this.degraded = classifyDegraded(error);
      return [];
    }
    return [...this.vectors.values()]
      .map((doc) => ({ doc, score: cosine(queryVector, doc.vector) }))
      .filter((item) => item.score >= SEMANTIC_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map((item) => toHit(item.doc, trimmed));
  }
}

function mergeHits(keywordHits: SearchHit[], semanticHits: SearchHit[]): SearchHit[] {
  const seen = new Set(keywordHits.map(hitKey));
  const merged = keywordHits.slice();
  for (const hit of semanticHits) {
    const key = hitKey(hit);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(hit);
  }
  return merged;
}

function classifyDegraded(error: unknown): SearchQueryResult['degraded'] {
  if (error instanceof EmbeddingError) {
    return error.code;
  }
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === 'missing-model' || code === 'onnx' || code === 'worker') {
    return code;
  }
  return 'worker';
}
