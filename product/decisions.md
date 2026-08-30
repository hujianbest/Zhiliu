# 决策记录

- D-1 2026-08-29 按 `.scratch/zhiliu-desktop-mvp/issues/` 的任务票顺序实现，同一时间只做一张前沿票 — 依据: 用户要求开始按 tickets 开发，且 hf-implement 规定一次一张。
- D-2 2026-08-29 知识库结构、Frontmatter 与稳定标识按 ADR-0002 — 依据: 票 02 要求在实现前记录该 ADR。
- D-3 2026-08-30 API Key 只进操作系统凭据库；主套件用假适配器 — 依据: 票 03 与 ADR-0003。
- D-4 2026-08-30 书库目录在 `.zhiliu/library.json`；EPUB 二进制以稳定 id 放入 `sources/` 且被知识库 `.gitignore` 排除 — 依据: 票 04 与 ADR-0004。
