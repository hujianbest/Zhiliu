# 04: EPUB 导入与书库列表

**What to build:** 用户导入本机合法持有的无 DRM EPUB 文件，书籍在可渲染之后立即出现在书库列表中，索引在后台继续进行而不阻塞浏览。书库是用户查看与恢复全部来源的入口。

**Blocked by:** 02

**Status:** ready-for-agent

- [x] 用户可以选择一个或多个本地 EPUB 文件导入知识库
- [x] 导入的书籍立即出现在书库列表中，展示标题与可得的作者信息
- [x] 书库列表统一展示已导入的书籍与文章，并显示每个来源当前的索引状态
- [x] 书籍二进制原件与派生提取产物不进入 Git 历史
- [x] 导入损坏或不支持的 EPUB 时给出明确失败原因，不留下半成品条目
- [x] 端到端测试使用真实的小体积 EPUB 素材

## Comments

- 2026-08-30 票 04 已实现。书库列表来自 `.zhiliu/library.json`；EPUB 以稳定 id 存入 `sources/`。E2E 用 `e2e/fixtures/*.epub` 与 `ZHILIU_CHOOSE_FILES` 代替系统文件对话框。损坏文件提示「无法打开：不是有效的 EPUB」，不写目录也不写文件。索引状态目前为「待索引」（真正建索引是后续票）。见 `docs/adr/0004-source-catalog-and-ignored-binaries.md`。
