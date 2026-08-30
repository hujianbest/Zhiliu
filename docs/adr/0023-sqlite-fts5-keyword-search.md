# Keyword search is SQLite FTS5 with trigram and LIKE fallback

Ticket 09 replaces the interim MiniSearch engine recorded in ADR-0020. Full-text search now lives in a SQLite database under `.zhiliu/cache/search.sqlite`, which is gitignored with the rest of the cache. Two FTS5 virtual tables share the same document rows:

- Latin queries go to `tokenize='unicode61 remove_diacritics 2'`
- Queries that contain CJK characters go to the built-in `trigram` tokenizer
- CJK runs shorter than three characters cannot be matched by trigram, so they fall back to an application-level `LIKE` scan with `ESCAPE` — no compiled tokenizer extension (ADR-0008)

Hits from both routes are merged by document id. BM25 scores from FTS5 are the ranking signal for MATCH results; LIKE hits are ranked after them. The public seam remains `window.zhiliu.search.query`.

## Consequences

- `better-sqlite3` is the SQLite binding. It is a native module and must be unpacked from asar, but it is the SQLite allowed by ADR-0008 rather than a second extra native dependency.
- MiniSearch is no longer used. ADR-0020 remains as history of the interim engine.
- Mixed Latin+CJK queries run both indexes and union the hits.
