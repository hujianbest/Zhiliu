# 05: EPUB 阅读渲染与内容净化

**What to build:** 用户从书库打开 EPUB 后可以连续阅读正文并选中文字，阅读界面低干扰、以排版为主。导入内容中的脚本与不安全的活动内容在渲染前被禁用，不受信任的电子书无法执行任意行为。整个阅读过程不需要网络。

**Blocked by:** 04

**Status:** ready-for-agent

**Starting failing test:** 打开已导入的 EPUB 素材并断言正文文本被渲染且可选中，同时断言含脚本的素材中的脚本没有执行。

**Demo acceptance:** 需要。排版质量与阅读舒适度只能人看。

- [x] 从书库打开 EPUB 可以渲染正文并连续翻阅
- [x] 正文文本可以选中
- [x] EPUB 内的脚本与不安全活动内容在渲染前被禁用或净化，测试以含脚本的素材断言其不执行
- [x] 断网状态下 EPUB 阅读完全可用
- [x] 阅读界面可以完全用键盘翻阅，同时保留可见控件

## Comments

- 2026-08-30 票 05 已实现。阅读在「书库/阅读」内。主进程按 OPF spine 抽出章节并 `sanitize-html`；iframe `sandbox="allow-same-origin"` 且无 `allow-scripts`。E2E：`e2e/reading.spec.ts`。见 `docs/adr/0017-epub-sanitized-iframe-reading.md`。
