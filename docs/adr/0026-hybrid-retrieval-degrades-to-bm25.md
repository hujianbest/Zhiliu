# Embedding inference runs in utilityProcess; search degrades to BM25 when it cannot

Ticket 12 completes the hybrid retrieval contract in ADR-0006 and ADR-0007: BM25 (SQLite FTS5) is the primary ranking, and vectors only add cross-language and conceptual recall. The vectors themselves are produced in the existing `utilityProcess` child (ADR-0022), never on `worker_threads`.

The shipped model is bekko-embedding-v1-a8m as an ONNX file under `models/`. This environment does not bundle the 130 MB weights; when the file is missing, ONNX fails to load, or the child process exits, retrieval keeps serving BM25 hits and the search dialog states the degradation. E2E still uses `FakeEmbeddingAdapter` under `ZHILIU_E2E=1` except when `ZHILIU_EMBEDDING_FAIL=missing|onnx|crash` forces the production failure paths.

Import returns as soon as the source catalog is written. Keyword rebuild and embedding continue in the background so reading and capture are not blocked by a full vector pass.

## Consequences

- `search.queryDetailed` carries `degraded: null | 'missing-model' | 'onnx' | 'worker'`.
- Mix mode concatenates BM25 hits first, then vector-only hits (ADR-0006).
- Vector similarity remains brute-force cosine in the main process over an in-memory map (ADR-0008).
