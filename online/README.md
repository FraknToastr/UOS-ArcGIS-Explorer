# ArcGIS Explorer v2.4.1

A standalone HTML application combining the supplied ArcGIS Dependency Graph v1.2 with the U-OS table design and three additional explorers.

## Open the app

1. Extract the ZIP.
2. Open **index.html** in the suite launcher, then choose **ArcGIS Online** (or open **online/index.html**) in a current Edge or Chrome browser.
3. Choose **Data → Load demo** to try all five explorers, or **Data → Connect / Load** to use your ArcGIS content.

No Python toolbox, installation, local server, Node.js or build step is required to run the app. MapLibre GL JS and its stylesheet are bundled in the adjacent vendor folder. Live ArcGIS requests and basemap imagery require an internet connection, and the map requires WebGL support. System fonts are used; no font download is needed.

## The five explorers

| Explorer | What it does |
| --- | --- |
| Content | Expandable, searchable hierarchy of apps, maps, services, layers, tables and fields; owner, modified date, access and child counts; type filtering and name/date sorting. |
| Graph map | Linked node graph, including web map basemaps; pan, zoom, fit, drag nodes, search, filter node types and isolate a branch. Shared services are one graph resource with multiple connections. |
| Schema | Field names, aliases, data types, lengths, nullable/editable flags, defaults, domains, indexes, subtypes and relationships. Selecting a parent shows its descendant layer/table schemas. Export fields as CSV. |
| Metadata | Published item/service/layer properties, descriptions, credits, use constraints, extent and other resource JSON. Load formal XML metadata separately; missing/unpublished metadata is identified explicitly. |
| Spatial | MapLibre map of a selected queryable feature layer, paged feature retrieval, attribute inspection, fit-to-page and GeoJSON export of the current page. |

The shared selection carries between explorers. Choose a row or use the Selection dropdown in any explorer panel header; all five dropdowns stay synchronized. A row's **Schema**, **Metadata** or **Map** button selects the resource and opens that explorer. For mapping, choose **Load selected layer**.

## Layout

The compact header contains the account eyebrow, five explorer tabs, dashboard counts and a single Data menu for connection, demo, import, export and theme actions. The account eyebrow displays the verified ArcGIS username after sign-in and “Not signed in” otherwise.

The main workspace contains only the active explorer panel. Each panel header contains its own synchronized Selection dropdown. The app uses the available browser width and viewport height; tables, metadata, dialogs and side panels scroll internally while the main header and panel controls stay visible. Table column headers stay visible within their scroll area. The header stays on one slim row: 48 pixels high on desktop and 44 pixels on narrow screens. Navigation and dashboard scroll horizontally within that row when space is limited; the title and Data menu remain visible. Counts, colour dots and dashboard labels are inline. Dashboard dots match the Graph map resource colours; Fields uses violet. Graph map side panels are hidden on narrow screens; its selection remains available through the panel selector and Metadata explorer.

Content rows use a saturated dark green for root resources, then progressively lighter greens for each child level. Fields have the lightest background. Selection uses an edge marker while preserving hierarchy colours. Schema and Content field data types use rounded, colour-coded pills. Graph map legend symbols and labels have been enlarged. Graph node categories use separate, vivid colours: orange for Experiences, blue for web maps, violet for web scenes, green for services, pink for layers, yellow for tables, and slate for other resources. Nodes and the legend share the same palette, with dark outlines to keep light colours visible.

## Graph connections and palettes

The **Version V1 / V2** selector switches all three graph layouts. **V1** is selected on every fresh page and restores the original geometry, curved connectors, Roomy/Balanced/Compact density options, spacing, and zoom-fitting behaviour. **V2** keeps labels and symbols at native size when fitting and routes connectors around label areas; its density options are Roomy/Normal/Compact. Both provide Dependency, Balanced, and Radial layouts and all supporting controls. Each version remembers its own layout choices, density, spacing, and auto-fit settings for the session. Selection, filters, label cards, connector highlighting, and colour palettes are shared. Switching to a version with auto-fit disabled preserves the current camera; manual **Fit** always works.

Clicking a Graph map node makes its **direct incoming and outgoing connectors** thicker and fully opaque. Second-degree connectors are lighter; more distant connectors are faint. Direct connectors draw on top, and their thickness remains readable when zooming.

**Isolate first-degree** keeps the selected node, its immediate parents and children, and only the connectors touching that node. It excludes links between neighbours and deeper branches. The node-type filters still apply. To centre isolation on another node, select it and press the button again. **Isolate branch** retains the existing downstream-branch behaviour. **Show all** restores the complete graph view.

Open **Data → Colour palette** to choose **Morning Sun**, **Evening**, **Corporate**, **ArcGIS Online** or **Windows 11**. **Original** restores the previous appearance. These visual presets coordinate interface surfaces, accents, the Content hierarchy ramp, graph nodes, dashboard dots and legend. Light/dark mode remains a separate choice. Changing palettes preserves workspace data and map selection; the palette preference is retained in this browser when local storage is available.

## Expansion levels and panel full screen

The **Level** pill slider replaces Expand all / Collapse all. Choose **1** to show root resources only; choose a higher number to expand every branch through that depth. The last number adapts to the loaded hierarchy and includes field rows. The demo has five levels. Individual row expanders still work; selecting a level resets those manual exceptions. Search automatically reveals matching paths, and choosing a level applies that depth while retaining the filter. Arrow keys and Home/End also change the selected level.

**Full screen** in Spatial and Graph map hides the main application header and lets the panel fill the viewport. Panel controls remain visible. Choose **Exit full screen** or press **Escape** to restore the header. Map and graph dimensions are recalculated when entering or leaving this mode.

## Connect and load

- Public content: paste an Experience URL, ArcGIS item URL/ID, or a REST service/layer URL, then choose **Load / Scan dependencies**.
- Private content: select the portal, choose **Open ArcGIS sign-in**, paste the returned authorization code, and choose **Exchange code**. Alternatively paste an access token and choose **Verify token**. This retains the supplied dependency app's OAuth client and sign-in method.
- **Find portal content** searches accessible items and pages through results. Choose a result, then scan it.
- **Add to current workspace** keeps earlier resources when scanning another root. Without it, scanning replaces the current workspace. A scan from Demo starts a live workspace.
- A scan reads published references; inaccessible items, missing fields and service errors remain visible. It is not an organisation-wide reverse dependency or usage audit. The scan stops at 1,200 resources; narrow the input if needed.

ArcGIS tokens stay in the current tab's memory. They are not saved in browser storage or workspace exports. They are automatically used only for the configured portal host and Esri ArcGIS service hosts. Private Enterprise services on a different custom host may require additional federation/token support and are not covered by this version. Changing portals clears the active token. Each loaded resource retains its originating portal for item links and metadata retrieval.

The inherited OAuth client must permit the portal and authentication flow used. Some organisations disable the out-of-band code flow. CORS, browser origin restrictions or organisation policy can also block requests from a locally opened HTML file. These conditions require configuration outside the app; they were not verified against your organisation.

## Basemaps and MetroMap

- **Esri World Aerial** uses Esri World Imagery.
- **Esri Topography** uses Esri World Topographic Map.
- **MetroMap…** opens a modal for the API key and imagery layer, with `Australia_latest` as the default.
- Leave **Save key in this browser** unchecked to use it only for the current tab. Check it to retain the key in browser local storage. This storage is unencrypted. The key is sent to MetroMap for imagery requests.
- **Remove saved key** clears both the saved key and the active key and switches away from MetroMap if necessary.
- Choose the Esri fallback from the map toolbar. Repeated MetroMap tile errors automatically switch to it. Repeated errors from an Esri basemap trigger one switch to the other Esri basemap. Further errors are reported without a retry loop.

MetroMap API access requires an eligible MetroMap subscription/key. Coverage, entitlements, CORS and network access affect imagery availability. No API key is included.

## Spatial paging

The map draws **one feature page at a time**, using 100, 250 or 500 records per page. It enumerates matching Object IDs, then retrieves each page in batches within service limits. It requests WGS84 geometry and preserves polygon holes and multipart geometry. Attribute lists show up to the first 50 records on a page; all loaded geometries can be clicked on the map. Selecting a feature on the map or in the list gives it a bright magenta highlight with a contrasting halo and marks the attribute inspector. **Zoom to selected feature** is available on the toolbar, in the inspector and in the map popup. Zoom uses the complete geometry from the loaded page. Selection clears when loading another page or layer; **Clear selection** is also available in the selected-feature inspector.

Spatial querying currently supports ordinary queryable FeatureServer/MapServer feature layers. Select a child layer instead of a service root. Non-spatial tables, group layers, scene layers, image services and vector tiles are available for dependency/metadata inspection but are not rendered as operational spatial datasets. Layers that cannot enumerate Object IDs produce an explicit paging error. GeoJSON export includes only the current feature page.

## Keep a workspace

Use **Data → Export workspace JSON** to manually save scanned resources and their schema/metadata snapshot. Use **Data → Import workspace JSON** to reopen it. The earlier dependency graph JSON format is also accepted. Feature pages and ArcGIS tokens are not stored in workspace JSON. Imported private content requires a new sign-in to retrieve current features or formal metadata. There is no automatic workspace save; export before closing the tab if you want to retain it.

Demo includes seven synthetic resources, three polygon precincts and 620 synthetic tree points near Adelaide. It does not represent council records. The tree layer allows testing multiple feature pages.

## Verification

See **VALIDATION.md** for checks and limits. Optional developer tests can be run with Node.js 18 or later:

```text
node tests/app.test.cjs
```

Node.js is needed only for these optional tests, not for using the app.

## Technical references

- [MapLibre raster basemaps](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-satellite-map/)
- [MetroMap WMTS](https://docs.metromap.com.au/docs/ogc-wmts)
- [Esri feature queries](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/)
- [Esri metadata](https://developers.arcgis.com/rest/services-reference/enterprise/metadata/)
- [Esri item metadata reference](https://developers.arcgis.com/rest/users-groups-and-items/metadata-reference/)

MapLibre GL JS 5.6.2 is bundled under its BSD licence. See **THIRD_PARTY_NOTICES.txt**. Basemap attribution remains visible on the map.

## Suite v1.1 maintenance update

Version 2.4.1 restricts bearer-token destinations to trusted HTTPS origins, rejects stale authentication/search results, and extends exported-metadata credential scrubbing. Navigation, palettes, Spatial and the deferred Esri zoom behavior remain unchanged. See ../../review/online-findings.md for reproduction evidence and limits.
