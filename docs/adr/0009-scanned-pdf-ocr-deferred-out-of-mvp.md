# Scanned-PDF OCR is deferred out of the MVP

The spec places bundled Chinese and English OCR inside the MVP while also naming it the first approved scope cut, and investigation turned that call. The Python and PaddlePaddle path is unshippable on the desktop at roughly 500 MB of dependencies, with the official pipeline peaking at 2.2 GB of memory and saturating about ten cores. The viable ONNX path still costs 50–80 MB per platform, three to six seconds per page on the target machine, and a new image-preprocessing dependency that ADR-0008 would otherwise forbid. We ship the MVP without OCR and revisit once it has shipped.

This contradicts the spec, whose own scope-cut priority is what authorises the change; no other MVP capability is reduced to pay for it. Three passages of `spec.md` are void for this release and must not be implemented from:

- Implementation Decisions (line 161), which lists bundled Chinese and English OCR as in scope.
- Testing Decisions (line 219), which requires OCR acceptance tests asserting selectable recognised text and page-coordinate links. No such test is to be written; an implementer building a suite from that line would be writing acceptance tests for a capability that does not exist.
- Out of Scope (line 263), which states that local embeddings and OCR are supported. Only local embeddings are.

The OCR caches named in US 111 and in the Git-ignore rules (line 198) are in scope as *rules* but are empty in practice this release: nothing produces such a directory, and an implementer must not go looking for one.

## Consequences

- Scanned PDFs still import and remain readable as page images, but produce no selectable text and cannot be captured as notes.
- Three of the spec's user stories move out of scope for this release.
- The OCR ticket moves to `needs-triage` rather than being deleted, so the runtime research behind it survives for whoever picks it up.
