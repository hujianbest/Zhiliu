# 09: 本地多语言语义检索与增量索引

**What to build:** 除了关键词，用户还能按概念找到相关内容：中文查询可以召回相关的英文材料，反之亦然。本地 Embedding 随导入与编辑增量更新而不重建全库，普通检索不需要任何云端模型调用。在 8GB 无独显的机器上功能完整，GPU 只是加速项。

**Blocked by:** 08

**Status:** ready-for-agent

- [x] 记录本地全文索引与多语言 Embedding 运行时选型的 ADR，说明 8GB 无独显机型上的可行性，以及 GPU 加速为可选而非必需
- [x] 中英文跨语言素材上，语义检索能召回不含相同关键词的相关内容
- [x] 导入与编辑后索引增量更新，不触发全库重建
- [x] 语义检索在断网时可用
- [x] GPU 不可用时功能完整，仅处理速度下降
- [x] 索引进行中的来源在检索与 Agent 结果中被标注为部分索引

## Comments

- 2026-08-30 票 09 已实现。ADR-0009：全文仍用主进程 MiniSearch；生产 Embedding 选 multilingual-e5-small + ONNX Runtime，默认 CPU，GPU 只加速。`ZHILIU_E2E=1` 时用 `FakeEmbeddingAdapter`（不下载模型），手标 hearth/lamplight 与 炉火/灯火 为近邻向量，并记录 `embed(id)` 供增量断言。`window.zhiliu.search.query(q, { mode: 'keyword'|'semantic'|'mix' })` 默认 mix；检索对话框「语义」勾选为 mix、取消为仅关键词。`notes.save` / 导入只 upsert 变更笔记或新 EPUB 章节，不重嵌已有 id。笔记命中不标部分索引；EPUB `pending` 的语义/关键词命中仍标「部分索引」。E2E：`e2e/semantic.spec.ts`；平台薄合约 `e2e/embeddings-platform.spec.ts`（`ZHILIU_PLATFORM_EMBEDDINGS=1`）。
