# 06: 目录导航与阅读位置恢复

**What to build:** 用户通过目录在长篇作品中高效移动，关闭应用后重新打开会回到上次阅读的位置。阅读状态只反映真实的本地阅读进度或用户的显式确认，模型对来源的摘要或分析永远不会代替用户把一本书标记为已读。

**Blocked by:** 05

**Status:** ready-for-agent

- [x] EPUB 目录可展示并跳转到对应章节
- [x] 关闭并重启应用后回到上次阅读位置
- [x] 阅读进度只由真实本地阅读行为或用户显式操作更新
- [x] 用户可以显式把一本书标记为已读或撤销该标记
- [x] 测试断言模型对来源的分析或摘要不改变其阅读状态
- [x] 目录跳转与位置操作都有可见控件与快捷键

## Comments

- 2026-08-30 票 06 已实现。目录来自 EPUB nav（`extractReading` 匹配 href 到非 nav spine）；可见「目录」按钮与快捷键 T（设置输入中不抢 T），Escape 关闭目录对话框。位置与已读标记在知识库 `.zhiliu/reading.json`；`preferences.json` 的 `openSourceId` 只表示本机阅读器是否打开。「返回书库」清掉后者、保留前者。打开/翻页/跳转只把未读变为阅读中；「标记已读 / 撤销已读」（Shift+R）才改已读。`library.recordAgentLook` 与模型 probe、cache 摘要文件都不写阅读状态。E2E：`e2e/toc-position.spec.ts`。见 `docs/adr/0006-reading-progress-vault-vs-userdata.md`。
