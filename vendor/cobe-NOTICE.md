# COBE dependency

COBE 2.0.1, MIT, by shuding and contributors. The accompanying `cobe-LICENSE.txt` preserves the upstream license. The pinned package was obtained from `https://registry.npmjs.org/cobe/-/cobe-2.0.1.tgz`.

`cobe-2.0.1.js` contains upstream `dist/index.esm.js` with two explicit adaptations:

1. An IIFE and `window.createGlobe` replace the ESM export, allowing ordinary classic-script loading from `file://` without a CDN or module loader. The globe shader, embedded map texture and documented API remain upstream code.
2. `destroy()` additionally clears the map image's `onload` callback and deletes its owned map texture. Upstream 2.0.1 deletes buffers and programs but omits that texture; clearing the callback also prevents a late image completion from uploading to a disposed renderer.

The satellite renderer in `launcher/satellites.js` is original application code, separate from COBE. Its orthographic camera transform and 0.8 world-space globe radius follow the pinned COBE marker shader. It draws actual inclined orbital geometry and performs per-fragment sphere-depth occlusion. It does not copy the website showcase's emoji/CSS-anchor presentation or rely on its center-based marker visibility.

Reference material consulted: [COBE documentation and Satellites showcase](https://cobe.vercel.app/), [upstream implementation](https://github.com/shuding/cobe), including `website/app/page.tsx` and the distributed marker shaders. COBE's `markerElevation`, IDs and CSS anchoring support raised location markers; the separate overlay provides continuous orbits and partial silhouette occlusion without modifying the globe shader.
