# CPU-heavy work runs in utilityProcess, never worker_threads

Electron's pointer-compression cage makes every `worker_threads` isolate share a single roughly 4 GB heap with the rest of the process. One worker exhausting memory aborts the whole application — the failure we would hit running inference and indexing together. ADR-0005 already chose `utilityProcess` for that reason. This note records the skeleton that ticket 01 established: a dedicated utility process is forked at startup, CPU-heavy work is queued to it, and `worker_threads` is not used for those jobs.

## Consequences

- The host lives in `src/main/utility-host.ts` and the child entry is `src/main/utility-worker.ts`. Later tickets (FTS5 maintenance, ONNX embedding) add messages to this process rather than opening a second worker kind.
- End-to-end tests may ping the child through main-process state to prove it is alive after packaging. They do not assert the child's private message table.
- Introducing `worker_threads` for compute requires a new ADR that explains why the shared heap is acceptable.
