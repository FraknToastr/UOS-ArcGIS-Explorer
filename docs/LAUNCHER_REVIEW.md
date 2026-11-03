# Launcher implementation and validation

## Scope and preservation

The new launcher retains the supplied plasma equations, three-pass luminous bloom, stars, dust, central COBE globe, neon logo and alien/car composition. The original launcher HTML and existing `delivery` are unchanged. Both embedded PNGs were decoded to external files without re-encoding: `assets/explorer-logo.png` is 2,170×725 and 1,630,327 bytes; `assets/alien-car.png` is 1,536×1,024 and 2,453,957 bytes. Their compressed PNG bytes match the original data URLs.

The original HTML was 5,464,348 bytes; the new entry point is about 20 KB with separate reusable scripts and assets. This removes approximately 1.36 MB of base64 expansion from the two image payloads. It does not reduce their decoded pixel memory, and no unmeasured startup speed-up is claimed.

## Independent logo hit regions

The artwork and both native SVG links share the image's intrinsic `viewBox="0 0 2170 725"`. Geometry was derived from the original PNG's alpha and colour data: alpha threshold 100, cyan/orange seed-distance partitioning, removal of tiny detached components, a three-pixel close/dilation tolerance, one-pixel erosion, and contour simplification at 0.65 intrinsic pixels. Interior holes are preserved using even-odd fill. The visible PNG remains unchanged.

The resulting paths occupy actual lettering silhouettes rather than diagonal phrase-wide rectangles. A browser sample on a two-pixel intrinsic grid found zero intersections. Of the sampled upper hit pixels, 1,959/110,472 (1.77%) fell below alpha 32; for the lower phrase, 1,567/72,999 (2.15%) did. These narrow edge tolerances help imprecise clicking. Most transparent image area remains inactive.

Native links provide keyboard Enter activation; Space is handled explicitly. Hover and keyboard focus reveal only the corresponding silhouette. Normal current-tab relative routes come from `launcher/workspace.js` → `UOS_WORKSPACE.destinations`, with `./gdb/index.html` and `./online/index.html` defaults when an exported configuration omits the property. `?debugLogo=1` displays the existing path outlines for inspection; it is off by default and requires no alternate artwork or debug assets.

## COBE, controls and orbital depth

COBE is pinned to 2.0.1 and bundled locally. Classic-script adaptation permits direct-from-disk use. The only lifecycle correction to upstream is clearing its pending map-image callback and deleting its owned texture in `destroy()`. See `vendor/cobe-NOTICE.md` and the preserved MIT license for exact provenance and adaptations.

The compact panel changes documented COBE options without recreating the globe context. Defaults are phi 0.35, theta 0.18, visual scale 1, 32,000 samples, brightness 6, diffuse 1.2 and white glow; auto rotation integrates 0.5 radians per second. Location markers and their control have been removed. Reduced motion stops automatic animation. Panel height derives from the actual logo's lower screen bound so open controls remain below the logo and scroll internally on short displays.

The website's Satellites showcase uses elevated geographic markers, CSS anchors and center visibility. This implementation instead uses twelve satellites in a coordinated illustrative Walker-Delta 12/3/2 constellation: three planes at 60° inclination and 120° ascending-node spacing, four satellites 90° apart in each plane, and 60° inter-plane phase offsets. They share the displayed Earth's spin period and prograde direction. They are distributed across both hemispheres rather than placed along the equator. A single integrated spin angle drives Earth rotation and the orbital phase; the satellite camera excludes that spin, preventing angular speed from being applied twice. These inclined common-period orbits are not geostationary fixed-longitude positions. No independent satellite-speed control or random orbital periods remain.

A separate small WebGL overlay uses COBE's exact camera transform and 0.8 world-space sphere radius. Each fragment is depth-tested analytically against the visible sphere; a partially occluded panel can remain visible beyond the limb while the part behind Earth disappears. No whole-object CSS clipping or hemisphere opacity switch is used. The compact illustrative orbital radius is 1.18 world units; it is not a physical geosynchronous altitude.

The satellite mesh contains 96 vertices (2,304 static vertex-buffer bytes), drawn twelve times using reused uniforms. Changing spin speed preserves the current phase; pausing auto rotation pauses Earth and every orbit together. Hidden pages and reduced motion also stop phase advancement. The Satellites checkbox hides or reveals the constellation at the current shared spin phase. Rendering uses two graphics contexts in total: one COBE context and one satellite context. Missing globe graphics disable the orbital overlay and leave both explorer links available.

Sampling 720 phases over a complete period measured a minimum satellite separation of 25.0078°, latitude range ±60°, and balanced three-dimensional centroid. A separate 48-phase × 600 equal-area ground-direction sample measured a worst nearest-satellite angle of 46.6776° and no sampled line-of-sight gaps for the illustrative 1.18/0.8 orbit/planet radii. This is comparative sampled coverage evidence, not a proof of a mathematical optimum or guaranteed real-world communications coverage.

## Scheduling and resource review

The original globe advanced by a fixed increment per frame and passed pixel dimensions to an API that multiplied by device pixel ratio again. The new code integrates rotation/orbits using delta time, resets timestamps after pauses, passes CSS dimensions, caps DPR at 1.5, and updates dimensions only after a debounced resize. Each globe/overlay backing buffer is capped at two million pixels; at a 720-pixel nominal globe size and device DPR 2, its enlarged rendering stage uses a 1,413-pixel backing width, rather than the original code's reasoned 2,880-pixel width. This is resource accounting, not a measured frame-rate comparison.

The actual globe and satellite rendering viewport is 1.6 times the nominal size and explicitly centered. Their rendering scale is divided by 1.6, preserving the initial apparent Earth size while giving zoomed Earth, atmosphere and satellite geometry room to render. At the maximum visual scale 1.25, the conservative satellite geometry bound is 0.964844 in normalized clip coordinates, below the canvas edge at 1. Actual globe readback found opaque center pixels and zero alpha at every canvas border; satellite readback over 48 phases also found zero border alpha. This directly checks the reported invisible-box clipping defect.

Plasma retains its original equations and bloom while drawing at up to 30 updates per second; star counts and the two background buffers are bounded. Each full-screen buffer is capped at approximately 2.5 million pixels. A single measured slow-cadence adjustment can reduce globe backing resolution to 80%; it does not oscillate quality or change the user's detail controls. Per-frame API updates omit unchanged marker arrays and options.

Page hiding cancels the animation request. Page departure destroys buffers, shaders, programs and textures, loses owned contexts, disconnects the resize observer and releases background buffers. Persisted restoration uses fresh canvases, restores listeners and avoids accumulating COBE wrapper elements. Stale context-loss events from old canvases cannot dispose a restored globe. Reduced-motion settling leaves no animation request pending.

## Browser evidence

The retained reproducible harness is `tests/test_launcher.cjs`. It supports `UOS_SUITE_ROOT`, `UOS_LAUNCHER_OUTPUT`, `PLAYWRIGHT_MODULE` and `GDB_CHROMIUM_PATH`; output defaults to `/tmp/cobe-launcher-checks`. Tests use actual Chromium 149.0.7827.55 and Playwright 1.63.0 with SwiftShader software WebGL on WSL Linux. The normal desktop and emulated-phone captures are in `docs/screenshots`.

Executed checks cover:

- Real dotted-globe initialization, retained defaults and zero external startup requests from `file://`.
- Browser SVG fill geometry, zero sampled overlap, transparent holes, and the alpha coverage figures above.
- Native hit testing at 390×844, 768×1024, 1440×960 and 1920×1080, including 150% CSS zoom; separate actual browser contexts at device scale factors 2 and 3 verified bounded backing buffers.
- Controls changing the globe without adding a context, including maximum zoom. A temporary test-only COBE marker at the same world position agreed with the overlay camera equations within 0.000001 normalized units. No location marker is included in the production globe.
- Actual satellite-fragment readback at a partial back-side limb crossing. Strict interior pixels were fully hidden and outer fragments remained visible. A one-pixel anti-aliased limb band is counted separately. This directly verifies partial occlusion rather than merely inspecting shader text.
- Three departure/restoration cycles with one globe canvas, one orbital canvas and one COBE wrapper after every restore.
- Actual Earth and satellite GPU uniform readback confirmed one common spin phase rather than doubled camera/orbit rotation. Speed changes preserved phase, pausing Earth stopped all satellite positions, reduced motion settled to idle, and the hidden interval submitted zero additional frames.
- Open controls at 320×568, 1440×600 and 568×320. Panel tops were 114/232/122 pixels versus logo bottoms 91.4/209.2/99.6; keyboard-focusing Reset scrolled it into the visible panel in each case.

Raw launcher results are included alongside this review. Audio diagnosis, waveform checks, route/return integration, hosted-subdirectory checks and GDB/Online regressions are recorded in the suite's other validation material.

## Limits

The software-rendered host showed substantial graphics/compositor delays, so this report makes no universal frame-rate claim. Main-thread draw/submission timings and requestAnimationFrame cadence are different measurements; callback intervals collected across user-driven pauses must not be presented as GPU execution time. Physical GPU timestamps, managed Edge, Safari/iOS, real phone touch hardware, speaker output and assistive-technology behavior were not verified here. Mobile screenshots use Chromium viewport/DPR emulation. Hidden-state handler checks use controlled visibility events; actual route/history lifecycle is covered by the integration tests.

## Suite 2.1 additions

Craft mode switches between Satellite and UFO meshes across the same twelve coordinated orbits. Both meshes share one pre-uploaded WebGL buffer and program; switching preserves orbital phase and does not create a second context or render loop. Corner logo and alien/car widths and responsive caps increased by 25%, with artwork allowed to overlap Earth while controls stay above it.

`tests/test_craft_modes.cjs` passed four actual Chromium checks: responsive artwork/hit masks, mode/phase/resource reuse, both meshes with sphere occlusion at maximum globe scale, and control access. Current screenshots: screenshots/ufo-desktop.png and screenshots/ufo-mobile.png.
