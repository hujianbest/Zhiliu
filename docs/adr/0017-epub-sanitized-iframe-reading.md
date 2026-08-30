# EPUB chapters are sanitized in main and shown in a scriptless iframe

An EPUB is untrusted HTML. If the renderer parsed it with scripts enabled, a book could run arbitrary code in the user's session. Reading must also work with no network, so remote images, styles, and scripts in the package cannot be fetched.

The main process is therefore the only place that opens the `.epub` zip. It walks the OPF spine (skipping `properties="nav"` documents), sanitizes each XHTML body before any renderer sees it, inlines package-local raster images as `data:` URLs, and drops `http:`/`https:` URLs. The chapter HTML stays in memory for the current reading session; it is not written into the vault. The renderer displays that HTML in an iframe whose `sandbox` does not include `allow-scripts`. `allow-same-origin` is kept so the parent can attach ArrowLeft/ArrowRight listeners on the chapter document after the user focuses the text.

## Considered Options

- **Parse in the renderer with Chromium's HTML parser.** Smaller main-process surface, but sanitization would then race the first paint, and a missed `allow-scripts` would execute the book. Rejected.
- **Empty sandbox (no `allow-same-origin`).** Stronger isolation, but keydown inside the iframe would not reach the parent, so keyboard paging would fail once the user clicked the text to select it.

## Consequences

- `window.zhiliu.library.open` / `turn` is the public reading seam; chapter HTML in the view is already sanitized.
- CSP on the renderer may include `'unsafe-inline'` for styles so the chapter `srcdoc` can use the paper/ink typography. It must not grow `https:` sources.
- Table of contents and restored reading position are ticket 06; this ADR only covers continuous spine paging of sanitized bodies.
