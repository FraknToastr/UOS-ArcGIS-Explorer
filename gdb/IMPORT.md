# GDB Explorer browser ZIP import — v22.7

Open `../index.html` and choose GDB Explorer, or open this folder's `index.html` directly. Use **Open ZIP** to select an existing modular GDB Explorer v22.5, v22.6 or v22.7 export. A complete Explorer Suite ZIP containing one GDB catalogue also works, including exports wrapped in an enclosing folder. This reads browser exports, not raw `.gdb` folders or geodatabases.

**Replace ZIP** validates a new candidate before replacing the current catalogue. **Cancel import** keeps the previous workspace. **Clear ZIP** releases imported files, cached data and attachment URLs. Imports stay in this page's memory; they are released on reload, navigation or closing the page. Nothing is uploaded, saved to browser databases or written back to the source ZIP.

The supplied toolbox can still generate a complete offline app. In those generated apps, the bundled catalogue starts automatically. Their Open ZIP control can open another compatible export without re-exporting the original geodatabase.

## What is read

The ZIP directory, `BUILD_INFO.json` and catalogue are read during import. Data pages, geometry, metadata, Storage and attachment payloads load only when requested. Imported HTML, application JavaScript and vendor files are ignored. The catalogue and chunk wrappers are parsed as JSON; they are never evaluated as JavaScript. The app always runs its own bundled runtime and map engine.

ZIP paths, case/Unicode aliases, symbolic links, file/folder collisions, encryption, supported compression methods and catalogue references are checked before replacement. CRC and local-header integrity are checked whenever an entry is decompressed. An unread lazy entry can still prove corrupt when first opened; that view reports the read failure rather than silently executing or displaying invalid data. This is not a claim that every byte of the archive has been decompressed during import.

Resource limits are 200,000 directory entries, a 32 MiB catalogue, 128 MiB data chunks and 256 MiB per attachment. A separate 64 MiB maximum metadata read bounds zip.js's central-directory allocation. Oversized or unsupported input reports a readable error. The data cache remains four entries and 8 MiB of encoded source bytes; larger pages bypass the reusable cache. This cache allowance is not a total browser-memory guarantee.

One decompression job runs at a time. The bundled ZIP worker performs decompression and CRC work where workers are available; it terminates after an idle timeout. If browser policy blocks workers, the bundled inflater can run inline and yields between bounded output chunks. No CDN, service worker, browser flags or local server is required. Native Compression Streams are optional.

Attachments are decompressed on View, Download or an explicit thumbnail toggle. Thumbnails default off in a fresh browser. Each thumbnail is limited to 16 MiB, with at most 64 MiB of thumbnail Blob payload retained for the current view. A single View and a single Download can each use the 256 MiB attachment limit. View changes, page changes, modal close, replacement and Clear revoke their corresponding object URLs. Raster images and PDFs have inline viewers; HTML, SVG and other file types are download-only.

Long attribute cells show a 512-character preview and a bounded tooltip. **View full value** opens the complete original value as plain text. Closing the dialog clears its text node; changing dataset, tab or page closes it. Exported values and OID identity are unchanged.

## ZIP dependency

The app bundles `@zip.js/zip.js` **2.24.0**, `dist/zip.min.js`, including its worker and WASM fallback. Its BSD licence is in `vendor/zip.js-LICENSE.txt`.

- Source: [zip.js upstream](https://github.com/gildas-lormeau/zip.js)
- API: [ZipReader](https://gildas-lormeau.github.io/zip.js/api/classes/ZipReader.html)
- Package: [npm package](https://www.npmjs.com/package/@zip.js/zip.js/v/2.24.0)

The dependency is a bundled browser runtime asset. ArcGIS Pro's Python environment needs no package installation.

## Developer validation

Generate synthetic/adversarial fixtures outside this deployment folder:

```text
rtk proxy python3 tests/test_import_fixtures.py /tmp/fixture.zip /tmp/uos-v2-import-fixtures --entry-limit
rtk node -e 'require("./tests/test_import_browser.cjs")'
```

Run from the suite folder. The harness accepts `GDB_IMPORT_ROOT`, `GDB_IMPORT_FIXTURES`, `PLAYWRIGHT_PACKAGE`, `GDB_CHROMIUM_PATH` and optional `GDB_IMPORT_RESULTS`. Point `PLAYWRIGHT_PACKAGE` at an installed Playwright package and `GDB_CHROMIUM_PATH` at its callable Chromium executable when their defaults do not match your development machine. These are developer tools, not app requirements.

The browser harness executes direct-file and localhost imports; actual ZIP workers; forced blocked-worker/non-native-inflater fallback; invalid replacement preservation; CRC, path and size rejection; cancellation during a large directory scan; 150-row paging; Metadata and Storage; lazy attachment View/Download/thumbnails; URL disposal; Clear/reload; and full long-cell values. A separate integration check covers polygon map clicks and lazy attributes for OIDs 537 and 5794. Real ArcPy execution and a target managed Edge deployment remain environment-specific checks.
