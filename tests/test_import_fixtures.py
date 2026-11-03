"""Create adversarial developer fixtures from a supplied synthetic modular export.

python test_import_fixtures.py /tmp/fixture.zip /tmp/import-fixtures
No fixture is copied into production assets.
"""
from pathlib import Path
import json
import hashlib
import struct
import sys
import zipfile

source, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(source) as archive:
    original = {info.filename: archive.read(info) for info in archive.infolist() if not info.is_dir()}

def write(name, entries, method=zipfile.ZIP_DEFLATED):
    target = output / (name + ".zip")
    with zipfile.ZipFile(target, "w", method) as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return target

def mutate_catalogue(callback):
    entries = dict(original)
    raw = entries["data/catalogue.js"].decode()
    data = json.loads(raw[len("window.GDBCatalogue="):-2])
    callback(data)
    entries["data/catalogue.js"] = ("window.GDBCatalogue=" + json.dumps(data, separators=(",", ":")) + ";\n").encode()
    return entries

write("valid", original)
write("wrapped-suite", {"OneFolder/gdb/" + path: data for path, data in original.items()})
write("malicious-runtime", dict(original, **{"js/core.js": b"window.__IMPORT_EXECUTED__=true;throw Error('imported runtime executed')"}))
write("javascript-catalogue", dict(original, **{"data/catalogue.js": original["data/catalogue.js"] + b"window.__IMPORT_EXECUTED__=true;"}))
write("wrong-version", dict(original, **{"BUILD_INFO.json": b'{"version":"21.0"}'}))
write("raw-geodatabase", {"Source.gdb/a.gdbtable": b"not a browser export"})
write("missing-reference", mutate_catalogue(lambda data: data["featureSets"][0]["features"][0].update(schemaFile={"path": "data/missing.js"})))
write("invalid-count", mutate_catalogue(lambda data: data["featureSets"][0]["features"][0].update(rowCount={"toString": 0, "valueOf": 0})))
write("deep-source-path", mutate_catalogue(lambda data: data["featureSets"][0].update(path=data["path"] + "/" + "/".join(["nested"] * 100), kind="featureDataset")))
write("two-catalogues", dict(original, **{"nested/data/catalogue.js": original["data/catalogue.js"]}))
for label, name in [("drive-path", "C:/escape.txt"), ("dot-alias", "data/./extra.js"), ("case-alias", "JS/CORE.JS"), ("backslash", "data\\escape.js"), ("device", "data/CON.txt")]:
    write(label, dict(original, **{name: b"invalid"}))

def patch_size(name, member, size):
    target = write(name, original)
    blob = bytearray(target.read_bytes())
    offset = 0
    while True:
        offset = blob.find(b"PK\x01\x02", offset)
        if offset < 0:
            raise AssertionError("central entry not found")
        length = struct.unpack_from("<H", blob, offset + 28)[0]
        if blob[offset + 46: offset + 46 + length].decode() == member:
            struct.pack_into("<I", blob, offset + 24, size)
            break
        offset += 4
    target.write_bytes(blob)

catalogue = json.loads(original["data/catalogue.js"].decode()[len("window.GDBCatalogue="):-2])
item = catalogue["featureSets"][0]["features"][0]
patch_size("catalogue-limit", "data/catalogue.js", 32 * 1024 * 1024 + 1)
patch_size("chunk-limit", item["schemaFile"]["path"], 128 * 1024 * 1024 + 1)
attachment_page = original[item["attachmentPages"][0]["path"]].decode()
first_attachment = json.loads(attachment_page[len("GDBChunks.receive(document.currentScript,"):-3])[0]
(output / "expected-attachment.json").write_text(json.dumps({"sha256": hashlib.sha256(original[first_attachment["dataUrl"]]).hexdigest()}))
patch_size("attachment-limit", first_attachment["dataUrl"], 256 * 1024 * 1024 + 1)
target = write("bad-crc", original, zipfile.ZIP_STORED)
blob = bytearray(target.read_bytes())
with zipfile.ZipFile(target) as archive:
    info = archive.getinfo("data/catalogue.js")
    start = info.header_offset + 30 + len(info.filename.encode()) + len(info.extra)
    blob[start + original["data/catalogue.js"].index(b"Fixture")] ^= 1
target.write_bytes(blob)

# A high compression ratio page exercises the worker inflater and bounded inline fallback.
entries = dict(original)
first_page = item["attributePages"][0]["path"]
rows = [[i + 1, "A" * 65536] + [None] * (len(item["attributeColumns"]) - 2) for i in range(150)]
entries[first_page] = ("GDBChunks.receive(document.currentScript," + json.dumps(rows, separators=(",", ":")) + ");\n").encode()
write("large-page", entries)
if "--entry-limit" in sys.argv:
    with zipfile.ZipFile(output / "entry-limit.zip", "w", zipfile.ZIP_STORED) as archive:
        for name, data in original.items():
            archive.writestr(name, data)
        for number in range(200000):
            archive.writestr("extras/" + str(number) + ".bin", b"")
print("Created", len(list(output.glob("*.zip"))), "import fixtures in", output)
