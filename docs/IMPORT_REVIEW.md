# Browser ZIP import review and validation

GDB Explorer v22.7 runs its bundled application code against a session-only ZIP data adapter. It accepts modular GDB Explorer v22.5, v22.6 and v22.7 exports, or a complete suite containing exactly one GDB catalogue. Folder-wrapped exports work. Raw geodatabases are not browser exports and receive an explicit rejection.

The original `delivery` folder and input sources were not edited. New runtime work is confined to the copied `gdb` application and the corresponding generated-app assets prepared by the suite toolbox workflow.

## Implemented behavior and safeguards

- Open, Replace, Cancel and Clear are actual controls. Candidate validation completes before swapping the active catalogue. Invalid candidates leave the selected dataset and its current rendered view intact. Abort signals and generation checks prevent cancelled/stale imports or view reads from painting a newer workspace.
- The directory, `BUILD_INFO.json` and catalogue load during import. In the 166-entry fixture, startup decompressed only two entries, totalling 11,830 bytes. Attributes, geometry, metadata, Storage and attachment payloads remain lazy. The archive is not fully unzipped into browser memory.
- Imported HTML, runtime JavaScript and vendor files never run. Exact exported catalogue/chunk wrappers are stripped and their payloads passed to `JSON.parse`. A ZIP containing a hostile replacement `js/core.js` opens using the trusted bundled runtime; the hostile script never executes. A catalogue containing appended executable JavaScript is rejected.
- Validation rejects unsafe paths, Windows names/drives/streams, dot/separator aliases, case/Unicode aliases, symbolic links, nonregular entries, file/folder collisions, encrypted entries, unsupported compression methods, unsupported export versions, multiple catalogues, missing referenced data and invalid UI-consumed scalar shapes. Catalogue names/paths are bounded to 4,096 characters, catalogue groups plus datasets to 200,000, and logical dataset nesting to 32 levels (physical source-folder depth is not restricted). Runtime code and map-engine assets come from the new suite, not the imported archive.
- Limits: 200,000 directory entries; 32 MiB catalogue; 128 MiB per data chunk; 256 MiB per attachment. A separate 64 MiB maximum metadata read bounds the ZIP library's central-directory allocation. Decompressed byte counts are checked against both the limit and the entry's declared size, and CRC/local-header checks run whenever an entry is opened.
- The reusable data cache remains four entries/8 MiB of source bytes. A 9.8 MiB test page bypassed it; the retained schema occupied 5,668 bytes. This is not a total browser-heap limit: an active page and its parsed JSON still occupy memory.
- One decompression job runs at a time. Bundled `@zip.js/zip.js` 2.24.0 includes its Blob worker and WASM inflater; no CDN or runtime installation is needed. One worker is allowed, with 64 KiB output chunks and a one-second idle termination timeout. When workers are blocked, the bundled inline inflater yields between bounded output chunks. Native Compression Streams are optional and were deliberately disabled in the fallback test.
- Attachments stay unloaded when thumbnails are off. View, Download and explicit thumbnail toggles request their own entry bytes. Thumbnails are limited to 16 MiB each and 64 MiB of retained Blob payload per view; one modal and one download can separately use the 256 MiB attachment limit. View/page changes, toggling thumbnails off, modal close, replacement and Clear revoke their corresponding object URLs. Generation checks prevent an in-flight attachment read from recreating a URL after its scope was released. HTML and SVG are download-only; supported raster images and PDFs have inline viewers.
- Imports are not persisted to Local Storage, IndexedDB or a server. They are released on reload, navigation or closing the page. Existing appearance preferences retain their established browser storage behavior.

## Material additional finding: unbounded cell text duplicated in DOM

The inherited table was bounded to 150 rows × 24 columns, but inserted every full cell string into both the visible text and its `title`. A synthetic page with 150 cells of 65,536 characters consequently duplicated almost 20 MiB of text into the DOM and produced a long main-thread stall.

`gdb/js/tables.js` now displays at most 512 characters per cell and 256 characters per tooltip. Only truncated cells receive **View full value**. That action opens the complete original value using `textContent`, with no HTML evaluation. Closing the dialog clears its text node; changing the dataset, view or page closes it. The underlying data and feature/OID identity are unchanged. Tests verify all 65,536 characters are available through that action.

### Measured results

Environment: WSL Linux, installed Playwright 1.63.0, headless Chromium 149.0.7827.55, 1440 × 900 viewport, no CPU throttling; software graphics were enabled for browser consistency. Input: the same synthetic 150-row page containing 150 × 65,536-character strings, approximately 9.8 MiB before compression. A 10 ms interval samples browser responsiveness while the page loads and renders. Wall time is measured from selecting the dataset until the attribute page exists. These are browser timings, not GPU or real-ArcPy measurements.

| Path | Before bounded previews: wall / maximum heartbeat gap | Final validation: wall / maximum heartbeat gap |
| --- | ---: | ---: |
| Direct file, ZIP worker | 657.6 / 561.7 ms | 182.9 / 80.3 ms |
| Localhost, ZIP worker | 654.0 / 554.3 ms | 172.8 / 51.8 ms |
| Direct file, workers blocked and native streams disabled | 633.8 / 546.0 ms | 126.8 / 46.5 ms |

These are individual development runs rather than a statistical hardware benchmark. The final run also included the large-directory cancellation/limit cases before measuring the file-worker path. They show that bounding DOM text removes the demonstrated pathological duplication; they do not promise universal frame rates or prove that inline decompression outperforms workers. Final raw measurements are in `tests/results/import.json`.

## Actual browser coverage

`tests/test_import_browser.cjs` passed in three separately initialized browser contexts:

1. Direct `file://` with real ZIP workers.
2. Localhost HTTP with real ZIP workers.
3. Direct `file://` with Worker creation deliberately blocked and `useCompressionStream:false`, exercising the bundled inflater fallback.

Each path checked 150-row paging, Metadata, Storage, attachment View/Download/thumbnails (including exact SHA-256 identity of downloaded bytes), scoped URL disposal, a namespaced folder-wrapped suite, ignored hostile runtime content, full long-cell values, Clear and no persistence after reload. Fifteen invalid replacement families retained the previous active table: appended catalogue JavaScript, wrong version, raw GDB contents, missing reference, nonscalar counts, excessive logical dataset nesting, multiple catalogues, drive path, dot alias, case alias, backslash path, Windows device name, catalogue size, data-chunk size and bad catalogue CRC. An advertised attachment above 256 MiB was rejected on View without creating a modal URL.

The file-worker path additionally opened a real 200,166-entry test ZIP. Cancellation after indexing had begun preserved the existing workspace. A complete indexing attempt rejected the input when the 200,000-entry cap was reached. A same-task cancellation also prevented a pending candidate from committing. No imported script marker executed and no uncaught browser page error occurred in any context.

Worker lifecycle instrumentation observed two created/two terminated workers in the file-worker context, one/one under HTTP, and zero/zero in the forced inline context. After Clear and 1.5 seconds idle, every created ZIP worker had terminated. This is actual Worker construction/termination observation, not inference from the backend option.

Fixtures are generated under `/tmp`, never included as production data. Generate them from an existing synthetic exporter fixture with `tests/test_import_fixtures.py`; the browser harness accepts `GDB_IMPORT_ROOT` so it can target a clean packaged extraction. `gdb/IMPORT.md` gives repeat instructions and dependency provenance. The package licence is bundled in `gdb/vendor/zip.js-LICENSE.txt`.

## Practical limits and remaining checks

- An unread lazy payload can still be corrupt. Catalogue acceptance does not claim that every data or attachment entry has already been decompressed and CRC-checked. Such a payload fails when first used, with a visible view/attachment error. Fully validating every payload before replacement would defeat lazy import.
- JSON parsing and DOM rendering run on the main thread. They are size-bounded, and long cell previews are bounded, but the 128 MiB chunk cap can still be expensive on a low-memory device. Production exports should retain their normal small paging defaults.
- Object-URL counters represent retained Blob payload references, not total browser memory or decoded image allocations. Browser decoding and map-engine allocations are separate.
- The index/decompression caps and malformed fixtures are browser tests against synthetic exports. They do not establish actual ArcGIS Pro licensing/provider behavior, real enterprise attachment layouts, or target managed Edge policy.
- The suite integration workflow separately exercises imported map polygons/OIDs 537 and 5794 and clean generated app paths. Live ArcGIS authentication and real geodatabase execution require the relevant target environment; they are not replaced by the import harness.
