# 01: 项目骨架与端到端测试缝

**What to build:** 用户可以在 Windows 与 macOS 上启动知流应用窗口，看到「书库/阅读」「思想」「创作」三个主空间的导航以及全局 Agent 侧栏的位置，界面呈现安静的现代书房观感而非聊天优先的界面。同时确立本仓库唯一的端到端测试缝：Playwright 启动打包后的应用、驱动可见的用户流程，运行在隔离的临时知识库与确定性的假 OpenAI 兼容服务之上。这条缝是后续所有票的先例，也是这个项目唯一的质量闸门——它坏了，后面所有票的验收都失效，因此本票的起始失败测试必须打在这条缝上，而不是打在导航元素是否存在上。框架已由 ADR-0005 定为 Electron，本票执行该决定，不重做选型。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Starting failing test:** 在一个隔离的临时目录中启动打包后的应用，向假 OpenAI 兼容服务发起一次调用，断言该服务确实记录到这次调用、且请求中不含任何真实凭据；断言应用退出后临时目录被清理。同时附带断言三个主空间导航与全局 Agent 侧栏都存在。

**Demo acceptance:** 需要。安静书房的观感与低干扰程度无法由断言表达。

- [x] 应用基于 Electron，可在 Windows 与 macOS 上启动，展示三个主空间与全局 Agent 侧栏，鼠标与键盘都能切换
- [x] 端到端测试用 Playwright 启动打包后的二进制，既能驱动界面也能检查主进程状态
- [x] 打包配置保持 `EnableNodeCliInspectArguments` fuse 启用，否则测试启动会静默超时
- [x] 建立 `utilityProcess` 形式的后台工作进程骨架，并确立 CPU 密集任务一律不进 `worker_threads` 的约束（ADR-0005）
- [x] 端到端测试可指向隔离的临时知识库，并在结束时清理
- [x] 端到端测试可把全部模型调用指向确定性的假 OpenAI 兼容服务，不需要任何真实凭据；测试能检查该假服务收到了什么
- [x] 仓库中记录端到端断言的范围规则并明确它是后续所有票的先例：断言用户可见行为与磁盘上的持久产物，不断言私有组件结构、内部方法调用、具体数据库查询、提示词空白与偶然的文件顺序
- [x] 仓库根目录包含 MIT 许可证文件
- [x] 一条命令即可在本地运行完整端到端测试套件
- [x] 文档记录最低支持系统，取值来自所用 Electron 大版本的 Chromium 下界而非写死某个版本号（ADR-0005）

## Comments

- 2026-08-29 票 01 已按当时规格实现外壳与测试缝。框架见评审后的 `docs/adr/0005-electron-as-the-desktop-framework.md`。当前 `npm test` 用 Playwright 启动**未打包**的 Electron（`e2e/helpers/launch.ts` 的 `launchZhiliu()`），尚未改成启动打包二进制，也尚未落 `utilityProcess` 骨架与 fuse 文档。Windows / macOS 启动未在本环境验证。
- 2026-08-30 打包缝已补齐：`npm test` 先 `pack:dir` 再让 Playwright 启动 `release/<platform>-unpacked` 二进制；`electron-builder.yml` 打开 `enableNodeCliInspectArguments`；`utilityProcess` 骨架见 `src/main/utility-host.ts` 与 ADR-0022；断言范围见 `docs/e2e-assertions.md`；最低系统见 `docs/supported-platforms.md` 与 `scripts/platform-floors.mjs`。Windows / macOS 真机启动仍未在本环境验证。
