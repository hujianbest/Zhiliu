# Reading position travels with the vault; the open reader does not

A book's last spine index and read flag are part of the knowledge the user owns. Copying the vault folder to another machine should keep that progress. Whether the reader pane is currently open is window state for this install, like the last vault path: it belongs in userData so a copied vault does not force-open a book on a different computer.

## Persistence

- **Vault** `.zhiliu/reading.json`: per-source `spineIndex`, `status` (`unread` | `reading` | `read`), and `opened`. Opening or paging writes the index and may move `unread` → `reading`. Only explicit 「标记已读」 / 「撤销已读」 set or clear `read`. Agent analysis (`recordAgentLook`, model probe, cache files) does not write this file.
- **userData** `preferences.json`: `openSourceId` (`null`/absent means the library list). Restart on this machine resumes the reader; ADR-0002 already keeps window state out of the vault.

The EPUB table of contents is parsed from the package nav document (`properties="nav"`), matching each `href` to a non-nav spine item. Labels come from the nav, not from chapter headings.

## Considered Options

- **Store position in userData only.** Restart on this machine would work, but a folder copy would lose progress. Rejected.
- **Store open-reader in the vault.** Copying the vault onto another machine would jump a different person into the middle of a book. Rejected.

## Consequences

- `library.resume` reads `openSourceId` and reopens that source at the vault-stored spine index.
- 「返回书库」 clears `openSourceId` and leaves `.zhiliu/reading.json` unchanged, so a later open still lands on the last chapter.
- Git in the vault tracks `reading.json` the same way it tracks `library.json`; binaries and `.zhiliu/cache/` stay ignored.
