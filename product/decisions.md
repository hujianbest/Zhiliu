# 决策记录

- D-1 2026-08-29 按 `.scratch/zhiliu-desktop-mvp/issues/` 的任务票顺序实现，同一时间只做一张前沿票 — 依据: 用户要求开始按 tickets 开发，且 hf-implement 规定一次一张。
- D-2 2026-08-29 知识库结构、Frontmatter 与稳定标识按 `docs/adr/0014-vault-layout-and-stable-identifiers.md`；来源原件进知识库按评审后的 ADR-0001 — 依据: 票 02 / 04。
- D-3 2026-08-30 API Key 只进操作系统凭据库；主套件用假适配器 — 依据: 票 03 与 `docs/adr/0015-os-credential-store-for-api-keys.md`。
- D-4 2026-08-30 书库目录在 `.zhiliu/library.json`；EPUB 二进制以稳定 id 放入 `sources/` 且被知识库 `.gitignore` 排除 — 依据: 票 04 与 `docs/adr/0016-source-catalog-and-ignored-binaries.md`。
- D-5 2026-08-30 主进程按 OPF spine 抽出章节、净化后交给无 `allow-scripts` 的 iframe 阅读 — 依据: 票 05 与 `docs/adr/0017-epub-sanitized-iframe-reading.md`。框架选型是评审后的 ADR-0005。
- D-6 2026-08-30 每本书的阅读位置与已读标记存在知识库 `.zhiliu/reading.json`；阅读器是否打开记在 userData `openSourceId` — 依据: 现票 07 与 `docs/adr/0018-reading-progress-vault-vs-userdata.md`。
- D-7 2026-08-30 EPUB 划选位置记为 `epub:<spineIndex>:<startOffset>:<endOffset>` — 依据: 现票 08 与 `docs/adr/0019-epub-source-position-string.md`。
- D-8 2026-08-30 全局检索是对话框（Ctrl+K）。**当前**关键词引擎是 MiniSearch（`docs/adr/0020-interim-minisearch-keyword-index.md`）；评审后的产品决定是 ADR-0006 BM25 + ADR-0008 FTS5，由现票 09 改写。
- D-9 2026-08-30 主套件用假 Embedding 适配器证明跨语言召回（`docs/adr/0021-e2e-fake-embedding-adapter.md`）；生产模型是 ADR-0007 bekko-a8m，由现票 12 落地。
