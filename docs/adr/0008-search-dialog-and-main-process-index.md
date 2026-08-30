# Global search is a dialog; the full-text index lives in the main process

Search is a retrieval action over the current vault, not a fourth workspace. The three spaces stay 书库/阅读, 思想, and 创作. The user opens a `<dialog>` from a visible 检索 control or Ctrl/Cmd+K; Escape dismisses it. The shortcut is inert on the first-run vault picker.

The index is built in the Electron main process so the renderer never reads Markdown or EPUB bytes. Documents are note quotation+thought and chapter text stripped from `extractReading` HTML. The engine is in-memory MiniSearch and is rebuilt after `notes.save` and library import; at this corpus size a full rebuild is acceptable. Ticket 09 records the lasting full-text-plus-embedding runtime ADR, including incremental updates. If this index is ever spilled to disk, it belongs only under `.zhiliu/cache/`.

Hits expose `kind`: `epub` | `note` | `article` | `draft`. A hit is labeled 部分索引 when its *source document* `indexStatus !== 'ready'`. Notes are complete as soon as they are saved and are not labeled. EPUB catalog rows stay `pending` until later semantic indexing, so book hits currently show 部分索引 even though their chapter text is searchable.

## Considered Options

- **A fourth 检索 space.** Would compete with the three-space IA and make search feel like a destination instead of a jump list.
- **Renderer-side MiniSearch.** Would pull vault text into the page and fight the CSP/offline rule.
- **Persist the MiniSearch dump in `library.json`.** That file is durable catalog metadata, not a cache.

## Consequences

- `window.zhiliu.search.query` is the public seam. The renderer only renders hits and asks `library.open` / `library.jump` (plus the existing quotation `<mark>`) to land on the place.
- Ordinary keyword search does not open HTTP/HTTPS and does not loosen CSP.
