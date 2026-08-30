# Imported source files live inside the Vault

A note is worthless if it cannot return to the passage that produced it, and a reference to a file outside the Vault breaks the moment the user moves or copies their Vault to another machine — the failure mode that is hardest to recover from, because the evidence is gone while the note still looks intact. We therefore copy every imported EPUB, PDF, web snapshot, and legacy Markdown file into the Vault directory and exclude the binaries from Git, accepting a Vault of many gigabytes so that "copy the folder" stays a complete migration.

## Consequences

- The Vault holds far more bytes than the knowledge artifacts alone, and a Git repository sits beside several gigabytes of ignored files.
- Importing duplicates disk usage against the user's original files, which we accept rather than depending on paths we do not control.
