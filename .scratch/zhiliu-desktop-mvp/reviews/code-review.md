# 实现代码评审 (第 1 轮)

- 日期: 2026-08-30
- 评审方式: subagent
- 固定点: `main` (`9548ab0`) … `HEAD` (`86907e9`)
- 结论: 需修改

作者不得自我确认通过。本轮由独立 subagent 双轴评审；存在严重/一般发现项。

## Standards

- 测试（评审者执行 workbench/loop/accessibility/conflict/provenance）: 14 passed, 1 failed（`latestTrace` 按 UUID 排序导致提示词版本断言抖动）

- [严重] `src/main/workbench.ts` `ensureTopicForTrial`: 在 `noteIds: []` 时把 `origin` 写成 `'thought-signal'`，且不走 `refreshOrigins`。ADR-0002 要求主题来源只由思想笔记计数推导。→ 创建后调用 `refreshOrigins`，禁止手设 origin。

- [严重] `src/main/agent.ts` `latestTrace`: 按 UUID 文件名 `sort()` 取“最新”，不用 `timestamp`。两次 `analyze` 后词典序可能仍指向第一次留痕。→ 按 `timestamp` 取最新一条。

- [一般] `src/main/index.ts`: 保存预算、隐私、提示词、触发器、重命名、定稿等都 `git.commit('更新一条笔记')`。→ 按实际操作写摘要。

- [一般] `src/renderer/main.ts`: 「生成正式稿」在 `!item.ready` 时 `disabled`，没有说明原因。→ 未就绪时给出可读原因。

- [建议] 创作区与 Agent 侧栏各有一个「组织主题」。→ 区分可访问名称，或只留一处。

- [建议] `src/main/workbench.ts` 同时承担预算、主题、对话、稿件、风格（Divergent Change）；`promptVersion` / `captureCrash` 无调用。→ 按工件拆模块，删死代码。

## Spec

- 测试（评审者执行 workbench/loop/accessibility）: 18 passed
- 票 14 / 票 06 人验 / 票 41 人工验收按约定不记为缺陷

- [严重] 票 33：渲染层没有论点编辑/确认、没有纳入/排除证据。→ 补齐提案审阅控件。

- [严重] 票 27：思想空间只有「生成修订」，无接受、拒绝、编辑。→ 列出并列修订并提供三操作。

- [严重] 票 23：`Workbench.chat` 不调用模型，断网仍成功。→ 对话走模型网关；失败时可恢复报错。

- [严重] 票 36：`generateFormal` 不调模型、不写留痕。→ 正式生成经 Agent，写入完整非机密留痕。

- [严重] 票 39 / 42：无风格样本确认 UI；生成不用风格档案；`learnStyle` 只切片定稿。→ 选样本、展示差异、确认后写入，生成可见地使用档案。

- [一般] 票 31 / 23 / 22：稿件 span 与对话段落不可点跳。→ 每条证据跳到精确出处。

- [一般] 票 37：键盘测试未走完导入–导出全路径。→ 按票测完整键盘路径。

- [一般] 票 41：闭环测试用 `evaluate` 绕过阅读捕获。→ 单次运行走完十步 UI。

- [一般] 票 30：`promoteChat` 把模型段写入 quotation（来源）。→ 模型段标 AI。

- [一般] 票 24：预览是 `textContent` 镜像。→ 实时渲染 Markdown。

- [一般] 票 34：不能编辑单条引用。→ 提供引用编辑。

- [建议] `createManuscript({ kind: 'formal', trialId })` 可绕过提案确认。→ 从试写出发只允许预填提案路径。

- [严重] 票 27：`acceptRevision` 把 AI 文本写入 `thought`（用户归属）。→ 已采纳修订保持 AI 归属。

- [一般] 票 21：跨日清零会冲掉月累计。→ 日/月窗口分开滚动。

- [一般] 票 38：`generateFormal` 不写 `trialId`。→ 转正路径写入派生关系。

- [一般] 票 40：模型不可用只改 `triggers.status`，不暂停后台。→ 模型不可用时暂停后台。
