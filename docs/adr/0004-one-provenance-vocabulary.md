# One three-valued Provenance vocabulary across storage and editor

Note storage naturally wants to say "user-authored versus AI revision" while the editor naturally wants to say "user wording versus source material versus AI inference", and implementing both would require a mapping layer between them. Default retrieval ranks User ahead of Source ahead of AI, so that mapping would sit directly on the retrieval path, where an error silently reorders results or drops an authorship label rather than failing loudly. We therefore use one three-valued vocabulary — User, Source, AI — at every layer.

Knowledge-base chat is the layer where this is least obvious and where the spec pulls the other way. The spec's US 70 and 73 and its Implementation Decisions describe chat answers as labelled per paragraph with "evidence-backed" versus "model supplementation", which is a second, two-valued vocabulary. We do not implement it as one. A chat paragraph grounded in Vault evidence carries **Source**; a paragraph the model supplied from its own knowledge carries **AI**. **User** never appears in a chat answer, because the user did not write it. This deliberately overrides the spec's wording rather than mapping onto it, for the reason above: a mapping between two provenance vocabularies would sit on the retrieval and display path where its errors are silent.

## Consequences

- Note fields, editor spans, retrieval ranking, and chat paragraphs all read the same label, and adding a fourth kind of provenance is a change felt system-wide rather than in one layer.
- User-facing Chinese copy for chat may still read as 有来源支撑 and 模型补充, because those are better sentences than 来源 and AI in that context. The stored label is the three-valued one; the copy is a presentation of it, and no code may branch on the copy.
- Only two of the three values can occur in a chat answer, so any exhaustiveness check over chat paragraphs must handle User by rejecting it rather than rendering it.
