# Electron is the desktop framework

Seven constraints had to hold at once: arbitrary local filesystem access with change watching, OS credential storage, web-style EPUB and PDF rendering with selectable text and precise positions, background native compute, test automation of the running application, and packaging that ships without a paid signing identity on either Windows or macOS. Electron is the only candidate where every one of them has an official or de-facto standard answer that requires no native code of our own.

Because this project is implemented by AI with no human code review, the maturity of driving the application from an end-to-end test outweighs runtime footprint: that test suite is the only quality gate that exists.

## Considered Options

- **Tauri** is far better on installer size, but EPUB and PDF would render through two different system WebViews. Failures that reproduce on only one OS are the wrong kind of defect when nobody reads the code.
- **Flutter** has first-class PDF support, but no official WebView on Windows, and its integration tests run inside the app sandbox and cannot drive the Windows system file dialog — the first step of the core flow.
- **Avalonia** renders PDF as images and does not support text selection. **.NET MAUI** has no first-class macOS backend. **Qt's QPdfView** still has no built-in drag selection.

## Consequences

- CPU-heavy work must stay out of the renderer. When a background worker is introduced, it will be an Electron `utilityProcess`, not `worker_threads`: Electron's pointer-compression cage makes worker isolates share one heap, so one exhausted worker aborts the whole application.
- End-to-end tests launch the Electron binary with Playwright. The packaged application must keep the `EnableNodeCliInspectArguments` fuse enabled, or that harness fails to attach with a silent timeout.
- Minimum supported macOS is whatever Chromium requires in the Electron major we ship, currently macOS 12 for Electron 38. The packaging ticket must read that floor off the shipped Electron version rather than hard-coding a number.
- The installer will be hundreds of megabytes once a bundled embedding model is added. That cost is accepted in exchange for one testable desktop runtime.
