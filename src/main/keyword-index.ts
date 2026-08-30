import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { SearchHit, SearchKind, ProvenanceValue } from '../shared/api';

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;
const LATIN = /[a-z0-9]+/gi;

export type KeywordDoc = {
  id: string;
  kind: SearchKind;
  title: string;
  text: string;
  sourceId: string;
  noteId: string;
  sourcePosition: string;
  spineIndex: number;
  partialIndex: boolean;
  provenance: ProvenanceValue;
};

type StoredRow = {
  id: string;
  kind: SearchKind;
  title: string;
  text: string;
  source_id: string;
  note_id: string;
  source_position: string;
  spine_index: number;
  partial_index: number;
  provenance: ProvenanceValue;
  score: number;
};

function snippet(text: string, query: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const haystack = compact.toLowerCase();
  const needles = [query, ...cjkRuns(query), ...latinTerms(query)].filter((item) => item.length > 0);
  let index = -1;
  let matched = query;
  for (const needle of needles) {
    const at = haystack.indexOf(needle.toLowerCase());
    if (at >= 0 && (index < 0 || at < index)) {
      index = at;
      matched = needle;
    }
  }
  if (index < 0) {
    return compact.slice(0, 96);
  }
  const start = Math.max(0, index - 24);
  const end = Math.min(compact.length, index + matched.length + 24);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < compact.length ? '…' : '';
  return `${prefix}${compact.slice(start, end)}${suffix}`;
}

export function latinTerms(query: string): string[] {
  return query.normalize('NFKC').toLowerCase().match(LATIN) ?? [];
}

export function cjkRuns(query: string): string[] {
  const runs: string[] = [];
  let current = '';
  for (const ch of query.normalize('NFKC')) {
    if (CJK.test(ch)) {
      current += ch;
    } else if (current) {
      runs.push(current);
      current = '';
    }
  }
  if (current) {
    runs.push(current);
  }
  return runs;
}

function cjkLength(text: string): number {
  return [...text].length;
}

function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

function escapeMatch(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toHit(row: StoredRow, query: string): SearchHit {
  const hit: SearchHit = {
    kind: row.kind,
    title: row.title,
    snippet: snippet(row.text, query),
    sourceId: row.source_id,
    partialIndex: row.partial_index === 1,
    provenance: (row.provenance as ProvenanceValue) || (row.kind === 'note' ? 'user' : 'source'),
    spineIndex: row.spine_index,
  };
  if (row.note_id) {
    hit.noteId = row.note_id;
  }
  if (row.source_position) {
    hit.sourcePosition = row.source_position;
  }
  return hit;
}

export class KeywordIndex {
  private db: Database.Database | null = null;
  private dbPath = '';

  open(vaultPath: string): void {
    const next = path.join(vaultPath, '.zhiliu', 'cache', 'search.sqlite');
    if (this.db && this.dbPath === next) {
      return;
    }
    this.close();
    mkdirSync(path.dirname(next), { recursive: true });
    const db = new Database(next);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        source_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        source_position TEXT NOT NULL,
        spine_index INTEGER NOT NULL,
        partial_index INTEGER NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'source'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_latin USING fts5(
        id UNINDEXED,
        title,
        text,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_cjk USING fts5(
        id UNINDEXED,
        title,
        text,
        tokenize = 'trigram'
      );
    `);
    this.db = db;
    this.dbPath = next;
    try {
      db.exec("ALTER TABLE docs ADD COLUMN provenance TEXT NOT NULL DEFAULT 'source'");
    } catch {
      // Column already exists on fresh tables.
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.dbPath = '';
  }

  replaceAll(docs: KeywordDoc[]): void {
    const db = this.requireDb();
    const tx = db.transaction(() => {
      db.exec('DELETE FROM fts_latin; DELETE FROM fts_cjk; DELETE FROM docs;');
      this.insertDocs(db, docs);
    });
    tx();
  }

  appendAll(docs: KeywordDoc[]): void {
    const db = this.requireDb();
    const tx = db.transaction(() => {
      this.insertDocs(db, docs);
    });
    tx();
  }

  private insertDocs(db: Database.Database, docs: KeywordDoc[]): void {
    const insertDoc = db.prepare(`
      INSERT OR REPLACE INTO docs (id, kind, title, text, source_id, note_id, source_position, spine_index, partial_index, provenance)
      VALUES (@id, @kind, @title, @text, @sourceId, @noteId, @sourcePosition, @spineIndex, @partialIndex, @provenance)
    `);
    const insertLatin = db.prepare('INSERT INTO fts_latin (id, title, text) VALUES (?, ?, ?)');
    const insertCjk = db.prepare('INSERT INTO fts_cjk (id, title, text) VALUES (?, ?, ?)');
    for (const doc of docs) {
      insertDoc.run({
        id: doc.id,
        kind: doc.kind,
        title: doc.title,
        text: doc.text,
        sourceId: doc.sourceId,
        noteId: doc.noteId,
        sourcePosition: doc.sourcePosition,
        spineIndex: doc.spineIndex,
        partialIndex: doc.partialIndex ? 1 : 0,
        provenance: doc.provenance,
      });
      insertLatin.run(doc.id, doc.title, doc.text);
      insertCjk.run(doc.id, doc.title, doc.text);
    }
  }

  query(raw: string): SearchHit[] {
    const db = this.db;
    if (!db) {
      return [];
    }
    const query = raw.trim();
    if (query === '') {
      return [];
    }
    const ranked = new Map<string, StoredRow>();
    const remember = (row: StoredRow) => {
      const existing = ranked.get(row.id);
      if (!existing || row.score < existing.score) {
        ranked.set(row.id, row);
      }
    };

    for (const term of latinTerms(query)) {
      for (const row of this.matchTable('fts_latin', term)) {
        remember(row);
      }
    }

    for (const run of cjkRuns(query)) {
      if (cjkLength(run) < 3) {
        for (const row of this.likeRows(run)) {
          remember({ ...row, score: row.score + 1 });
        }
        continue;
      }
      for (const row of this.matchTable('fts_cjk', run)) {
        remember(row);
      }
    }

    if (latinTerms(query).length === 0 && cjkRuns(query).length === 0) {
      return [];
    }

    return [...ranked.values()]
      .sort((a, b) => a.score - b.score)
      .map((row) => toHit(row, query));
  }

  private matchTable(table: 'fts_latin' | 'fts_cjk', term: string): StoredRow[] {
    const db = this.requireDb();
    try {
      return db
        .prepare(
          `
          SELECT docs.*, bm25(${table}) AS score
          FROM ${table}
          JOIN docs ON docs.id = ${table}.id
          WHERE ${table} MATCH ?
        `,
        )
        .all(escapeMatch(term)) as StoredRow[];
    } catch {
      return [];
    }
  }

  private likeRows(term: string): StoredRow[] {
    const db = this.requireDb();
    return db
      .prepare(
        `
        SELECT docs.*, 10.0 AS score
        FROM docs
        WHERE docs.title LIKE ? ESCAPE '\\' OR docs.text LIKE ? ESCAPE '\\'
      `,
      )
      .all(`%${escapeLike(term)}%`, `%${escapeLike(term)}%`) as StoredRow[];
  }

  private requireDb(): Database.Database {
    if (!this.db) {
      throw new Error('全文索引尚未打开');
    }
    return this.db;
  }
}
