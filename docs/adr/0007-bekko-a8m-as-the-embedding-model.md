# bekko-embedding-v1-a8m is the embedding model

Changing the embedding model means reindexing the entire Vault, so this choice is expensive to revisit. Under ADR-0006 the vector index exists to serve cross-language and conceptual recall rather than to carry primary ranking, and this model is strongest among the candidates on cross-language retrieval while running at 364 documents per second on CPU, roughly 2.9 times the throughput of the higher-scoring alternative. First-run indexing time is user-visible and bears directly on the thirty-minute activation target, so throughput outweighs the aggregate-score gap. It is MIT licensed, 130 MB (124 MiB), 384 dimensions, and supports truncation to 256, 128, or 64.

## Considered Options

- **granite-embedding-97m-multilingual-r2** scores higher on aggregate multilingual retrieval — 60.3 against bekko's 56.2 on the same aggregate, which pools same-language retrieval tasks and is not a cross-language measure — and is smaller at 98 MB, but runs at roughly a third of the throughput. It is the fallback for insufficient *conceptual* recall, not for insufficient cross-language recall, where it is the weaker of the two. The switch is triggered by the retrieval fixtures of ticket 12 failing on same-language no-keyword-overlap queries while passing the cross-language ones; the cost of pulling it is a full reindex of the Vault, so the fixtures must fail repeatedly before it is worth paying.
- **Qwen3-Embedding-0.6B** is the only candidate with a published C-MTEB score, 66.33, and is clearly strongest on Chinese, but that number is on a different benchmark from the 60.3/56.2 pair above and is not comparable to them. It is excluded anyway: 560 MB and 1024 dimensions are too heavy for 8 GB without a GPU.
- **EmbeddingGemma** was excluded on licensing rather than on merit: distributing it requires carrying Gemma's use restrictions into our own terms and passing them downstream, which would make our MIT licence untrue.

## Consequences

- The model ships inside the installer, which is why ADR-0005 puts 130 MB of its size budget here. First run is fully offline.
- If the fallback is ever taken, cross-language recall gets worse while conceptual recall gets better. Anyone taking it must confirm the cross-language fixtures still pass, or the trade has gone backwards against the product's explicit promise.
