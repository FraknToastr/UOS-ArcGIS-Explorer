# Suite 2.1 validation and implementation notes

## Architecture and protection

The new suite is isolated in this folder. The original launcher and the prior delivery/source trees were inventoried before work; all 217 file hashes and the protected directory file sets remain unchanged. Online 2.5 adds the Connect page and responsive graph layouts described below. GDB 22.7 retains the 22.6 filesystem tree, bounded paging and popup identity correction, adding session-only browser ZIP import. Suite 2.1's copied Pro toolbox packages this launcher and both workspaces.

Runtime dependencies are local pinned COBE 2.0.1 and zip.js 2.24.0, with licences. No account, CDN, npm installation or server is needed for the launcher or imported GDB data. Actual network services still require connectivity. Source artwork was extracted losslessly from embedded PNGs: this removes base64 HTML overhead without changing transparent pixels. No synthetic data is attached to the production workspace.

## Reproduced checks

- Actual Chromium WebAudio: explicit start, nonzero synthesized samples, mute/resume/restart, 12 rapid toggles, hidden/visible handling and AudioContext closure on departure.
- Actual browser file:// and HTTP subdirectory navigation: both keyboard logo actions, GDB empty/import shell, Online demo and returnlinks, without page errors.
- The same actual routes also passed from fresh and merged Pro-toolbox exports, including populated GDB attributes, metadata and Storage.
- Actual imported 6,000-polygon ZIP map clicks on OIDs 537 and 5794 preserve full synthetic attributes, the 5,000-row table limit, lazy supplemental reads and map disposal. CPU throttling 4x; real software WebGL; not a physical GPU benchmark.
- Existing GDB full browser check passed: attribute/field paging, metadata, attachment gallery/View/Download, map lifecycle, rapid tab switches, cache bounds and no page errors.
- Copied Online 39 logic checks passed against the unchanged copied application.
- 40 retained simulated GDB exporter/Storage/installation/polygon/review methods and 19 new toolbox build/merge/protection methods passed. These use the supplied ArcPy simulation.
- Launcher-specific mask/geometry/satellite/lifecycle checks and representative screenshots are documented in docs/LAUNCHER_REVIEW.md. Import failure, resource and large-cell cases are documented in docs/IMPORT_REVIEW.md.

## SID jukebox update — 4 November 2026

The initial original composition has been replaced by real SID playback: Cybernoid II (Jeroen Tel), ACE II (Rob Hubbard), and Last Ninja II Central Park in-game theme (Matt Gray, subtune 2). A locally bundled adapted Hermit jsSID CPU/SID core streams samples without full-track PCM buffers. Credits and retained rights are in assets/sid-credits.txt; implementation/provenance and tests are in docs/SID_JUKEBOX.md.

Actual browser checks passed all three tracks through HTTP AudioWorklet playback and both automatic/forced local-file ScriptProcessor fallback. They measured nonzero output through the audio graph, mute/restart/next/previous, rapid track changes, volume-zero silence, hidden/resume and context closure. One AudioContext/source is reused. These are actual sample/output checks, not subjective listening or physical C64 hardware validation.

Default spin is 0.5 rad/s and map samples 32,000. Location markers and their control are removed. Twelve satellites use three coordinated inclined planes with four slots each, synchronized to the globe rotation. They are distributed across both hemispheres for broad coverage, with no random speeds or retrograde planes. This is a compact illustration, not a physical satellite simulator. The rendering viewport is 1.6 times wider with compensated visual scale so maximum zoom retains the full globe, atmosphere and satellite silhouettes. Current geometry and screenshot evidence is documented in docs/LAUNCHER_REVIEW.md.

## Performance and limits

The launcher uses one scheduler, delta-time rotation and integrated orbital time, cached projection/size values, bounded DPR, debounced resize, reused buffers and one monotonic resolution reduction after measured slow frames. The procedural plasma remains animated with its original field/colour/glow design. Speed changes preserve orbital phase. Hidden/departed pages stop work; restoration recreates owned resources.

Software Chromium rendering is slower than physical GPU rendering may be; no universal frame-rate claim is made. Main-thread submission cost and requestAnimationFrame cadence are different measurements, not proof of GPU execution time. See launcher review for measurements and exact test environment. The duplicated GDB runtime under toolbox/engine is intentional: it preserves the exporter's validated adjacent-assets contract and is synchronized by scripts/prepare_release.py. Vendor map engines were retained separately rather than upgraded or unified.

Import accepts modular Explorer 22.5/22.6/22.7 exports, including one GDB workspace inside a suite ZIP. It reads archive entries lazily and parses data wrappers as JSON; imported scripts/HTML never become executable runtime. Startup reads build information and catalogue only. Limits are 200,000 entries, 64 MiB ZIP-directory read, 32 MiB catalogue, 128 MiB per data chunk and 256 MiB single attachment. Thumbnail buffers have a separate 64 MiB budget with 16 MiB perthumbnail source limit. Oversized data is reported, never silently represented as zero/truncated source data. Data remains in the selected File and transient buffers; there is no persistent imported-data database.

## Unverified conditions

Windows ArcGIS Pro Python is installed but launch failed before Python at WSL interop: UtilBindVsockAnyPort/socket failed 1. Real ArcPy export, provider-specific behavior and real Pro cancellation remain unverified; no real geodatabase was edited. Private live ArcGIS sign-in/CORS, physical Edge/Safari/mobile devices, audible hardware output and physical GPU timing were not tested. Mobile screenshots use browser emulation. The automated backend checks use actual software WebGL and real WebAudio, not mocked rendering/audio.

## Repeat checks

Use installed Node/Playwright/Chromium for tests/test_audio.cjs, tests/test_routes.cjs, tests/test_import_polygons.cjs and the dedicated launcher/import harnesses. REVIEW_PLAYWRIGHT and GDB_CHROMIUM_PATH can select explicit packages/runtimes. In this managed environment, run browser harnesses through rtk node -e with require of the test file; nested subprocess launches may hit sandbox socket restrictions. Python tests require standard-library Python and their supplied ArcPy simulation, not real ArcPy. Regenerate manifests with scripts/prepare_release.py before toolbox tests after any source edit.

## Clean archive gate

The packaged suite was extracted into a clean folder. All nine launcher checks, all three import modes, the19 toolbox regressions, real audio samples, imported polygon clicks and file/HTTPsubdirectory routes passed from that extraction. Finalruntimefiles match those tested bytes. Reports/screenshots/testevidence were added afterward without changing runtimecode. All217 protected originalsourcefiles and their directoryfile sets remain unchanged. FinalZIP CRC, duplicate-entry and installationmanifest checks also pass.

## Suite 2.1 checks

- Connect REST-fixture browser tests cover verified identity, My/Organisation/Accessible scopes, multi-type search, actual nextStart history pagination, result loading and failed-load rollback, desktop/mobile internal scrolling, and removal of the old modal. Private live sign-in remains unverified.
- The graph uses measured 14px wrapped labels, collision-aware card geometry, curved directed connections and 200ms layout transitions respecting reduced motion. A synthetic mixed 31-node first-degree fixture passes at 1920×1080, 1366×768, 900×740 and 390×844, including open side panels. The requested screenshot was not attached; the fixture stands in for its described item types. At 1366×768 the default Balanced layout retains 13.57px labels. On small viewports or dense layouts, the explicit overview hides small labels while preserving every node and relationship; hover/focus, selection details, Focus and isolation reveal full names.
- Actual browser tests verify twelve shared-buffer Satellite/UFO meshes, synchronized phase across mode changes, sphere occlusion, maximum-scale bounds, enlarged artwork and accessible controls.
- Actual audio return tests cover GDB/browser-history and Online/return-link round trips, checkpoint restoration in both output backends, and the icon restart in the jukebox control row. Pure emulator checks confirm exact next-sample restoration for all three tunes.
- Custom tips pass on all three suite pages: no native body/SVG titles, large-pointer clearance, viewport clamping, keyboard/Escape, immediate hover exit and dynamic removal.

Repeat with tests/test_graph_layout.cjs, tests/online/connect.browser.cjs, tests/online/app.test.cjs, tests/test_craft_modes.cjs, tests/test_audio_return.cjs and tests/test_accessible_tips.cjs. Existing launcher, audio, route and Pro simulation checks are retained.

Initial Suite 2.1 clean extraction: actual audio round trips, shared accessible tips and all 19 Pro-toolbox simulations passed from `/tmp/uos-suite-2-1-check`. Later graph/UFO follow-up checks run against the current source and the refreshed ZIP is checked against all installation-manifest hashes. See tests/results/suite-2.1.json.

Graph appearance and Earth-facing UFO follow-up: tests/test_graph_appearance.cjs passes defaults, independent switches, transparent hit targets, quiet hover/automatic selection, pointer and keyboard activation, background clearing, mobile access and stable geometry. All 50 Online logic checks and the 31-/1,200-node graph browser cases pass. All five craft checks pass, including actual uploaded hull geometry and underside direction over 361 phases in all twelve orbits, plus unchanged sphere occlusion and shared GPU resources. Layout animation reuses node-position objects and cached visibility membership per frame; graphic opacity transitions respect reduced motion. These are software Chromium checks, not a universal hardware frame-rate guarantee.
