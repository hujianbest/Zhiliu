# EPUB capture positions are spine index plus character offsets

A note is only useful if the reader can open the same chapter and see the quotation again after a restart or after the Markdown file is renamed. DOM node identity inside a sanitized `srcdoc` iframe is not stable across sessions. The capture therefore stores one string in Frontmatter `source_position`:

```
epub:<spineIndex>:<startOffset>:<endOffset>
```

`spineIndex` is the readable-chapter index used by ticket 06 (`library.jump` / `.zhiliu/reading.json`), not a raw OPF itemref that includes `nav`. Offsets are UTF-16 indices into the concatenated text of the chapter body in the scriptless iframe, measured at capture time. Jump parses the string, sets that spine index, then wraps the matching range in a `<mark>` in the display copy only. The EPUB file on disk is never rewritten.

Quote-only captures keep this same position string; empty thought still becomes `kind: excerpt` in the existing note renderer (ADR-0002). PDF page coordinates are a later ticket.

## Considered Options

- **Store only the quotation string.** Jump could search the chapter text, but repeated sentences would land on the first match, and chapter identity would still need a separate field.
- **Store CFI or DOM paths.** Fragile against sanitization and against the iframe rebuild on every chapter load.

## Consequences

- `notes.save` Frontmatter field names stay English (`source_id`, `source_position`); the renderer formats and parses the string.
- `notes.listForSource` scans `notes/**/*.md` by `source_id`, the same way `notes.get` scans by `id`.
