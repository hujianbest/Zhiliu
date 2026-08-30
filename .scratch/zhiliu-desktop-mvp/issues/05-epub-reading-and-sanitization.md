# 05: EPUB 阅读渲染与内容净化

**What to build:** 用户从书库打开 EPUB 后可以连续阅读正文并选中文字，阅读界面低干扰、以排版为主。导入内容中的脚本与不安全的活动内容在渲染前被禁用，不受信任的电子书无法执行任意行为。整个阅读过程不需要网络。

**Blocked by:** 04

**Status:** ready-for-agent

- [x] 从书库打开 EPUB 可以渲染正文并连续翻阅
- [x] 正文文本可以选中
- [x] EPUB 内的脚本与不安全活动内容在渲染前被禁用或净化，测试以含脚本的素材断言其不执行
- [x] 断网状态下 EPUB 阅读完全可用
- [x] 阅读界面可以完全用键盘翻阅，同时保留可见控件

## Comments

- 2026-08-30 票 05 已实现。阅读发生在「书库/阅读」内：书库条目标题是可打开的按钮，打开后见「返回书库」「上一章」「下一章」（`title` 标明 ← / →）。主进程按 OPF spine 抽出章节（跳过 `properties="nav"`），用 `sanitize-html` 去掉 script/iframe/object/embed/form、on* 与 `javascript:`/`http(s)` URL，包内位图内联为 data URL；不把可执行 HTML 写入知识库。渲染层用 `sandbox="allow-same-origin"`（无 `allow-scripts`）的 iframe 展示。E2E：`e2e/reading.spec.ts`，素材 `fireside-notes.epub`、`two-chapters.epub`、`scripted.epub`。见 `docs/adr/0005-epub-sanitized-iframe-reading.md`。
