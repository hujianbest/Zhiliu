# A broken stable identifier quarantines the note rather than being reassigned

Stable identifiers are what make the Vault survive the user renaming files and reorganising folders outside the app, so every source link and note relationship in the product ultimately resolves through one. External editing means they can be damaged: a user can delete the Frontmatter, paste a duplicate of another note's identifier, or save a file with a corrupted one. The tempting repair is to mint a fresh identifier and carry on, and it is the one repair we forbid: it silently detaches every existing reference to that note, and the note still looks intact afterwards. Instead a note whose identifier is missing, malformed, or duplicated is marked as needing repair, is held out of the Retrieval Corpus and out of all Agent work, and is surfaced to the user with the specific problem and a repair action.

## Consequences

- The user can see a note in a needs-repair state, which is worse-looking than a silent fix and is the point: the alternative loses their links without telling them.
- Duplicated identifiers implicate two notes, and neither can be assumed to be the original, so both are quarantined and the user chooses.
- Every surface that lists notes has to render this state, which is a real cost paid by the whole application to keep one failure honest.
