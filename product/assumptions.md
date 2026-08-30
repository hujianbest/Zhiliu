# 假设台账

- A-1 2026-08-29 [生效] 桌面框架选用 Electron — 默认理由: 票 01 要求在 ADR 中记录选型；Electron 是唯一同时覆盖本地文件、系统凭据库、EPUB/PDF 的 web 式渲染、后台原生处理、Playwright 驱动打包应用、以及两平台未签名打包的选项。
- A-2 2026-08-29 [生效] 票 01 的渲染层用原生 HTML/CSS/TypeScript，不引入前端框架 — 默认理由: 本票只交付外壳与导航，框架选择留给真正需要复杂编辑器的创作票。
- A-3 2026-08-29 [生效] 端到端测试缝是 Playwright 启动 Electron 应用，经 `launchZhiliu()` 注入隔离知识库目录与假 OpenAI 服务 — 默认理由: spec Testing Decisions 已指定这条唯一测试缝。
- A-4 2026-08-30 [生效] 生产环境用 keytar 写入 OS 凭据库；E2E 主套件用假适配器 — 默认理由: 票 03 与 ADR-0015。
- A-5 2026-08-30 [生效] AUTO：阅读发生在「书库/阅读」空间内，不新增第四空间 — 默认理由: spec 三主空间已定；打开来源是书库的阅读态。
- A-6 2026-08-30 [生效] AUTO：票 05 测试缝仍是 `launchZhiliu()`；书库条目打开阅读；含脚本 EPUB 断言脚本与事件处理不执行；翻页用可见「上一章/下一章」加方向键 — 默认理由: spec 唯一端到端缝；票 06 才做目录与位置恢复。
- A-7 2026-08-30 [生效] AUTO：EPUB 在主进程抽出 spine、净化并内联包内资源为 data URL，远程 URL 剥离；渲染层用无 `allow-scripts` 的沙箱展示 — 默认理由: 票 05 要求渲染前禁用不安全活动内容且阅读不需要网络。
- A-8 2026-08-30 [生效] AUTO：每本书的阅读位置与已读标记存在知识库 `.zhiliu/reading.json`（随目录复制走）；「阅读器是否打开」记在 userData，以便重启回到原处、但拷贝知识库不会在另一台电脑强行打开书 — 默认理由: 现票 07；窗口态不进知识库。
- A-9 2026-08-30 [生效] AUTO：打开或翻页把未读变为在读；**到达末章**（下一章或目录跳转，且上一位置不是末章）自动已读；用户也可显式「标记已读 / 撤销已读」。撤销后即使仍停在末章也保持在读，直到再次到达末章。目录来自 EPUB nav，可见「目录」按钮与快捷键 T。Agent 分析通道即使被调用也不得改阅读状态 — 默认理由: 票 07 与 US 25。
- A-10 2026-08-30 [生效] AUTO：阅读划选用可见「记下这段」与 Ctrl+M；回车保存想法、Shift+Enter 换行；sourcePosition 为 `epub:<spineIndex>:<startOffset>:<endOffset>` 字符串，足够跳回章节并滚动到引文。捕获不离开阅读界面 — 默认理由: 票 07 与 spec 键盘优先捕获。
- A-11 2026-08-30 [生效] AUTO：全文检索是全局对话框（可见「检索」+ Ctrl+K），不新增第四空间。关键词引擎是知识库 `.zhiliu/cache/search.sqlite` 上的 SQLite FTS5：拉丁文走 unicode61，中日韩走 trigram，少于三字的中文走 `LIKE`。`indexStatus !== ready` 的来源在结果中标「部分索引」。 — 默认理由: 票 09、ADR-0006、ADR-0008、ADR-0023。
- A-12 2026-08-30 [生效] AUTO：语义检索主套件用假 Embedding 适配器（`ZHILIU_E2E=1`）。生产路径按评审后 ADR-0007（bekko-a8m）与 ADR-0006（BM25 主力），由现票 12 改写 — 默认理由: 旧票 09 实现时尚未有 bekko/BM25 决定。
- A-13 2026-08-30 [生效] AUTO：票 06 在 Linux 云环境产出 `electron-builder` 的 Linux `dir` 布局，作为 Playwright 启动打包二进制的测试缝；Windows NSIS 与 macOS 自签 DMG 的配置与拒绝 ad-hoc 的门禁已写入 `scripts/pack.mjs`，真实签名产物与 Gatekeeper/SmartScreen 弹窗必须在对应操作系统上由人核对。证书私钥不进仓库。 — 默认理由: 本环境不是 macOS/Windows 构建机，不能假装已经完成跨平台签名与人工弹窗核对。
- A-14 2026-08-30 [生效] AUTO：PDF 与 EPUB 共用导入按钮「导入 EPUB 或 PDF」；PDF 文本层由主进程 pdf.js 抽出为净化 HTML；无文本层只提示无法选中，不做 OCR。出处 `pdf:<page>:<start>:<end>:<x0>:<y0>:<x1>:<y1>`。 — 默认理由: 票 10、ADR-0009、ADR-0024。
- A-15 2026-08-30 [生效] AUTO：知识库是本地 Git 仓库；应用内时间线只展示中文操作摘要与「回滚到此处」，不提供分支/远端/rebase。提交作者固定为 `知流 <zhiliu@localhost>`。追踪 Markdown 与轻量元数据，忽略来源二进制、缓存、模型与预留 OCR 目录。回滚为 `git reset --hard` 后重建索引。 — 默认理由: 票 11、ADR-0025。
