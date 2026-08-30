# ONNX Runtime is the only native dependency besides SQLite

Native modules are where this project's real risk lives. They need per-platform binaries, and their failures land in packaging rather than in logic: bundlers have no loader for `.node` files, automatic detection of which files to leave unpacked from the archive is unreliable, and loading a native library from inside a packed archive extracts it to a temporary directory where antivirus software notices. These are precisely the failures a human would catch by reading a build config, and no human reads this one. We therefore hold the count at one extra dependency — ONNX Runtime, for embedding inference — on top of SQLite itself.

## Consequences

- Chinese tokenization uses SQLite's built-in trigram tokenizer plus an application-level fallback to `LIKE` for the two-character terms that trigram cannot match, rather than a compiled tokenizer extension. Measured in the same unit as ADR-0006 — about two hundred thousand chunks, dominated by source documents rather than by the ten thousand notes — such a scan is a low-hundreds-of-milliseconds operation on the target machine, which is acceptable for the residual minority of queries that reach the fallback. It is bounded by the same trigger as brute-force vector search: at five hundred thousand chunks the fallback needs re-measuring, and a real tokenizer may then be worth a second native dependency.
- Vector similarity is computed in application code over a typed array rather than through a SQLite vector extension.
- A future contributor wanting better Chinese segmentation or a real vector index must justify a second native dependency, not merely show that it is faster.
