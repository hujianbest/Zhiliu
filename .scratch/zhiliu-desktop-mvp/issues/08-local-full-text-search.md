# 08: 本地全文检索

**What to build:** 用户用一个检索入口在书籍、网页文章、笔记与草稿之间查找已知的词句，中英文都能命中，结果可以跳到出处。检索完全在本地完成，断网可用。

**Blocked by:** 07

**Status:** ready-for-agent

- [x] 一个检索入口跨书籍、网页文章、笔记与草稿检索
- [x] 中文与英文关键词都能命中
- [x] 结果显示来源类型并可跳转到精确出处
- [x] 导入与编辑后新内容出现在检索结果中
- [x] 检索在断网时可用
- [x] 结果中标注仍在索引的来源，避免把部分结果误认为完整结果

## Comments

- 2026-08-30 票 08 已实现。检索是全局对话框而不是第四空间：可见「检索」（`title="检索（Ctrl+K）"`）与 Ctrl/Cmd+K；首次运行选库屏不打开。主进程 MiniSearch 内存索引笔记（引文+想法）与 `extractReading` 去标签后的 EPUB 章节，在 `notes.save` / 导入后整表重建。`window.zhiliu.search.query` 返回 `{ kind, title, snippet, sourceId, noteId?, sourcePosition?, spineIndex?, partialIndex }`，`kind` 为 `epub` | `note` | `article` | `draft`。笔记命中标「笔记」且不标部分索引；EPUB 目录仍为 `pending`，书籍命中标「书籍」+「部分索引」。点击笔记走 `library.open`/`jump` 并 `<mark>` 引文；点击书籍跳到章节。E2E：`e2e/search.spec.ts`。见 `docs/adr/0008-search-dialog-and-main-process-index.md`。全文+embedding 运行时 ADR 留给票 09。
