import { readFile } from 'node:fs/promises';
import MiniSearch from 'minisearch';
import sanitizeHtml from 'sanitize-html';
import type { AtomicNote, EmbedCall, SearchHit, SearchKind, SearchQueryOptions } from '../shared/api';
import type { EmbeddingAdapter } from './embeddings';
import { extractReading } from './epub';
import type { Library } from './library';
import type { Vault } from './vault';

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;
const SEMANTIC_THRESHOLD = 0.5;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.normalize('NFKC').toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g);
  if (latin) {
    tokens.push(...latin);
  }
  const cjk: string[] = [];
  for (const ch of lower) {
    if (CJK.test(ch)) {
      cjk.push(ch);
    }
  }
  tokens.push(...cjk);
  for (let i = 0; i < cjk.length - 1; i += 1) {
    tokens.push(`${cjk[i]}${cjk[i + 1]}`);
  }
  return tokens.filter((token) => token.length > 0);
}

type IndexedDoc = {
  id: string;
  kind: SearchKind;
  title: string;
  text: string;
  sourceId: string;
  noteId: string;
  sourcePosition: string;
  spineIndex: number;
  partialIndex: boolean;
};

type VectorDoc = IndexedDoc & { vector: number[] };

function createEngine(): MiniSearch<IndexedDoc> {
  return new MiniSearch<IndexedDoc>({
    fields: ['title', 'text'],
    storeFields: ['kind', 'title', 'text', 'sourceId', 'noteId', 'sourcePosition', 'spineIndex', 'partialIndex'],
    tokenize,
    searchOptions: {
      boost: { title: 2, text: 1 },
      prefix: true,
      combineWith: 'AND',
    },
  });
}

function stripTags(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpine(position: string | null): number {
  const match = /^epub:(\d+):/.exec(position ?? '');
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

function toHit(doc: IndexedDoc, query: string): SearchHit {
  const hit: SearchHit = {
    kind: doc.kind,
    title: doc.title,
    snippet: snippet(doc.text, query),
    sourceId: doc.sourceId,
    partialIndex: doc.partialIndex,
    spineIndex: doc.spineIndex,
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
  private engine = createEngine();
  private docs: IndexedDoc[] = [];
  private readonly vectors = new Map<string, VectorDoc>();

  constructor(
    private readonly vault: Vault,
    private readonly library: Library,
    private readonly embeddings: EmbeddingAdapter,
  ) {}

  embedCalls(): EmbedCall[] {
    return this.embeddings.embedCalls();
  }

  async rebuild(): Promise<void> {
    await this.rebuildKeyword();
    for (const doc of this.docs) {
      if (!this.vectors.has(doc.id)) {
        await this.upsertVector(doc);
      }
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
    for (const doc of this.docs) {
      if (doc.kind === 'epub' && !this.vectors.has(doc.id)) {
        await this.upsertVector(doc);
      }
    }
  }

  async query(q: string, options?: SearchQueryOptions): Promise<SearchHit[]> {
    const trimmed = q.trim();
    if (trimmed === '') {
      return [];
    }
    const mode = parseOptions(options).mode ?? 'mix';
    const keywordHits = mode === 'semantic' ? [] : this.keywordQuery(trimmed);
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
    this.engine = createEngine();
    this.docs = await this.collectDocs();
    if (this.docs.length > 0) {
      this.engine.addAll(this.docs);
    }
  }

  private async upsertVector(doc: IndexedDoc): Promise<void> {
    try {
      const vector = await this.embeddings.embed(doc.id, doc.text);
      this.vectors.set(doc.id, { ...doc, vector });
    } catch {
      // Embedding runtime unavailable: keyword search still works.
    }
  }

  private async collectDocs(): Promise<IndexedDoc[]> {
    if (!this.vault.path) {
      return [];
    }
    const docs: IndexedDoc[] = [];
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
      if (source.kind !== 'epub') {
        continue;
      }
      try {
        const extracted = await extractReading(await readFile(this.library.sourcePath(source.id)));
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

  private keywordQuery(trimmed: string): SearchHit[] {
    try {
      return this.engine.search(trimmed).map((result) => toHit(result as IndexedDoc, trimmed));
    } catch {
      return [];
    }
  }

  private async semanticQuery(trimmed: string): Promise<SearchHit[]> {
    let queryVector: number[];
    try {
      queryVector = await this.embeddings.embed('query', trimmed);
    } catch {
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
