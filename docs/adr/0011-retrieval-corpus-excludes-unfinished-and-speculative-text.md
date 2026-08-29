# The Retrieval Corpus admits only sources, notes, and finalised formal manuscripts

The spec says retrieval covers "eligible drafts" (US 69) without defining eligibility, and the definition matters more than it looks. If a Trial Manuscript or an unfinished Formal draft can be returned by search, then AI-written speculation becomes evidence for the next generation, and a claim the user never confirmed can come back to them as a citation from their own knowledge base. That loop is invisible from inside a single generation: the second AI output looks well-sourced precisely because the first AI output is sitting in the corpus. We therefore define the Retrieval Corpus as Source Documents, Atomic Notes, and Formal Manuscripts whose status is Final — nothing else.

## Consequences

- Trial Manuscripts are never retrievable, in any surface. They are reachable only from the Topic that produced them and from the Suggestion Inbox.
- A Formal Manuscript is invisible to retrieval while it is a Draft and becomes visible the moment the user finalises it, which makes finalising a meaningful act rather than a label.
- Chat transcripts stay out, which the spec already requires; this decision is what explains why, and the explanation is the same one.
- Two more classes of artifact are held out for a different reason — not because they are speculative but because they are ambiguous: an unresolved Conflict Copy would return the same passage twice with no way for the user to tell which is current, and a note quarantined under ADR-0013 cannot be trusted to be the note its references point at. Both re-enter the corpus once the user resolves them.
- Anything that adds a new kind of AI-authored artifact must state which side of this line it falls on, and the default is out.
