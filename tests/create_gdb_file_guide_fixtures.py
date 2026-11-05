"""Synthetic legacy-format files and a bundled workspace for the guide browser check."""
from pathlib import Path
import json
import shutil
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
feature = {
    "name": "Sample points", "kind": "Feature Class", "geometryType": "Point", "rowCount": 1,
    "attributeColumns": ["OBJECTID", "Name"], "oidFieldName": "OBJECTID",
    "schemaFile": {"path": "data/schema.js"}, "attributePages": [{"path": "data/rows.js", "count": 1}],
}
catalogue = {
    "name": "Existing geodatabase", "path": "C:/Example.gdb", "storageFile": {"path": "data/storage.js"},
    "featureSets": [{"name": "Layers", "kind": "root", "features": [feature]}],
}
wrapped = lambda value: "GDBChunks.receive(document.currentScript," + json.dumps(value) + ");\n"
contents = {
    "data/catalogue.js": "window.GDBCatalogue=" + json.dumps(catalogue) + ";\n",
    "data/schema.js": wrapped({"fields": [{"name": "OBJECTID", "type": "OID"}, {"name": "Name", "type": "String"}]}),
    "data/rows.js": wrapped([[1, "Example"]]),
    "data/storage.js": wrapped({"layers": []}),
}
for version in ("22.5", "22.6", "22.7"):
    with zipfile.ZipFile(output / ("existing-" + version + ".zip"), "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("BUILD_INFO.json", json.dumps({"version": version}))
        for name, content in contents.items():
            archive.writestr(name, content)

packaged = output / "packaged"
shutil.copytree(root / "gdb", packaged / "gdb", dirs_exist_ok=True)
index = packaged / "gdb/index.html"
index.write_text(index.read_text(encoding="utf-8").replace(" data-gdb-import-shell", ""), encoding="utf-8")
for name, content in contents.items():
    destination = packaged / "gdb" / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding="utf-8")
(packaged / "launcher").mkdir(exist_ok=True)
for name in ("tooltips.js", "tooltips.css", "workspace-link.css"):
    shutil.copy2(root / "launcher" / name, packaged / "launcher" / name)
print("Created GDB Explorer File guide fixtures in", output)
