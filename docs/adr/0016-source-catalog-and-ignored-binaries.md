# Source catalog is durable; binaries are not Git history

An imported EPUB is a source document the user owns, but the `.epub` bytes are not knowledge text. The catalog that the Library space shows — stable id, title, authors, kind, original filename, index status — is durable metadata and lives next to `vault.json`. The bytes go under `sources/` named by that id, so renaming the file in a file manager does not orphan the catalog row. Git in the Vault (ticket 17) must ignore those bytes and anything rebuildable under `.zhiliu/cache/`.

Index status is stored on the catalog row as soon as the file is parseable. Reading can start while search and Agent still report `pending`; later tickets fill in `indexing` / `ready` without blocking this list.

## Layout

```
<vault>/
  sources/<id>.epub
  .zhiliu/library.json     # { version, sources: [...] }
  .gitignore               # *.epub, *.pdf, .zhiliu/cache/
```

`.zhiliu/library.json` is not a cache. A failed import writes neither a catalog row nor a file under `sources/`.

## Consequences

- The Library list is the same surface for EPUB now and for articles later; `kind` discriminates.
- E2E imports go through `ZHILIU_CHOOSE_FILES` (JSON path array) instead of the system file dialog, matching the directory stub from first-run.
