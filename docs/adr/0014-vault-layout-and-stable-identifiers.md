# Vault layout, Frontmatter, and stable identifiers

A note is worthless if the passage that produced it cannot be found again, and any identifier that is the filename or the folder path breaks the moment the user renames a file in Obsidian or copies the Vault to another machine. We therefore store knowledge as one Markdown file per Atomic Note, with a UUID in Frontmatter that is the only identity the rest of the system may use, and we keep imported source files inside the same Vault directory so "copy the folder" remains a complete migration.

Field names are English and match the domain terms; user-facing copy stays Chinese.

## Layout

```
<vault>/
  notes/                 # Atomic Notes, nested folders allowed
  sources/               # Imported EPUB, PDF, web snapshots, copied Markdown
  .zhiliu/
    vault.json           # format version
    cache/               # indexes, embeddings, and other derived artefacts
```

`notes/` and `sources/` are the knowledge the user owns. `.zhiliu/cache/` is rebuildable and must not be treated as source of truth. `vault.json` is tiny durable metadata, not a cache.

## Frontmatter

Every Atomic Note carries: `id`, `kind` (`excerpt` | `thought_note`), `source_id`, `source_position`, `quotation`, `thought`, `created`, `updated`, `provenance` (`quotation: source`, `thought: user`), and `relations`. An Excerpt is the same file with an empty `thought`. The Markdown body repeats 引文 and 想法 so an external editor can read the note without parsing YAML.

## Consequences

- Resolving a note means scanning `notes/**/*.md` for the matching `id`. That is cheap at the 10,000-note scale and is what makes rename and move safe.
- The last-opened Vault path is stored in the application user-data directory, not inside the Vault, so copying a Vault to another machine does not drag along another user's window state.
- First run asks the user to choose a directory; after that, startup reopens it.
