# 知流桌面知识工作台 MVP

Status: ready-for-agent

## Problem Statement

喜欢阅读并希望写作的人，往往把电子书、网页、摘录、瞬间想法和旧文章分散在多个工具中。阅读过程中产生的思想很容易丢失；即使留下了笔记，也常以孤立碎片存在，难以跨书重新发现、形成观点并转化为文章。现有“阅读器 + 笔记工具 + 通用 AI”组合要求用户反复搬运上下文，AI 生成内容又容易混淆用户原话、书中观点与模型推演，最终得到的文字未必真正表达用户。

第一批用户是懂得配置模型 API、主要阅读中英文 EPUB/PDF 和公开网页、希望用中文写作的技术型个人读者。他们需要的不只是更快获得摘要，而是一套由主动 Agent 长期观察知识积累、发现写作机会、生成可追溯试写稿并逐渐学习个人写作习惯的桌面工作台。

## Solution

知流是一款面向 Windows 与 macOS 的本地优先、开源桌面知识工作台。产品由“书库/阅读”“思想”“创作”三个主空间和全局 Agent 侧栏组成，把资料导入、阅读标注、原子笔记、语义索引、主题发现、知识库对话和文章创作连接成一个闭环。

用户可以导入 EPUB、PDF、Markdown 文件夹和公开网页，在阅读时通过快捷键保存“原文 + 用户感想 + 精确出处”。知识以带 Frontmatter 的原子 Markdown 文件为主存储，并由本地全文索引和多语言 Embedding 支撑最多约 10,000 条笔记的检索。主动 Agent 在用户允许的触发条件与 Token/请求预算内分析新增内容，把结果分为“你的思想线索”和“从书库发现”两个队列。只有具有用户思想依据的主题可以自动生成明确标记为“AI 试写”的草稿；正式文章仍须由用户确认核心主张和材料后生成。

用户原话、书中内容和 AI 推演在创作过程中以不同颜色和文字/图形标签呈现，不能只依赖颜色传达来源。导出时移除编辑标色，生成干净 Markdown、纯文本或富文本，并可保留轻量脚注与来源清单。Agent 可以从用户主动指定的旧文章，以及用户最终采纳的改稿中提炼可查看、可编辑、可重置、有版本历史的写作风格档案；每次风格档案更新都必须展示依据并获得用户确认。

书籍、笔记、索引和生成记录默认保存在本机。用户自备 OpenAI 兼容接口，可分别配置“快速/低成本”和“深度写作”两个模型角色；API Key 保存在操作系统凭据库。没有网络或模型不可用时，阅读、标注、检索和手工写作仍可工作。Agent 的批量修改通过自动 Git 提交形成可回滚历史，但用户原文不会被 AI 版本覆盖，AI 改写以并列修订存在。

## User Stories

1. As a technical reader, I want to create a local Zhiliu knowledge vault, so that I retain ownership of my reading and writing data.
2. As a first-time user, I want a clear onboarding path, so that I can reach the first useful result without understanding the internal architecture.
3. As a first-time user, I want to configure an OpenAI-compatible Base URL, model name, and API Key, so that I can use my preferred provider.
4. As a cost-conscious user, I want separate fast and deep-writing model roles, so that routine analysis does not require my most expensive model.
5. As a user with one model, I want both roles to support the same model configuration, so that setup remains simple.
6. As a privacy-conscious user, I want API Keys stored in the operating system credential vault, so that secrets never enter Markdown files or Git history.
7. As a user, I want to test a model configuration before saving it, so that endpoint or credential errors are discovered immediately.
8. As a user, I want the Chinese interface to support Chinese and English source material, so that my mixed-language library remains useful.
9. As a keyboard-oriented user, I want every core workflow to have discoverable shortcuts, so that speed does not require hidden commands.
10. As a mouse-oriented user, I want visible controls for shortcut-enabled actions, so that the application remains learnable.
11. As a reader, I want to import local EPUB files, so that I can read DRM-free ebooks I legally possess.
12. As a reader, I want to import local text-based PDF files, so that reports and books can join my library.
13. As a reader with scanned documents, I want bundled local Chinese and English OCR, so that scanned pages can become searchable and selectable without cloud upload.
14. As a user importing a scanned PDF, I want OCR progress and errors to be visible, so that I understand when the content will become available.
15. As a user with a large library, I want imported books to appear immediately while indexing continues, so that I can start reading without waiting for the entire library.
16. As a user, I want search and Agent features to show whether a source is still indexing, so that partial results are not mistaken for complete results.
17. As a web reader, I want to paste a public article URL and save a cleaned local copy, so that useful web sources can enter my knowledge flow.
18. As a web reader, I want URL imports to preserve title, author, source URL, and capture time when available, so that later citations remain traceable.
19. As a web reader, I want a clear failure message for login-required, paywalled, or unsupported pages, so that the app does not pretend an incomplete import succeeded.
20. As a Markdown user, I want to import an existing Markdown folder by copying it into my vault, so that prior notes can contribute to search and writing.
21. As a Markdown user, I want original imported files to remain unchanged at their source location, so that Zhiliu does not silently alter another tool's vault.
22. As a reader, I want a library showing imported books and articles, so that I can resume or inspect my sources.
23. As a reader, I want EPUB and PDF table-of-contents navigation, so that I can move through long works efficiently.
24. As a reader, I want the app to remember my last reading position, so that I can continue where I stopped.
25. As a reader, I want reading status to reflect my real progress or explicit confirmation, so that AI analysis never marks a book as read on my behalf.
26. As a reader, I want to select text in EPUB and text-based PDF documents, so that I can capture precise evidence.
27. As a reader, I want OCR text selections to retain page coordinates, so that I can return to the scanned source.
28. As a reader, I want to press a shortcut after selecting text, type a thought, and press Enter to save it, so that capture does not interrupt reading.
29. As a reader, I want every capture to contain the quotation, my thought, book identity, chapter or page, and location, so that context is never lost.
30. As a reader, I want saved notes to link back to the exact source position, so that I can verify context later.
31. As a reader, I want to view all notes associated with the current source, so that I can revisit my thinking while reading.
32. As a reader, I want AI assistance available in a global side panel, so that asking about a passage does not replace the reading surface.
33. As an offline reader, I want EPUB and PDF reading to work without a network, so that cloud availability does not block reading.
34. As a reader, I want imported content to have scripts and unsafe active content disabled, so that untrusted EPUB and web files cannot execute arbitrary behavior.
35. As a knowledge worker, I want each captured thought stored as an atomic Markdown file, so that it remains portable and independently addressable.
36. As a knowledge worker, I want structured metadata in Frontmatter, so that source, authorship, identifiers, and relationships survive outside the app.
37. As a user, I want stable identifiers independent of filenames, so that links remain valid when I rename or reorganize notes.
38. As a user, I want to edit Markdown inside Zhiliu, so that I can refine thoughts without leaving the app.
39. As an external-tool user, I want to edit vault files in Obsidian or VS Code, so that Zhiliu does not lock me into one editor.
40. As an external-tool user, I want Zhiliu to detect filesystem changes and incrementally refresh indexes, so that external edits appear without restarting.
41. As a user, I want simultaneous internal and external edits to preserve both versions, so that neither copy is silently overwritten.
42. As a user facing a conflict, I want a clear merge workflow, so that I can decide which wording to keep.
43. As a user, I want my original wording distinguished from AI-authored revisions, so that authorship remains truthful.
44. As a user, I want AI rewrites stored as parallel revisions, so that the original thought is never destroyed.
45. As a user, I want to accept, reject, or edit a parallel AI revision, so that I remain the author of the final note.
46. As a user, I want user-authored text ranked ahead of quotations and AI derivatives by default, so that retrieval reflects my thinking first.
47. As a user, I want plaintext Markdown compatible with standard tools, so that BitLocker or FileVault—not a proprietary format—provides at-rest protection.
48. As a user, I want to move or copy the vault to another computer manually, so that lack of built-in sync does not trap my data.
49. As a user, I want local full-text search across books, web articles, notes, and drafts, so that known terms are easy to retrieve.
50. As a user, I want local multilingual semantic retrieval, so that conceptually related Chinese and English content can be found without exact keyword matches.
51. As a user with years of notes, I want useful performance at approximately 10,000 atomic notes, so that the system remains viable as a long-term second brain.
52. As a user, I want indexing to run incrementally after imports and edits, so that the app avoids repeatedly rebuilding the entire library.
53. As a user on an 8 GB computer without a discrete GPU, I want reading and knowledge workflows to remain usable, so that local intelligence does not require specialist hardware.
54. As a user, I want GPU acceleration to be optional, so that capable machines can run local processing faster without becoming a requirement.
55. As a user, I want the Agent to analyze newly added books and notes under configurable triggers, so that discovery can be proactive without being uncontrollable.
56. As a user, I want manual Agent runs at any time, so that I do not have to wait for an automatic schedule.
57. As a cost-conscious user, I want daily and monthly background Token limits, so that proactive work cannot create an unbounded bill.
58. As a cost-conscious user, I want background request-count limits and cumulative usage reporting, so that I can understand activity even when provider pricing is unknown.
59. As a user, I want the Agent to pause cleanly when a budget is exhausted, so that interactive writing remains under my control.
60. As a thinker, I want notes from different books clustered into editable themes, so that recurring ideas become visible across sources.
61. As a thinker, I want to rename, merge, split, hide, and pin themes, so that the organization reflects my understanding.
62. As a thinker, I want pinned themes protected from automatic regrouping, so that Agent reruns do not destroy intentional structure.
63. As a thinker, I want Agent-applied organization changes committed as a batch, so that I can inspect and roll back one operation coherently.
64. As a thinker, I want an in-app suggestions inbox instead of interruptive system notifications, so that proactive discovery does not disrupt reading.
65. As a thinker, I want separate “your thought signals” and “discovered from the library” queues, so that corpus ideas are not presented as my beliefs.
66. As a thinker, I want user-thought themes to show which of my notes support them, so that I can judge whether the pattern is real.
67. As a thinker, I want library-discovered themes to show their book evidence, so that exploration remains grounded.
68. As a thinker, I want the Agent to analyze unread imported content without marking it as read, so that the library can inspire research without falsifying progress.
69. As a library user, I want to ask questions across books, articles, notes, and eligible drafts, so that I can explore accumulated knowledge conversationally.
70. As a library user, I want each chat paragraph labeled as knowledge-base evidence or model supplementation, so that I can see the answer's epistemic boundary.
71. As a library user, I want evidence-backed chat text to link to exact sources, so that I can verify the answer.
72. As a library user, I want the model to use general knowledge when helpful, so that answers are not artificially limited to my vault.
73. As a library user, I want unsupported claims identified as model supplementation, so that fluency is not mistaken for stored evidence.
74. As a user, I want chat history saved, so that valuable investigations are not lost.
75. As a user, I want saved chats excluded from future retrieval by default, so that model output does not recursively pollute the knowledge base.
76. As a user, I want to promote selected chat passages into explicit notes, so that only reviewed insights become knowledge.
77. As an aspiring writer, I want the Agent to detect when my repeated notes may support an article, so that writing opportunities emerge without a blank-page prompt.
78. As an aspiring writer, I want the Agent to require one confirmed thesis and at least three supplied or accepted user thoughts before a formal draft, so that the article has a genuine personal basis.
79. As an aspiring writer, I want themes without sufficient personal thought to remain proposals, so that book-derived material is not misrepresented as my voice.
80. As an aspiring writer, I want eligible user-thought themes to receive automatic “AI trial drafts” within my background budget, so that opening the app can reveal a tangible piece of writing.
81. As an aspiring writer, I want automatic drafts clearly labeled as speculative AI work, so that they are never confused with a finished personal article.
82. As an aspiring writer, I want library-only discoveries to receive proposals rather than automatic full drafts, so that proactive generation stays aligned with my thinking.
83. As an aspiring writer, I want a proposal to show thesis, supporting user thoughts, source evidence, and AI inference before formal generation, so that I can inspect the reasoning.
84. As an aspiring writer, I want to confirm or revise the thesis before formal generation, so that the article pursues my intended argument.
85. As an aspiring writer, I want to include or exclude proposed evidence, so that source selection remains deliberate.
86. As an aspiring writer, I want missing evidence or weak reasoning identified before drafting, so that the Agent does not hide gaps behind fluent prose.
87. As an aspiring writer, I want a Markdown editor with live preview, so that I can work in a familiar technical writing environment.
88. As an aspiring writer, I want user wording, book content, and AI inference shown with distinct authoring colors, so that provenance remains continuously visible.
89. As a color-blind or keyboard user, I want textual or icon provenance labels in addition to color, so that source distinctions remain accessible.
90. As an aspiring writer, I want to open the note or source behind a generated passage, so that I can inspect and correct the context.
91. As an aspiring writer, I want AI-generated wording to remain editable like ordinary Markdown, so that the draft is a starting point rather than a locked artifact.
92. As an aspiring writer, I want AI revisions recorded without overwriting accepted human text, so that the evolution of authorship remains visible.
93. As an aspiring writer, I want lightweight footnotes and a source list generated by default, so that exported work remains credible.
94. As an aspiring writer, I want to disable or edit exported citations, so that citation density fits the publication context.
95. As an aspiring writer, I want clean Markdown output without authoring colors, so that the final article is portable.
96. As an aspiring writer, I want to copy the final article as plain text, so that I can paste it into simple editors.
97. As an aspiring writer, I want to copy the final article as rich text, so that formatting survives in common publishing editors.
98. As a new user, I want to progress from importing usable source material to a sourced draft within 30 minutes, so that the core value is evident in the first session.
99. As an established writer, I want to select my own previous articles as style examples, so that the Agent can learn from intentional samples.
100. As an established writer, I want accepted differences between an AI draft and my final edit to inform style learning, so that the system adapts to my real choices.
101. As an established writer, I want a readable style profile describing learned tendencies, so that personalization is inspectable rather than hidden.
102. As an established writer, I want to edit the style profile manually, so that I can correct overgeneralizations.
103. As an established writer, I want evidence for each proposed style-profile change, so that one unusual article does not silently redefine my voice.
104. As an established writer, I want to approve style-profile updates, so that learning remains consensual.
105. As an established writer, I want style-profile version history and rollback, so that I can recover an earlier voice configuration.
106. As an established writer, I want to reset learned style completely, so that experimentation is reversible.
107. As an advanced user, I want stable default prompts with optional overrides, so that customization does not make first use fragile.
108. As an advanced user, I want to restore overridden prompts to shipped defaults, so that prompt experimentation is recoverable.
109. As an auditor, I want each Agent operation to record model, prompt version, source identifiers, timestamp, and output, so that results can be reproduced and inspected.
110. As an auditor, I want generation records to exclude API Keys and other credentials, so that traceability does not leak secrets.
111. As a user, I want automatic Git history to track notes, themes, drafts, and lightweight metadata but not books, OCR caches, indexes, or local models, so that history remains practical.
112. As a non-Git-focused user, I want a friendly in-app history timeline, so that rollback does not require command-line knowledge.
113. As an advanced Git user, I want to open the underlying repository and inspect commits, so that standard tools remain available.
114. As an offline user, I want local reading, note editing, search, and manual writing to continue when model APIs fail, so that the application degrades gracefully.
115. As a privacy-conscious user, I want only task-relevant excerpts sent to the configured cloud model, so that whole-vault disclosure is not the default.
116. As a privacy-conscious user, I want outbound model requests attributable to a visible task, so that background processing remains understandable.
117. As a privacy-conscious user, I want telemetry disabled by default, so that installation does not silently report behavior.
118. As a user helping improve stability, I want to opt in to anonymous crash and performance reports, so that I can contribute without sharing reading content.
119. As an open-source user, I want the application licensed under MIT, so that I can inspect, modify, and redistribute it under permissive terms.
120. As a desktop user, I want installable Windows and macOS releases, so that I do not need to run the development environment.
121. As an early adopter, I accept unsigned releases with documented operating-system warnings, so that the project can ship before funding signing certificates.
122. As a user, I want a calm, editorial, low-distraction interface, so that reading and thinking remain visually primary.
123. As a user, I want “Library/Reading,” “Thoughts,” and “Creation” as the three main spaces, so that the product feels like one workflow instead of five unrelated tools.
124. As a user, I want the Agent side panel available across all three spaces, so that assistance follows my current context.
125. As the project owner, I want the first version to be useful as a daily personal tool, so that product quality precedes community scale or monetization.

## Implementation Decisions

- The initial product is a greenfield cross-platform desktop application for Windows and macOS. The exact framework must be selected in an ADR before implementation; the choice must support local filesystem access, secure OS credential storage, web-style EPUB/PDF rendering, background native processing, test automation, and unsigned release packaging on both platforms.
- The product is organized into three top-level spaces: Library/Reading, Thoughts, and Creation. A context-aware Agent side panel is global rather than a fourth independent application.
- The visual direction is a quiet modern reading room: restrained color, strong typography, low visual noise, and no futuristic chat-first chrome.
- Core workflows are keyboard-first but fully discoverable through visible controls. Selection capture must be possible with a shortcut, short text entry, and Enter to save.
- The vault is local-first. It contains portable knowledge artifacts and lightweight metadata; derived caches can be rebuilt.
- Atomic thought notes are Markdown documents with Frontmatter. Each note has a stable identifier, source reference, quotation, user-authored thought, creation/update timestamps, authorship metadata, and relationship metadata.
- Stable identifiers cannot depend on filenames or directory paths. Renames and external reorganizations must not break source links or note relationships.
- EPUB, PDF, imported web articles, and copied legacy Markdown are source documents. Binary originals and derived extraction artifacts are not tracked in Git.
- EPUB support includes rendering, table of contents, reading-position restoration, text selection, and source-location links.
- PDF support includes page rendering, table of contents when available, reading-position restoration, text-layer selection, and page-coordinate source links.
- Bundled local Chinese/English OCR is part of the target MVP for scanned PDFs. It must never upload pages by default. OCR is the first explicitly approved scope cut if the 3–6 month schedule slips.
- URL import supports only public pages that do not require authentication. It stores a sanitized article snapshot and source metadata. It does not reuse browser cookies, bypass paywalls, or automate logged-in browsers.
- Legacy Markdown import copies selected content into the Zhiliu vault. Subsequent changes to the original external folder are not synchronized.
- Active scripts and unsafe content in EPUB and imported HTML are disabled or sanitized before rendering.
- Reading completion is based only on actual local progress or explicit user action. Model summarization or full-book analysis never marks a source as read.
- The primary saved knowledge unit is “quotation + user thought + exact source context.” Quote-only captures may be represented, but the writing-readiness rule requires user thought.
- User-authored text is immutable to automatic overwrite. Agent rewrites are parallel revisions linked to the original and can be accepted, rejected, or edited.
- External file edits are first-class. The app watches the vault, validates changed artifacts, and incrementally updates indexes.
- Concurrent internal/external edits create a recoverable conflict copy and a user-visible merge decision. No last-writer-wins policy is allowed.
- Search combines local full-text indexing with bundled local multilingual Embeddings. Cloud model calls are not required for ordinary retrieval.
- The supported scale target is approximately 10,000 atomic notes on an 8 GB machine without a discrete GPU. GPU acceleration may improve processing but cannot be mandatory.
- Import and indexing are progressive. Reading and note capture become available as soon as the source can render; search and Agent features report partial-index states.
- Agent semantic recall uses local Embeddings to select candidates. The configured cloud language model performs higher-level clustering, naming, reasoning, conversation, and writing.
- Model access uses an OpenAI-compatible interface with configurable Base URL, model name, and API Key.
- Two configurable model roles are exposed: fast/low-cost and deep-writing. Both roles may point to the same endpoint and model.
- API Keys are stored only in Windows Credential Manager or macOS Keychain and are excluded from logs, traces, Markdown, crash reports, and Git.
- Agent operation can be manual or automatic. Users configure triggers, and automatic work obeys daily/monthly Token caps and request-count caps.
- Usage reporting distinguishes interactive and background calls. Exhausted background budgets pause proactive work without blocking user-initiated requests unless the user configured a shared hard cap.
- Agent organization may automatically modify machine-managed metadata and derived artifacts, but each operation is grouped into an automatic Git commit.
- Topics are persisted user-owned entities. Users can rename, merge, split, hide, and pin them. Pinned organization is not replaced by later automatic clustering.
- Topic suggestions are split into “your thought signals” and “discovered from the library.” The first is grounded in user-authored notes; the second may analyze all imported content, including unread material.
- Automatic full trial drafts are allowed only for user-thought themes. Library-only discoveries produce proposals, not full drafts.
- A formal article requires one user-confirmed thesis and at least three supplied or explicitly accepted user thoughts.
- The formal generation flow is proposal, user review, and draft. The proposal exposes thesis, user thoughts, book/web evidence, AI inference, and identified gaps.
- Automatic trial drafts are clearly labeled speculative AI output and remain separate from formal articles until the user confirms the thesis and material.
- Retrieval defaults to user-authored thoughts first, source quotations second, and AI-derived content third. Task-specific reranking is allowed but cannot erase authorship labels.
- Knowledge-base chat may combine vault evidence and model general knowledge. Every response segment identifies whether it is evidence-backed or model supplementation; available evidence links to its exact source.
- Chat history is persisted outside the default retrieval corpus. A user must explicitly promote a selected passage into an atomic note before it participates in future knowledge retrieval.
- The writing surface is a Markdown editor with live preview.
- Authoring provenance distinguishes user wording, source material, and AI inference using permanent colors plus non-color labels. Provenance remains inspectable after editing.
- Final export removes authoring colors and editing labels. It supports Markdown files and copy as plain text or rich text.
- Export includes optional lightweight footnotes and a source list. Citations are editable and may be disabled by the user.
- Style learning uses only user-selected prior articles and accepted edits between Agent drafts and final user versions.
- The style profile is a first-class, readable artifact with manual editing, reset, version history, and evidence-linked proposed updates.
- Style-profile updates are never silently applied. The user reviews and confirms each change.
- Default prompts are stable product assets. Advanced users may create overrides and restore defaults without editing source code.
- Every Agent generation stores a local trace containing task type, model identity, prompt version, source identifiers, timestamp, usage, and result. Secrets are excluded.
- Automatic Git tracks Markdown knowledge, topics, style profiles, articles, prompt overrides, and lightweight relationship metadata. It ignores source binaries, OCR output, local models, indexes, logs, and caches.
- Git is presented as an in-app operation timeline by default. Advanced users may inspect the underlying repository with external tools. A complete Git client interface is not part of the product.
- The vault remains plaintext for interoperability. At-rest confidentiality relies on OS account permissions and BitLocker/FileVault.
- There is no mandatory account and no built-in cloud synchronization in the MVP. Manual folder transfer is supported by portable artifacts.
- Model requests send only excerpts selected for a visible interactive or configured background task. Full source upload is not the default transport strategy.
- Telemetry is off by default. Users may explicitly opt into content-free anonymous crash and performance reporting.
- The application is MIT licensed and optimized first for the owner's daily personal use rather than team collaboration or a hosted business.
- Releases are unsigned Windows and macOS installation packages with explicit documentation of operating-system security warnings.
- The MVP activation criterion is that a user with suitable source material can import content and reach a source-backed draft within 30 minutes.
- The planned development horizon is 3–6 months for one developer, with incremental usable milestones.
- The product does not claim that reading an AI summary equals reading a book. It accelerates retrieval, synthesis, and expression while preserving human reading status.

## Testing Decisions

- The primary test seam is one end-to-end desktop application boundary. Tests drive the visible user workflow rather than internal functions.
- The end-to-end harness uses an isolated temporary vault, real small EPUB/PDF/Markdown/HTML fixtures, and a deterministic fake OpenAI-compatible service.
- A good test asserts user-visible behavior and durable artifacts: rendered content, saved notes, source navigation, provenance labels, files, history entries, exports, and recoverable errors.
- Tests must not assert private component structure, internal method calls, specific database queries, prompt whitespace, or incidental file ordering.
- The principal happy-path scenario covers first-run model configuration, source import, progressive indexing, reading selection, note capture, theme discovery, proposal review, formal drafting, provenance inspection, and clean export.
- EPUB fixture tests cover table-of-contents navigation, stable source positions, selection capture, and restoration after restart.
- PDF fixture tests cover text-layer selection, page navigation, stable citations, and progressive indexing.
- OCR acceptance tests use fixed Chinese and English scanned pages and assert selectable recovered text, page-coordinate links, cancellation, and local-only processing.
- URL-import tests use controlled public HTML fixtures and assert sanitization, metadata capture, readable extraction, unsupported-page errors, and disabled active content.
- Markdown-import tests assert copying, metadata preservation where possible, collision handling, and no mutation of the original folder.
- Vault tests assert that atomic Markdown remains readable by external tools and that stable relationships survive file rename and folder movement.
- Filesystem-watcher tests edit vault files outside the app and assert incremental refresh without restart.
- Conflict tests create simultaneous app/external edits and assert preservation of both versions with no silent overwrite.
- Search tests use Chinese, English, and cross-language fixtures to assert full-text and semantic retrieval behavior.
- Scale tests use a generated 10,000-note vault on an 8 GB reference profile and measure startup, incremental indexing, search latency, and idle memory against explicit budgets established during implementation.
- Retrieval tests assert default ranking by user-authored thought, source quotation, and AI derivative while preserving provenance.
- Agent-budget tests assert Token and request caps, usage reporting, graceful pause, and separation of background from interactive work.
- Topic tests assert separate origin queues, evidence links, pin protection, rename/merge/split behavior, and deterministic rollback of an Agent operation.
- Trial-draft tests assert that only eligible user-thought themes generate automatically and that output is labeled speculative.
- Formal-writing tests assert the confirmed-thesis and three-thought readiness rule, proposal inspection, evidence selection, and formal-draft transition.
- Provenance tests assert that user, source, and AI segments are distinguishable by color and non-color cues, remain traceable after edits, and become clean text on export.
- Chat tests assert paragraph-level evidence/model labels, source navigation, persistence outside the retrieval corpus, and explicit promotion into a note.
- Style-learning tests use fixed sample articles and accepted edits, then assert inspectable proposed profile changes, mandatory confirmation, reset, versioning, and rollback.
- Generation-trace tests assert complete non-secret metadata and verify that API Keys never enter traces, logs, Git, exports, or crash payloads.
- Git-history tests assert operation-level commits, ignored binary/cache artifacts, friendly timeline entries, and restoration of a prior state.
- Offline tests disable networking and assert reading, capture, local search, external editing, history, and manual writing continue while AI actions fail clearly.
- Model-gateway contract tests run against a controlled OpenAI-compatible server. A small opt-in compatibility suite may run against real providers but is not part of deterministic CI.
- Windows Credential Manager and macOS Keychain receive thin platform contract tests plus packaged-app smoke tests; the main suite uses a fake credential adapter.
- Windows and macOS packaged builds receive smoke tests for installation, startup, file opening, credential access, and basic import. Security-warning documentation is manually verified for unsigned releases.
- Accessibility tests cover keyboard traversal, visible focus, shortcut discoverability, screen-reader naming, and provenance cues that do not depend only on color.
- Crash-report tests assert explicit opt-in and verify that source text, notes, prompts, API Keys, and local paths are scrubbed.
- There is no prior product test code to reuse because the repository is greenfield. The end-to-end seam defined here becomes the canonical prior art for later features.

## Out of Scope

- Mobile applications.
- Browser-based or hosted editions.
- Built-in account system and first-party cloud synchronization.
- Team workspaces, real-time collaboration, shared libraries, comments, and permissions.
- Social profiles, following, public feeds, and content communities.
- Task management, calendars, reminders, and general project management.
- Video creation, storyboard generation, and production tooling in the first article-focused release.
- One-click publishing to Zhihu, WeChat Official Accounts, blogging platforms, or social networks.
- DOCX and PDF article export.
- Authenticated webpage capture, browser cookie reuse, paywall bypass, embedded logged-in browsing, and browser extensions.
- Ebook purchasing, an in-app bookstore, DRM handling, DRM-removal plugins, and copyrighted-content download tools.
- Kindle, WeChat Reading, or other closed-platform private API integrations.
- Hand-drawn PDF annotations, freehand ink, text-to-speech, and advanced PDF editing.
- A full Git client with branch management, interactive rebase, remote hosting, and merge tooling.
- Third-party plugin APIs for readers, models, importers, or Agent workflows.
- Native integrations for multiple incompatible model-provider protocols; the MVP uses an OpenAI-compatible contract.
- Requiring local generative language models. Local Embeddings and OCR are supported; generative AI is supplied through BYOK.
- Treating AI summaries as proof that the user read a source.
- Automatic indexing of all saved chat output into the knowledge corpus.
- Automatic rewriting that overwrites the user's original thought.
- Automatic style-profile changes without review.
- Signed binaries, macOS notarization, and automatic application updates in the first release.
- Product monetization, subscriptions, hosted AI credits, and enterprise support.
- Guaranteed extraction of every public website. Unsupported or hostile pages fail explicitly.

## Further Notes

- “让散落在书里的想法，长成真正属于你的文章” is the working product promise.
- The defining differentiation is the proactive Agent and its ability to place a useful speculative draft in front of the user without erasing authorship boundaries.
- Provenance remains a non-negotiable trust mechanism even though proactive drafting—not provenance alone—is the headline differentiator.
- The product analyzes all imported books for library discovery, but only user-thought themes qualify for automatic full trial drafts.
- The style-learning decision supersedes a purely manual style-prompt approach. Manual prompt overrides remain available, while accepted edits and selected prior articles provide the evidence for proposed style changes.
- Bundled OCR creates material schedule, package-size, and CPU-risk. If the 3–6 month horizon is threatened, scanned-PDF OCR moves to a later milestone before EPUB, text-PDF, knowledge chat, or proactive topic discovery are cut.
- Unsigned macOS distribution will produce meaningful installation friction. Documentation must not imply a consumer-ready installation experience until signing and notarization are funded.
- The 30-minute activation target assumes the user imports enough usable source material and can confirm one thesis plus three relevant thoughts; it does not promise that a new reader can acquire deep understanding in 30 minutes.
- The repository currently contains no implementation stack, architecture, tests, license file, or product code. Those are implementation tasks, not existing constraints.
- Before substantial coding begins, record ADRs for the desktop framework, vault schema and stable identifiers, local search/Embedding runtime, OCR runtime, Agent execution model, and Git integration.
