# 实现代码评审 (第 3 轮)

- 日期: 2026-08-30
- 评审方式: subagent
- 固定点: `main` (`9548ab0`) … `HEAD` (`b8ac221`)
- 结论: 通过
- auto-approved 2026-08-30

第 2 轮一般项已由独立 subagent 复核落地。仅余建议项，不阻塞。

## Standards

- 测试（评审者执行 workbench/loop/accessibility）: 18 passed, 0 failed
- 第 2 轮一般项已复核：pin/hide/chat/风格/inbox/promoteTrial 均提交；revise 摘要为「生成并列修订」；repair/conflict 不再用「更新一条笔记」

- [建议] `src/main/workbench.ts`: 预算/主题/对话/稿件/风格仍挤在一类；`captureCrash` 死桩。→ 按工件拆模块。
- [建议] `confirmStyleProposal` 证据缺失时先写入再抛错，Git 摘要可能并入下次无关提交。→ 撤回后先提交再抛。
- [建议] `inboxAct` 名称不说明采纳/忽略。→ 拆成 accept/ignore。
- [建议] `dialog::backdrop` 未走令牌。→ `color-mix` 基于 `--color-ink`。
- [建议] `searchKindCopy.epub = '书籍'` 与 CONTEXT 用词不完全一致。→ 「EPUB」。

## Spec

- 测试（评审者执行 workbench/loop/accessibility）: 18 passed, 0 failed
- 票 14 / 票 06 人验 / 票 41 人工验收按约定不记为缺陷
- 第 2 轮 6 条一般已复核：定稿触发 `learnStyle`；就绪与生成均要求三条已确认纳入的思想笔记；`revise()` 走模型；留痕含 `sourceIds`；键盘路径按实计键次；跨日滚动后 `recomputePause`

- [建议] 票 38：`createManuscript({ kind: 'formal', trialId })` 仍可绕过提案。→ 转正只走预填提案再 `generateFormal`。
- [建议] 票 37：`exportVisible` 上限未与实测键次比较；写作/导出仍有 `.click()`。→ 补按键计数。
