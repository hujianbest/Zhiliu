# 决策记录

- D-1 2026-08-29 按 `.scratch/zhiliu-desktop-mvp/issues/` 的任务票顺序实现，同一时间只做一张前沿票 — 依据: 用户要求开始按 tickets 开发，且 hf-implement 规定一次一张。
- D-2 2026-08-29 知识库结构、Frontmatter 与稳定标识按 ADR-0002 — 依据: 票 02 要求在实现前记录该 ADR。
- D-3 2026-08-30 API Key 只进操作系统凭据库；主套件用假适配器 — 依据: 票 03 与 ADR-0003。
- D-4 2026-08-30 书库目录在 `.zhiliu/library.json`；EPUB 二进制以稳定 id 放入 `sources/` 且被知识库 `.gitignore` 排除 — 依据: 票 04 与 ADR-0004。
- D-5 2026-08-30 主进程按 OPF spine 抽出章节、净化后交给无 `allow-scripts` 的 iframe 阅读 — 依据: 票 05 与 ADR-0005。
- D-6 2026-08-30 每本书的阅读位置与已读标记存在知识库 `.zhiliu/reading.json`；阅读器是否打开记在 userData `openSourceId`；目录来自 EPUB nav — 依据: 票 06 与 ADR-0006。
- D-7 2026-08-30 EPUB 划选位置记为 `epub:<spineIndex>:<startOffset>:<endOffset>`；捕获不离开阅读界面 — 依据: 票 07 与 ADR-0007。
- D-8 2026-08-30 全局检索是对话框（Ctrl+K），不是第四空间；主进程内存全文索引笔记与 EPUB 章节，EPUB 来源保持 pending 故书籍命中标注部分索引 — 依据: 票 08 与 ADR-0008。
