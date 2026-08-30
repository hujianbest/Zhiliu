# Zhiliu

A local-first desktop knowledge workbench where reading produces the user's own thoughts, thoughts accumulate into topics, and topics become articles the user can honestly claim as their own.

Canonical terms are English; user-facing copy is Chinese. Every term below carries its Chinese counterpart, and the two must stay locked together: when one changes, change both.

This file defines what each term *is*. It does not carry rules or rationale — those live in `spec.md` and `docs/adr/`, and are referenced here rather than restated. Each entry may carry two guard lines: `_Avoid_` lists words that must never name this concept, and `_Not_` names a nearby canonical term it is often confused with.

## Sources

**Vault** (知识库):
The single user-chosen local directory holding everything Zhiliu owns — knowledge artifacts, imported source files, and lightweight metadata. Copying it to another machine carries the user's whole world with it.
_Avoid_: workspace, repository, 仓库, 资料库
_Not_: Library (书库), which is the collection of Source Documents inside the Vault

**Source Document** (来源文档):
An imported EPUB, PDF, web article snapshot, or copied legacy Markdown file that reading, quotation, and citation refer to.
_Avoid_: book, file, resource, 书, 书籍, 资料, 文献

**Library** (书库):
The collection of every Source Document, and the surface where the user resumes or inspects them.
_Avoid_: bookshelf, collection, 藏书

**Source Position** (出处):
The exact place inside a Source Document that a citation returns to — chapter and offset for EPUB, page and coordinates for PDF.
_Avoid_: anchor, bookmark, 锚点, 位置
_Not_: citation (引用), which is the act or artifact of pointing at a Source Position

**Quotation** (引文):
Text copied verbatim out of a Source Document, always paired with its Source Position.
_Avoid_: highlight, snippet, 划线, 摘句

**Reading Status** (阅读状态):
Where the user stands in a Source Document: **Unread** (未读), **Reading** (在读), or **Read** (已读). What may and may not move it is fixed by `spec.md` Implementation Decisions.
_Avoid_: progress, completion, finished, 进度, 读完

## Capture

**Atomic Note** (原子笔记):
One independently addressable Markdown file with a stable identifier that survives renaming and reorganisation. Exists in exactly two kinds: Excerpt and Thought Note.
_Avoid_: card, entry, 卡片, 条目

**Excerpt** (摘录):
An Atomic Note holding a Quotation and its Source Position, with none of the user's own thinking attached.
_Avoid_: highlight, clipping, 划线

**Thought Note** (思想笔记):
An Atomic Note holding a Quotation, its Source Position, and the user's own thought about it (用户想法). This is the countable unit of the user's thinking: one Thought Note is one thought.
_Avoid_: annotation, comment, 感想
_Not_: 想法 alone, which names the user-thought field, not the whole note

**Conflict Copy** (冲突副本):
A second on-disk version of an Atomic Note, preserved when an external edit and an in-app edit both changed the same note, kept until the user decides the merge.
_Avoid_: duplicate, fork, 副本冲突, 分叉
_Not_: Parallel Revision (并列修订), which is an AI rewrite rather than an external-edit collision

## Provenance

**Provenance** (来源归属):
The three-valued label carried by every piece of text in the system, at every layer from note fields to editor spans to chat paragraphs: **User** (用户), **Source** (来源), or **AI** (AI). Its single-vocabulary rule and its use in chat are fixed by ADR-0004.
_Avoid_: authorship, attribution, 作者归属, 来源痕迹
_Not_: Topic Origin (主题来源), which classifies a Topic rather than a span of text

**Parallel Revision** (并列修订):
An AI rewrite stored alongside the user's original text rather than over it, awaiting the user's acceptance, rejection, or edit.
_Avoid_: patch, diff, 补丁, 改写
_Not_: Suggestion (建议), which is what waits in the Suggestion Inbox

## Retrieval

**Retrieval Corpus** (检索语料):
The set of artifacts that local search may return. Which artifacts qualify is fixed by ADR-0011.
_Avoid_: index, dataset, 索引库

**Index State** (索引状态):
Per-Source-Document indexing progress, and the derived whole-Vault condition of being partially indexed, which retrieval and the Agent both surface to the user.
_Avoid_: indexing status, coverage, 建索引进度

## Topics

**Topic** (主题):
A persisted, user-owned set of notes and source evidence representing an idea that recurs across Source Documents. The user may rename, merge, split, hide, and pin one.
_Avoid_: theme, tag, 话题, 标签

**Topic Origin** (主题来源):
A Topic's classification as Thought Signal or Library Discovery, derived from the evidence actually supporting it. Its derivation and its immutability by hand are fixed by ADR-0002.
_Avoid_: category, 分类

**Thought Signal** (思想线索):
A Topic supported by at least three of the user's own Thought Notes. Only these may receive an automatically generated Trial Manuscript.
_Avoid_: personal topic, user theme, 个人主题

**Library Discovery** (书库发现):
A Topic supported by fewer than three Thought Notes, including topics resting entirely on material the user has not read. Receives Proposals, never automatic manuscripts.
_Avoid_: corpus topic, discovered theme, 语料主题

**Suggestion Inbox** (建议收件箱):
The in-app surface where proactive findings wait to be reviewed, separated by Topic Origin.
_Avoid_: feed, alerts, 消息
_Not_: system notifications (系统通知), which Zhiliu never uses for this

## Creation

**Thesis** (论点):
The single claim a piece of writing argues. A Proposal carries exactly one, and it counts toward Writing Readiness only once the user has confirmed it.
_Avoid_: claim, argument, topic sentence, 主张, 观点

**Proposal** (提案):
A structured evidence set attached to a Topic — Thesis, supporting Thought Notes, source evidence, AI inference, and identified gaps — that the user inspects and confirms before any formal writing. It is evidence, not prose.
_Avoid_: outline, plan, brief, 大纲, 计划

**Writing Readiness** (写作就绪):
The condition that permits Formal generation: one Thesis the user has confirmed, plus at least three Thought Notes. This is the same three-Thought-Note threshold that makes a Topic a Thought Signal.
_Avoid_: qualification, 达标

**Manuscript** (稿件):
A Markdown article carrying a kind (**Trial** 试写 or **Formal** 正式) and a status (**Draft** 草稿 or **Final** 定稿). Three combinations exist: Trial+Draft, Formal+Draft, Formal+Final. Trial+Final does not exist, because ADR-0003 forbids a Trial Manuscript from being promoted in place.
_Avoid_: article, post, 文章
_Not_: Proposal (提案), which is evidence rather than prose

**Trial Manuscript** (AI 试写稿):
A Manuscript of kind Trial, written by the Agent on its own initiative from a Thought Signal and labelled speculative. Always status Draft; its relationship to formal writing is fixed by ADR-0003.
_Avoid_: auto draft, speculative article, 自动草稿

**Formal Manuscript** (正式稿):
A Manuscript of kind Formal, generated from a Proposal the user confirmed. Status Draft until the user finalises it, then Final.
_Avoid_: real article, 成稿
_Not_: 定稿, which is the status Final and applies to a Formal Manuscript rather than replacing its name

**Style Profile** (写作风格档案):
The user-owned, human-readable record of how the user writes, learned from their own text, editable and resettable by hand, and version-tracked. Updates to it require evidence and the user's confirmation, as fixed by ADR-0012.
_Avoid_: voice model, style vector, tone settings, 风格模型, 语气设置

## Agent

**Agent** (Agent):
The proactive component that analyses accumulated knowledge on its own schedule to surface Topics and writing opportunities, rather than waiting for a prompt.
_Avoid_: assistant, copilot, bot, 助手

**Model Role** (模型角色):
One of the two configurable slots the user points at an OpenAI-compatible endpoint: **Fast** (快速) for routine analysis and **Deep Writing** (深度写作) for generation. Both may point at the same model.
_Avoid_: profile, tier, preset, 配置

**Background Budget** (后台预算):
The token and request ceilings that bound work the user did not personally initiate.
_Avoid_: quota, 配额

**Generation Trace** (生成留痕):
The local, per-generation record of what the Agent asked a model and what came back, carrying no credentials. Its field set is fixed by ticket 18.
_Avoid_: log, audit entry, history, 日志, 生成记录

**Prompt Override** (提示词覆盖):
A user-supplied replacement for a built-in prompt, stored in the Vault and version-tracked like any other knowledge artifact.
_Avoid_: custom prompt, template, 自定义提示, 模板
