# 01: 项目骨架与桌面框架 ADR

**What to build:** 用户可以在 Windows 与 macOS 上启动知流应用窗口，看到「书库/阅读」「思想」「创作」三个主空间的导航以及全局 Agent 侧栏的位置，界面呈现安静的现代书房观感而非聊天优先的界面。同时确立本仓库唯一的端到端测试缝：测试驱动可见的用户流程，运行在隔离的临时知识库与确定性的假 OpenAI 兼容服务之上。这条缝是后续所有票的先例。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 记录桌面框架选型 ADR，说明该选择如何满足本地文件访问、系统凭据库、EPUB/PDF 的 web 式渲染、后台原生处理、测试自动化与两平台未签名打包
- [x] 应用可在 Windows 与 macOS 上启动，展示三个主空间与全局 Agent 侧栏，空间之间可用鼠标与键盘切换
- [x] 端到端测试可以启动应用、指向一个隔离的临时知识库、断言可见界面，并在结束时清理
- [x] 端到端测试可以把全部模型调用指向确定性的假 OpenAI 兼容服务、不需要任何真实凭据
- [x] 仓库根目录包含 MIT 许可证文件
- [x] 一条命令即可在本地运行完整端到端测试套件

## Comments

- 2026-08-29 票 01 已实现。框架选型见 `docs/adr/0001-electron-as-the-desktop-framework.md`。端到端缝为 `e2e/helpers/launch.ts` 的 `launchZhiliu()`：Playwright 启动 Electron，注入隔离知识库目录与假 OpenAI 服务，结束后清理。本环境（Linux）上 `npm test` 5 项通过。Windows / macOS 启动未在本环境验证；Ctrl/Cmd+1/2/3 切换空间。安静书房观感需人看一眼。
