# 规模性能预算

Ticket 19 freezes these ceilings. Recorded baselines may not raise them.

## 10,000 Atomic Notes

- Cold start to interactive: ≤ 6 s
- Single note save until keyword retrieval hit: ≤ 1 s
- Keyword search P95: ≤ 1 s
- Idle RSS after the vault is interactive: ≤ 800 MB

## ~200,000 source-document chunks (ADR-0006)

These are a separate corpus from the 10,000 notes. Vectors stay off this path in the benchmark because BM25 is the primary ranker.

- Seed / rebuild of 200,000 keyword chunks: ≤ 45 s
- Keyword search P95 at that size: ≤ 2 s
- RSS with both corpora resident: ≤ 1,500 MB
