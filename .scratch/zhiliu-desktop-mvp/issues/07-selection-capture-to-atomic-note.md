# 07: 选中捕获为原子笔记

**What to build:** 阅读中选中一段文字后按快捷键，弹出轻量输入框写下当下的想法，回车即保存为一条原子笔记，整个过程不打断阅读。每条笔记完整记录引文、我的想法、书目身份、章节或页码与精确位置，之后可以从笔记跳回原文位置核对上下文。阅读时可以随时查看当前来源下的全部笔记。

**Blocked by:** 05

**Status:** ready-for-agent

- [x] 选中文本、按快捷键、输入想法、回车保存的完整路径不离开阅读界面
- [x] 保存的笔记包含引文、用户想法、来源身份、章节或页码、精确位置
- [x] 从笔记可以跳回来源的精确位置并看到上下文
- [x] 阅读界面可以列出当前来源的全部笔记
- [x] 捕获动作同时提供可见控件，不只有隐藏快捷键
- [x] 支持只有引文没有想法的捕获，但它不满足后续的写作就绪规则
- [x] 重启应用后笔记与其来源位置仍然可用

## Comments

- 2026-08-30 票 07 已实现。可见「记下这段」（`title="记下这段（Ctrl+M）"`）与 Ctrl/Cmd+M；无选区时 `role=status` 提示「请先选中要记下的文字。」，不写入垃圾笔记。捕获对话框叠在阅读器上：回车保存、Shift+Enter 换行、Escape 取消。`source_position` 为 `epub:<spineIndex>:<startOffset>:<endOffset>`；`notes.listForSource` 按 Frontmatter `source_id` 扫描。跳回用已有 `library.jump` 再在 iframe 显示副本上 `<mark>` 引文，不改 EPUB。空想法仍走现有 `kind: excerpt`。E2E：`e2e/capture.spec.ts`。见 `docs/adr/0007-epub-source-position-string.md`。
