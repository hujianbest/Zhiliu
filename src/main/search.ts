import { readFile } from 'node:fs/promises';
import MiniSearch from 'minisearch';
import sanitizeHtml from 'sanitize-html';
import type { SearchHit, SearchKind } from '../shared/api';
import { extractReading } from './epub';
import type { Library } from './library';
import type { Vault } from './vault';

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;

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

export class SearchIndex {
  private engine = createEngine();

  constructor(
    private readonly vault: Vault,
    private readonly library: Library,
  ) {}

  async rebuild(): Promise<void> {
    this.engine = createEngine();
    if (!this.vault.path) {
      return;
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

    if (docs.length > 0) {
      this.engine.addAll(docs);
    }
  }

  query(q: string): SearchHit[] {
    const trimmed = q.trim();
    if (trimmed === '') {
      return [];
    }
    try {
      return this.engine.search(trimmed).map((result) => {
        const hit: SearchHit = {
          kind: result.kind,
          title: result.title,
          snippet: snippet(result.text, trimmed),
          sourceId: result.sourceId,
          partialIndex: result.partialIndex,
          spineIndex: result.spineIndex,
        };
        if (result.noteId) {
          hit.noteId = result.noteId;
        }
        if (result.sourcePosition) {
          hit.sourcePosition = result.sourcePosition;
        }
        return hit;
      });
    } catch {
      return [];
    }
  }
}
