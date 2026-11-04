# UOS ArcGIS Explorer Suite 2.1

Open `index.html` to enter the COBE launcher. Click either neon phrase, or focus it with Tab and press Enter, to open its explorer in the current tab. Both explorers have a return link. The folder is self-contained; it does not need the original delivery beside it. It also works when hosted beneath a subdirectory. Live ArcGIS services require connectivity; the launcher and exported GDB data work locally.

## GDB data

The unconfigured GDB workspace opens without synthetic data. Select a modular GDB Explorer 22.5/22.6/22.7 export ZIP, or an Explorer Suite ZIP containing one compatible GDB workspace. Raw `.gdb` ZIPs are not supported. Browser-imported data is session-only: leaving or reloading GDB releases it; choose the ZIP again when returning. Replace/Cancel/Clear operate without changing the input ZIP. Imported HTML and JavaScript are never used as application code.

Alternatively add `toolbox/UOS_Explorer_Suite_v2_1.pyt` to ArcGIS Pro to build an export or merge a compatible existing one. Keep the entire suite folder intact. No extra Python dependencies or administrator installation is required. Run `python scripts/prepare_release.py` after changing runtime source to synchronize the copied toolbox assets and installation manifests. Use only trusted existing exports with the Pro merge tool. Generated exports contain their GDB catalogue and open it automatically.

## Launcher controls

The compact globe panel changes rotation, tilt, scale, detail, lighting, glow and Satellite/UFO craft; UFOs are selected by default and Reset restores that default. The SID jukebox starts its first playback after an explicit click. Choose Cybernoid II (Jeroen Tel), ACE II (Rob Hubbard), or Last Ninja II — Central Park theme (Matt Gray, subtune 2). Track selection, previous/next, volume, mute/resume and restart control actual locally bundled SID data through a streaming emulator. Leaving the launcher releases its audio and animation resources. If music was active, returning restores the same track and exact emulator position; browsers that block automatic audio show Resume SID. Restart uses the icon in the jukebox button and volume row.

Launcher destinations are defined by `window.UOS_WORKSPACE.destinations.gdb` and `.arcgis` in `launcher/workspace.js`; `launcher/app.js` supplies the same relative defaults for generated exports; both use ordinary relative GDB and Online entry points. Globe settings remain session-only. No ArcGIS tokens are passed to the launcher. Existing Online navigation and GDB metadata, attachment actions, table paging, popup identity, Storage and map controls remain part of their respective applications.

## Maintenance and validation

COBE and the ZIP reader are pinned and bundled locally with licences. Development tests require Node, Playwright and a browser; ordinary users do not. `tests/test_audio.cjs` tests actual synthesized samples and audio lifecycle. Further browser/import/toolbox checks and their limitations are documented in `VALIDATION.md`.

The original launcher PNGs retain their lossless transparency. The two logo hit masks share the logo's intrinsic2170×725 coordinate system and are invisible by default; append `?debugLogo=1` to the launcher URL to inspect outlines during development. It is off by default. The plasma remains procedural and animated. Satellites use synchronized three-dimensional projection and sphere occlusion rather than CSS visibility shortcuts.

No original source or prior delivery files were changed. Esri zoom remains deferred. Online 2.5 opens on Connect, with scoped, multi-type paged searches. Graph map provides All, Branch and First-degree views, plus Dependency, Balanced and Radial layouts. Independent graph and Content visibility controls hide system and auxiliary metadata resources without removing source relationships or field/schema rows.

## Globe and jukebox update

Default globe spin is 0.5 rad/s and map detail is 32,000 samples. Location markers and their control have been removed. Twelve satellites use a coordinated inclined constellation for broad coverage: three orbital planes, four satellites per plane, a shared period synchronized with the displayed globe rotation, and no random per-satellite speeds. This is a compact visualization, not a physical orbital simulator. The globe rendering viewport is 1.6 times wider with compensated visual scale, providing room for enlarged Earth, atmosphere and satellites without clipping.

See docs/SID_JUKEBOX.md for track provenance, subtune selection, emulator licensing and playback tests. Tracks retain their original authorship; they are not presented as royalty-free music.

## Graph layout and presentation

Graph map starts in **V1**, restoring the original Dependency, Balanced, and Radial layouts, curved connectors, Roomy/Balanced/Compact density presets, spacing slider, and fitting up to 2.4×. Choose **V2** for native-size labels/symbols, relationship-based radial sectors, Roomy/Normal/Compact density presets, and rounded connectors that reserve label space even with cards off. Large V2 overviews prioritize endpoint clearance.

Both versions retain all graph controls. Layout choices for each graph view, density, spacing, and auto-fit settings are remembered separately for V1 and V2 during the current session; every fresh page starts in V1. Switching preserves the loaded graph, selection, filters, appearance settings, and colour fixes. It fits automatically when the destination version has auto-fit enabled; otherwise it preserves the current camera. Manual Fit always remains available. Ordinary ArcGIS services that advertise metadata support retain the Service colour; actual System/basemap and Metadata resources use their dedicated legend colours.

## Accessible tips
The launcher and both explorers share custom tips instead of native browser hover titles. Tips clear the pointer by 40 CSS pixels in each direction, flip and clamp inside the viewport, support keyboard focus and Escape, and disappear on pointer exit, blur, scrolling, page departure or removal of the control.

Graph appearance controls sit together in the graph toolbar. Label cards default off, leaving transparent full-size hit areas. Highlight on click defaults on: hover and automatic resource selection keep connectors light; a node click or Enter/Space highlights its direct links, and a background click clears that highlight. Turning this option off restores selection/hover emphasis. UFO undersides continuously point toward Earth's centre while their domes face outward.
