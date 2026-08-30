# Automatic Git history is a timeline, not a Git client

The Vault is a Git repository so every durable knowledge change can be rolled back, and so a user who already knows Git can open the same folder in any Git tool. The application never exposes branches, remotes, rebase, or staging. What the user sees is a list of operations in Chinese — 记下一条思想笔记, 导入来源文档, 回滚到此处 — each mapping to one commit on the current branch.

Ticket 11 only asserts Atomic Notes. Later entities (topics, proposals, manuscripts, style profiles, prompt overrides) are declared in the ignore-and-track contract now so they land in the same history when those tickets create them.

## Tracked

Markdown knowledge under `notes/`, plus lightweight metadata (`.zhiliu/vault.json`, `.zhiliu/library.json`, `.zhiliu/reading.json`). Future tickets add `topics/`, `proposals/`, `manuscripts/`, `style/`, `prompts/`.

## Ignored

Source binaries (`*.epub`, `*.pdf`), rebuildable cache (`.zhiliu/cache/`), local models (`models/`, `*.onnx`), logs, and a reserved `.zhiliu/ocr/` path for the deferred OCR work in ADR-0009. This version never creates that directory.

## Consequences

- Commits are authored as `知流 <zhiliu@localhost>` so the timeline does not depend on a machine-global Git identity.
- Rollback is `git reset --hard` to the chosen commit, then the in-app index is rebuilt. There is no branch picker.
- Users may inspect the same repository with `git log` outside the app. The app will not fetch, push, or manage remotes.
