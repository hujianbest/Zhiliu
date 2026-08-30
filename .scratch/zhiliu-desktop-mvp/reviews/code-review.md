# 实现代码评审 (第 2 轮)

- 日期: 2026-08-30
- 评审方式: subagent
- 固定点: `main` (`9548ab0`) … `HEAD` (`ff57dc3`)
- 结论: 需修改

作者不得自我确认通过。本轮由独立 subagent 双轴评审；第 1 轮严重项已复核落地，仍存在一般发现项。

## Standards

- 测试（评审者执行 workbench/loop/accessibility/conflict/provenance）: 20 passed, 0 failed

- [一般] `src/main/index.ts`: pin/hide、chat、promoteTrial、风格保存/回滚/确认、inboxAct 写入知识库但不 `git.commit`。ADR-0025 要求时间线摘要对应操作；ADR-0012 要求风格档案可从历史恢复。→ 每次写入后提交。

- [一般] `src/main/index.ts`: `agent:revise` 仍提交「分析知识库」；修复/冲突仍用「更新一条笔记」。→ 摘要应命名实际操作。

- [建议] `src/main/workbench.ts`: 预算、主题、对话、稿件、风格仍挤在一个类（发散式变化）；`captureCrash` 死代码。→ 按工件拆模块，删桩。

- [建议] `src/renderer/styles.css` `dialog::backdrop` 使用 `rgb(...)` 而非令牌。→ 改用 `--color-ink` 的 color-mix。

## Spec

- 测试（评审者执行 workbench/loop/accessibility/conflict/provenance）: 20 passed, 0 failed
- 票 14 / 票 06 人验 / 票 41 人工验收按约定不记为缺陷
- 第 1 轮严重项（提案 UI、并列修订三操作、对话/正式稿走模型、风格可见影响、acceptRevision 不改 thought）已复核

- [一般] 票 39 / 42：渲染层从不调用 `learnStyle`，定稿也不产风格提案，「确认样本」对真实用户不可达。→ 选样本/定稿时调用 `learnStyle`。

- [一般] 票 33 / 36：`withReady` 只看论点确认+纳入的思想数；`generateFormal` 只要 `confirmed` 证据。确认论点后即可点生成，正文会丢掉未确认思想。→ 就绪与生成过滤对齐。

- [一般] 票 27：`revise()` 不调模型，正文为模板拼接。→ 经模型网关生成修订。

- [一般] 票 36 / 18：`completeTask` 留痕写死 `sourceIds: []`。→ 写入提案/检索到的来源标识。

- [一般] 票 37：键盘上限断言比较常量自身，未计实际键次。→ 按真实按键计数。

- [一般] 票 21：`rollUsageWindow` 跨日把 `paused` 置 `false` 且不 `recomputePause`，月额度已满时后台仍放行。→ 滚动后重算暂停。

- [建议] `createManuscript({ kind: 'formal', trialId })` 仍可绕过提案确认。→ 转正只走预填提案再 `generateFormal`。
