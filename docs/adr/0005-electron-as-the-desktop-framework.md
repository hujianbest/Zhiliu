# Electron is the desktop framework

Seven constraints had to hold at once: arbitrary local filesystem access with change watching, OS credential storage, web-style EPUB and PDF rendering with selectable text and precise positions, background native compute, embeddable ONNX inference, end-to-end automation of the packaged application, and packaging that ships without a paid signing identity on either platform (what macOS actually does with that freedom is ADR-0010). Electron is the only candidate where every one of them has an official or de-facto standard answer that requires no native code of our own. Because this project is implemented by AI with no human code review, the maturity of driving the packaged binary from an end-to-end test outweighs runtime footprint: that test suite is the only quality gate that exists.

## Considered Options

- **Tauri 2.11** was the closest alternative and remains far better on footprint, but rendering EPUB and PDF through two different system WebViews produces failures that reproduce on only one OS. The worst is that pdf.js's module worker handshake never completes under macOS WKWebView and has no timeout, so document loading hangs with no error at all. Doubling the debugging surface is the wrong trade when nobody reads the code.
- **Flutter** has first-class PDF support with text selection and page coordinates, but no official WebView on Windows, which puts EPUB on a community fork; and its integration tests run inside the app sandbox and cannot drive the Windows system file dialog, which is the first step of our core flow.
- **Avalonia** renders PDF only as images and states that text selection will never be supported. **.NET MAUI** has no first-class macOS backend. **Qt's QPdfView** still has no built-in drag selection.

## Consequences

- The installer is 280–400 MB, which is the Electron runtime and Chromium at 120–200 MB, the per-platform ONNX Runtime binaries at 40–70 MB, and the bundled embedding model of ADR-0007 at 130 MB. Idle memory is 150–300 MB before any model is loaded, on a target machine with 8 GB and no discrete GPU, so every CPU-heavy local task must run outside the renderer.
- All CPU-heavy work runs in a `utilityProcess`, never in `worker_threads`. Electron's pointer-compression cage makes all worker isolates share a single roughly 4 GB heap, so one worker exhausting memory aborts the whole application — exactly the failure we would hit running inference and indexing together.
- The minimum supported macOS is not ours to choose: it is whatever Chromium requires in the Electron major we build on, which is macOS 12 for Electron 38 and 39 after Chromium dropped Big Sur. Ticket 06 must read the floor off the Electron version actually shipped and set `LSMinimumSystemVersion` to it, because an app that launches on an unsupported macOS fails in Chromium rather than in our code.
- The packaged application must keep the `EnableNodeCliInspectArguments` fuse enabled, or the end-to-end harness fails to launch it with a silent timeout.
