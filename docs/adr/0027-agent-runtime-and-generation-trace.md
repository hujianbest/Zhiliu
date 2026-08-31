# Agent 运行时：手动触发、本地召回、云端推理、生成留痕

Ticket 18 needs a single place that records how an Agent run is started, what leaves the machine, and what is kept so a user can audit it. The user can always press 「开始分析」; that path is interactive and never waits for a schedule. Local hybrid retrieval (ADR-0006) picks at most eight Atomic Notes for the visible task. Only those quotations and thoughts are sent to the configured OpenAI-compatible `/chat/completions` endpoint. The rest of the Vault stays on disk.

Failures surface as a readable status in the Agent sidebar. This ticket does not retry on its own; a later budget ticket (21) decides when background work pauses. Each successful run writes `.zhiliu/traces/{id}.json` with task type, model identity, prompt version (`builtin-v1` until ticket 25), source identifiers, timestamp, usage, and result. The file must not contain the API Key. Usage is estimated locally when the vendor omits token counts.

## Consequences

- Interactive runs are distinguishable from later background runs by a `channel` field on the same trace object.
- Outbound bodies are a function of retrieval for that task, not a dump of the Vault.
