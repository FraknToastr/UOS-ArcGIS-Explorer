# Validation — ArcGIS Explorer v2.4.1

## Reproduced in this review

All39 Node functional checks passed against the split application source:32 supplied checks plus seven new authentication/search/credential-scrub regressions. These execute a DOM/MapLibre adapter and controlled fetch responses. They cover shared selection, Content/Schema/Metadata, hierarchy filtering/expansion, graph cycles/isolation/palettes, geometry conversion, feature paging/stale responses, import preservation, basemap/key logic and credential behavior. Public Esri schema/geometry fixtures are supplied test data; the earlier release network-smoke claim was not rerun against live Esri here.

Real Chromium checks from clean delivery extraction exercised launcher-to-Online navigation, demo content population and return navigation. The GDB-only tree replacement does not change Online navigation. The launcher remixer was separately exercised with real software WebGPU/WebGL/Canvas; those results do not establish Online map rendering or private sign-in.

The app uses separate index.html, styles.css, js/app.js and bundled vendor files; no CDN or installation is required to open it. Live content and basemaps require connectivity. Suite1.1 manifests validate these files before building/merging an output.

## Remaining acceptance checks

Live private OAuth/token sign-in, authenticated MetroMap entitlement/coverage, published XML metadata retrieval, live CORS/network policy, target managed Windows browsers and physical GPU performance remain unverified. Map and authentication logic adapters are not substitutes for those checks. Test on the work laptop with known public/private content and the intended basemap/key.

See ../../review/online-findings.md for reproduced defect triggers and exact source references; ../../review/AUDIT.md and ../../review/RELEASE_CHECKS.md for complete evidence, measurements and limitations. Current clean-install results are packaged under ../../review/.
