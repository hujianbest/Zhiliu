# E2E uses a fake embedding adapter

**Production embedding and hybrid ranking are ADR-0007 (bekko-a8m) and ADR-0006 (BM25 primary).** Ticket 12 still owns that rewrite. This note records the fake adapter that lets the main suite prove cross-language recall without downloading ONNX weights.

# Local full-text plus multilingual embeddings, CPU by default

Ordinary retrieval must work offline, on an 8 GB machine without a discrete GPU, and without calling a cloud language model. Keyword search already lives in the main process as in-memory MiniSearch (ADR-0008). Semantic recall is a second index over the same documents: a vector map keyed by note id or EPUB chapter id, updated incrementally when a note is saved or a source is imported.

Production embeddings use **multilingual-e5-small** (384 dimensions, ~120 MB) through ONNX Runtime on the CPU execution provider. That model is small enough to keep resident beside a 10,000-note corpus on 8 GB RAM. GPU (CUDA, DirectML, CoreML) is an optional acceleration; it is never required. The main process lazy-imports `onnxruntime-node` so a missing native module degrades to a CPU hashing stub rather than crashing the app. Keyword MiniSearch stays available in every case.

The main end-to-end suite never downloads ONNX weights or Hugging Face models. When `ZHILIU_E2E=1`, a `FakeEmbeddingAdapter` stands in: it records every `embed(id, text)` call, hashes character n-grams so same-language overlap still ranks, and pins the hearth/lamplight ↔ 炉火/灯火 fixture pair onto nearby vectors so a Chinese query can recall the English note. A thin contract test (`ZHILIU_PLATFORM_EMBEDDINGS=1`) is the only place `OnnxEmbeddingStore` is exercised.

Vectors live in memory for this milestone. If they are later spilled to disk, they belong only under `.zhiliu/cache/`. MiniSearch may still rebuild after a save; the vector store must not re-embed unchanged ids.

## Considered Options

- **Cloud embeddings on each query.** Would make offline search and the 8 GB no-GPU rule impossible, and would send vault text to a network by default.
- **A large English-only local model.** Would fail the Chinese/English mixed-library story.
- **Rebuilding the whole vector store on every save.** Cheap at a handful of notes, but the acceptance bar is incremental upsert of the changed note or source only.

## Consequences

- `window.zhiliu.search.query(q, { mode })` accepts `keyword`, `semantic`, or `mix`. The default (and the 检索 dialog with 「语义」 checked) is mix, so existing keyword hits remain. Unchecking 「语义」 runs MiniSearch only.
- GPU absence is not a feature flag in e2e: the fake/CPU adapter is the default path whenever `ZHILIU_E2E=1`.
- EPUB catalog rows remain `pending` until a later ticket marks them ready, so book hits still show 部分索引. Embedded notes never do.
