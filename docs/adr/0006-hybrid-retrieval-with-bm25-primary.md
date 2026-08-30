# Retrieval is hybrid, with BM25 primary and vectors only for cross-language and conceptual recall

On long Chinese document retrieval, BM25 scores 0.703 while every sub-300M dense embedding model measured scores between 0.34 and 0.39 — a gap of nearly two to one in favour of the unfashionable option. But BM25 cannot do the one thing the product explicitly promises: answering a Chinese query with an English passage that shares no keywords. We therefore rank with BM25 as the primary signal and use vector similarity only for cross-language and conceptual recall, merging the two result sets.

## Corpus size

Every capacity claim below rests on one number, so it is derived here rather than asserted. The spec's scale target is about ten thousand Atomic Notes, each of which is one chunk. Retrieval must also cover Source Documents, and those dominate: a three-hundred-page book is roughly one hundred thousand words, which at five-hundred-character chunks is about eight hundred chunks, and a Vault of two hundred imported documents is therefore around one hundred sixty thousand chunks. Ten thousand notes plus one hundred sixty thousand source chunks is where the working figure of two hundred thousand chunks comes from. Notes are a rounding error in this corpus; source documents are the whole of it.

## Consequences

- Embedding model quality matters far less than it would in a vector-first design, which is what makes a small CPU-only model acceptable.
- Vector search is brute force over an in-memory quantized array. Two hundred thousand chunks at 384 dimensions is 77 MB after int8 quantization. Brute force is exact by construction, so recall needs no verification and only latency does: published measurements put a hundred thousand vectors at this width under 75 ms when read from disk per query, and under 4 ms when the quantized array is already resident in memory, which is the case we build for. Faiss, LanceDB, and HNSW solve a million-scale problem we do not have.
- The quantitative trigger to revisit that judgement is five hundred thousand chunks resident, or a measured P95 vector-search latency above 50 ms on the target machine, whichever comes first. Below both, an approximate index is added complexity with no user-visible gain; above either, brute force must be re-measured before more source documents are supported.
- Anyone tempted to promote vector similarity to the primary signal should re-measure Chinese retrieval first, because the intuition that dense beats lexical does not hold at this model size.
