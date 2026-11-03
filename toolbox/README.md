# ArcGIS Pro toolbox

Add `UOS_Explorer_Suite_v2_1.pyt` to ArcGIS Pro. Keep the complete `explorer-suite-v2` folder together: this toolbox validates and packages the launcher, assets, vendor libraries and Online workspace from its parent folder. No Python packages, administrator installation or BAT files are needed.

**Build U·OS Explorer Suite v2.1** exports the selected geodatabase into `gdb/` with GDB Explorer v22.7 and includes the root COBE launcher and Online Explorer 2.5. Extract the generated ZIP and open its `index.html`. Exported GDB pages load the generated catalogue automatically; the separately distributed browser import page remains an import shell.

**Merge Existing GDB Explorer ZIP** accepts complete modular v22.5, v22.6 and v22.7 app exports. It refreshes compatible UI/runtime files, preserves the original data and MapLibre files, and leaves the source ZIP unchanged. It rejects unsafe archive paths, duplicate aliases, incomplete exports and unsupported data contracts. Choose a destination different from the source.

The default output is beside this toolbox. Existing custom output paths remain supported. Output replacement is atomic and failures preserve an existing output. Tokens are never part of the launcher configuration; Online authentication remains confined to its workspace.

`engine/gdb_explorer_assets/asset-manifest.json` validates GDB runtime assets. The parent `suite-manifest.json` validates every packaged launcher/Online dependency before an export starts. If validation fails, extract the complete release into a clean directory instead of mixing files from different versions.

Developer checks use a synthetic ArcPy adapter in `../tests/test_toolbox_fixtures.py`; this does not substitute for executing an export in a licensed ArcGIS Pro environment.
