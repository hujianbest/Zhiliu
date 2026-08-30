# PDF pages are sanitized HTML text layers, not a scripted viewer

Ticket 10 adds text PDFs as Source Documents. The PDF binary is copied into the vault like an EPUB (ADR-0001). The main process uses pdf.js only to extract the outline, page boxes, and text items; it then builds a static HTML page of absolutely positioned spans and sends that through the same sanitised iframe as EPUB (`sandbox="allow-same-origin"`, no `allow-scripts`). Untrusted PDF operators never run in the renderer.

Pages without a text layer still render as an empty paper-sized page. The chrome — not the untrusted HTML — tells the user this version cannot select text (ADR-0009). Capture is refused on those pages.

Source Position for PDF notes is `pdf:<pageIndex>:<startOffset>:<endOffset>:<x0>:<y0>:<x1>:<y1>`, so a jump can restore both the page and the in-page box.

## Consequences

- `pdfjs-dist` is a JavaScript dependency, not a second native module. `@napi-rs/canvas` stays uninstalled.
- Page navigation reuses the EPUB turn/jump/resume machinery. Labels switch to 上一页 / 下一页 when the open source is a PDF.
