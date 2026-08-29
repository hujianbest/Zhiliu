# 假设台账

- A-1 2026-08-29 [生效] 桌面框架选用 Electron — 默认理由: 票 01 要求在 ADR 中记录选型；Electron 是唯一同时覆盖本地文件、系统凭据库、EPUB/PDF 的 web 式渲染、后台原生处理、Playwright 驱动打包应用、以及两平台未签名打包的选项。
- A-2 2026-08-29 [生效] 票 01 的渲染层用原生 HTML/CSS/TypeScript，不引入前端框架 — 默认理由: 本票只交付外壳与导航，框架选择留给真正需要复杂编辑器的创作票。
- A-3 2026-08-29 [生效] 端到端测试缝是 Playwright 启动 Electron 应用，经 `launchZhiliu()` 注入隔离知识库目录与假 OpenAI 服务 — 默认理由: spec Testing Decisions 已指定这条唯一测试缝。
