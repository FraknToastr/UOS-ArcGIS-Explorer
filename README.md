# UOS ArcGIS Explorer Suite 2.1

Open `index.html` to enter the COBE launcher. Click either neon phrase, or focus it with Tab and press Enter, to open its explorer in the current tab. Both explorers have a return link. The folder is self-contained; it does not need the original delivery beside it. It also works when hosted beneath a subdirectory. Live ArcGIS services require connectivity; the launcher and exported GDB data work locally.

## GDB data

When no file is loaded, GDB Explorer shows a large toolbox graphic with four short instructions for creating a **GDB Explorer File** in ArcGIS Pro. Use **Open GDB Explorer File** to load the result. The name refers to a compatible `.zip` export; existing modular exports and complete exports containing one GDB workspace remain supported. Raw `.gdb` folders are not supported. Imported data stays in the current tab: reopening or navigating away releases it. Replace/Cancel/Clear preserve the input file, and imported HTML and JavaScript never execute.

Alternatively add `toolbox/UOS_Explorer_Suite_v2_1.pyt` to ArcGIS Pro to build an export or merge a compatible existing one. Keep the entire suite folder intact. No extra Python dependencies or administrator installation is required. Run `python scripts/prepare_release.py` after changing runtime source to synchronize the copied toolbox assets and installation manifests. Use only trusted existing exports with the Pro merge tool. Generated exports contain their GDB catalogue and open it automatically.

## Conference Edition toolbox

Add `toolbox/UOS_Explorer_Suite_Conference_Edition.pyt` to ArcGIS Pro to get the **GDB Explorer** toolbox, with tools in this order: **ChatGPT Pyt Factory**, **Create GDB Explorer File**, and **Update GDB Explorer File**. The Factory tool opens `toolbox/ChatGPT_PYT_Factory_Conference_Edition.html` in the default browser when run. Its conference copy omits the complete UOS branding block, attribution and favicon; the supplied `ChatGPT_PYT_Factory.html` remains unchanged.

Keep the original `UOS_Explorer_Suite_v2_1.pyt`, Conference toolbox, Conference HTML and `engine` folder together inside the complete suite folder. The Conference toolbox delegates exporting and updating to the original classes, with unbranded display labels, parameter captions and output filenames. Files retain their `.zip` extension and existing data format; the physical toolbox filenames and original toolbox remain unchanged. Toolbox discovery and opening the Factory tool pane do not launch a browser. Rebuild the conference HTML after updating its source with `node scripts/build_conference_factory.cjs`; `--check` verifies the committed copy. No Node installation is needed to use the toolbox or its prebuilt HTML.

## Launcher controls

Twelve UFOs alternate between equatorial ring and global coverage, holding each for 20 seconds and transitioning for 10: a 60-second cycle. UFO undersides always face Earth. Click the alien/car artwork, or focus it and press Enter/Space, to start the next transition early. The artwork stays visually unchanged during interaction, while custom hover/focus tips remain available. Additional activations during a transition do not queue another change. Pausing rotation, hiding UFOs, dragging the globe or reduced motion pauses formation changes.

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

The GDB catalogue has a compact icon legend above its tree. Dataset rows summarize descendant geometry types and attachment availability. GDB MetroMap uses the documented WMTS service endpoint and reports imagery as loaded only after a raster tile arrives and renders; failed requests and a 15-second timeout remain visible. Basemap changes preserve feature overlays, selection, and camera position.
The launcher and both explorers share custom tips instead of native browser hover titles. Tips clear the pointer by 40 CSS pixels in each direction, flip and clamp inside the viewport, support keyboard focus and Escape, and disappear on pointer exit, blur, scrolling, page departure or removal of the control.

Graph appearance controls sit together in the graph toolbar. Label cards default off, leaving transparent full-size hit areas. Highlight on click defaults on: hover and automatic resource selection keep connectors light; a node click or Enter/Space highlights its direct links, and a background click clears that highlight. Turning this option off restores selection/hover emphasis. UFO undersides continuously point toward Earth's centre while their domes face outward.
