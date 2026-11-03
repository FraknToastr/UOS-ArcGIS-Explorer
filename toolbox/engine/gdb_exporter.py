# -*- coding: utf-8 -*-
"""
GDB Static Catalogue + Attachment Viewer
ArcGIS Pro Python Toolbox

Creates a modular offline GDB Explorer ZIP. Keep gdb_explorer_assets beside this PYT.
Application revision: 22.7 (paged attributes for every exported map feature).

Hierarchy:
    Feature Dataset
        -> Feature Class / Table
            -> Layer Overview
            -> Schema
            -> Attributes
                -> Top 10 values per supported field
            -> Attachments
                -> Offline attachment gallery/viewer
"""

import arcpy
import os
import json
import html
import datetime
import zipfile
import tempfile
import sqlite3
import mimetypes
import uuid
import math
import hashlib
from collections import Counter
from contextlib import closing

ATTACH_TABLE_SUFFIX = "__ATTACH"
ATTACH_REL_SUFFIX = "__ATTACHREL"
APP_VERSION = "22.7"
REQUIRED_APP_ASSETS = (
    "index.html", "styles.css", "js/bootstrap.js", "js/runtime.js", "js/core.js",
    "js/tables.js", "js/attachments.js", "js/metadata.js", "js/spatial.js",
    "js/storage.js", "js/archive.js", "js/import.js", "vendor/zip-2.24.0.min.js",
    "vendor/maplibre.js", "vendor/maplibre.css"
)


class Toolbox(object):
    def __init__(self):
        self.label = "GDB Explorer v" + APP_VERSION
        self.alias = "gdb_static_catalogue"
        self.tools = [BuildGDBStaticCatalogue]


class BuildGDBStaticCatalogue(object):
    def __init__(self):
        self.label = "Build GDB Explorer v" + APP_VERSION
        self.description = (
            "Creates an offline ZIP app with separate source files, lazy data loading, "
            "top-10 field values and an offline ArcGIS attachment viewer."
        )
        self.canRunInBackground = False

    def getParameterInfo(self):
        p0 = arcpy.Parameter(
            displayName="Input Geodatabase",
            name="input_gdb",
            datatype="DEWorkspace",
            parameterType="Required",
            direction="Input"
        )
        p0.filter.list = ["Local Database", "Remote Database"]

        p1 = arcpy.Parameter(
            displayName="Output App ZIP",
            name="output_zip",
            datatype="DEFile",
            parameterType="Required",
            direction="Output"
        )
        p1.filter.list = ["zip"]
        p1.value = self._default_output_path(None)
        self._last_default_output = str(p1.value)

        p2 = arcpy.Parameter(
            displayName="Include standalone tables",
            name="include_tables",
            datatype="GPBoolean",
            parameterType="Optional",
            direction="Input"
        )
        p2.value = True

        p3 = arcpy.Parameter(
            displayName="Calculate top 10 values",
            name="calculate_top_values",
            datatype="GPBoolean",
            parameterType="Optional",
            direction="Input"
        )
        p3.value = True

        p4 = arcpy.Parameter(
            displayName="Include system fields in top 10 analysis",
            name="include_system_fields",
            datatype="GPBoolean",
            parameterType="Optional",
            direction="Input"
        )
        p4.value = False

        p5 = arcpy.Parameter(
            displayName="Include attachment viewer",
            name="include_attachment_viewer",
            datatype="GPBoolean",
            parameterType="Optional",
            direction="Input"
        )
        p5.value = True

        p6 = arcpy.Parameter(
            displayName="Maximum individual attachment size to include (MB, 0 = unlimited)",
            name="max_attachment_mb",
            datatype="GPDouble",
            parameterType="Optional",
            direction="Input"
        )
        p6.value = 25.0

        p7 = arcpy.Parameter(
            displayName="Page title",
            name="page_title",
            datatype="GPString",
            parameterType="Optional",
            direction="Input"
        )
        p7.value = "GDB Explorer"

        p8 = arcpy.Parameter(
            displayName="Maximum attribute table rows per layer (0 = unlimited; map details preserved)",
            name="max_attribute_rows",
            datatype="GPLong",
            parameterType="Optional",
            direction="Input"
        )
        p8.value = 5000

        p9 = arcpy.Parameter(displayName="Maximum spatial features per layer (0 = unlimited)", name="max_spatial_features", datatype="GPLong", parameterType="Optional", direction="Input")
        p9.value = 10000
        p10 = arcpy.Parameter(displayName="Maximum spatial vertices per layer (0 = unlimited)", name="max_spatial_vertices", datatype="GPLong", parameterType="Optional", direction="Input")
        p10.value = 250000
        return [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]

    def isLicensed(self):
        return True

    def _default_output_path(self, input_gdb):
        """Suggest a ZIP beside this toolbox; retain user-chosen output paths."""
        name = str(input_gdb or "Geodatabase").rstrip("\\/").replace("\\", "/").rsplit("/", 1)[-1]
        stem, extension = os.path.splitext(name)
        if extension.lower() in {".gdb", ".sde", ".geodatabase"}:
            name = stem
        name = "".join("_" if character in '<>:"/\\|?*' else character for character in name).rstrip(" .") or "Geodatabase"
        filename = "{}_{}_GDB_Explorer.zip".format(name, datetime.date.today().strftime("%d_%m_%Y"))
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

    def updateParameters(self, parameters):
        current = parameters[1].valueAsText
        previous = getattr(self, "_last_default_output", None)
        if not current or current == previous:
            suggested = self._default_output_path(parameters[0].valueAsText)
            parameters[1].value = suggested
            self._last_default_output = suggested

    def updateMessages(self, parameters):
        output_zip = parameters[1].valueAsText
        if output_zip and os.path.splitext(output_zip)[1].lower() != ".zip":
            parameters[1].setErrorMessage("Output must be a .zip file.")
        if parameters[6].value is not None and float(parameters[6].value) < 0:
            parameters[6].setErrorMessage("Maximum attachment size must be 0 (unlimited) or greater.")
        if parameters[8].value is not None and int(parameters[8].value) < 0:
            parameters[8].setErrorMessage("Maximum attribute rows must be 0 (unlimited) or greater.")

        for index in (9, 10):
            if parameters[index].value is not None and int(parameters[index].value) < 0:
                parameters[index].setErrorMessage("Spatial limits must be 0 (unlimited) or greater.")

    def execute(self, parameters, messages):
        arcpy.AddMessage("GDB Explorer v{} starting: {}".format(APP_VERSION, os.path.abspath(__file__)))
        input_gdb = parameters[0].valueAsText
        output_zip = parameters[1].valueAsText or self._default_output_path(input_gdb)
        include_tables = bool(parameters[2].value)
        calculate_top_values = bool(parameters[3].value)
        include_system_fields = bool(parameters[4].value)
        include_attachment_viewer = bool(parameters[5].value)
        self._include_attachment_viewer = include_attachment_viewer
        max_attachment_mb = float(parameters[6].value or 0)
        page_title = parameters[7].valueAsText or "GDB Explorer"
        max_attribute_rows = int(parameters[8].value or 0)

        self._max_spatial_features = int(parameters[9].value or 0)
        self._max_spatial_vertices = int(parameters[10].value or 0)
        output_zip = os.path.abspath(output_zip)
        if not output_zip.lower().endswith(".zip"):
            raise ValueError("Output must be a .zip file.")
        self._assets = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gdb_explorer_assets")
        self._validate_app_assets()
        if os.path.exists(output_zip) and not arcpy.env.overwriteOutput:
            raise RuntimeError("Output ZIP already exists. Choose another name or enable overwrite outputs.")
        os.makedirs(os.path.dirname(output_zip), exist_ok=True)
        fd, pending = tempfile.mkstemp(prefix="gdb-explorer-", suffix=".zip", dir=os.path.dirname(output_zip))
        os.close(fd)
        self._serial = 0
        try:
            with tempfile.TemporaryDirectory(prefix="gdb-explorer-work-") as work_dir:
                self._work_dir = work_dir
                with zipfile.ZipFile(pending, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
                    self._archive = archive
                    self._copy_app_sources(page_title)
                    arcpy.AddMessage("Reading geodatabase; streaming data into ZIP...")
                    catalogue = self._scan_geodatabase(
                        input_gdb, include_tables, calculate_top_values,
                        include_system_fields, include_attachment_viewer,
                        max_attachment_mb, max_attribute_rows
                    )
                    catalogue.pop("metadataItems", None)
                    catalogue["metadataFile"] = self._chunk("data/metadata-gdb.js", catalogue.pop("metadata", {}))
                    for i, group in enumerate(catalogue["featureSets"]):
                        group["metadataFile"] = self._chunk("data/metadata-group-{}.js".format(i), group.pop("metadata", {})) if group["kind"] == "featureDataset" else catalogue["metadataFile"]
                    catalogue["storageFile"] = self._chunk("data/storage.js", self._build_storage(catalogue, input_gdb))
                    text = self._json(catalogue)
                    self._archive.writestr("data/catalogue.js", "window.GDBCatalogue=" + text + ";\n")
                    self._archive.writestr("README.txt", APP_README)
                    self._archive.writestr("BUILD_INFO.json", self._json({"version":APP_VERSION, "attributeRowLimit":max_attribute_rows, "spatialFeatureLimit":self._max_spatial_features, "spatialVertexLimit":self._max_spatial_vertices, "geometrySimplified":False}))
            os.replace(pending, output_zip)
        finally:
            self._archive = None
            if os.path.exists(pending):
                os.remove(pending)
        size_mb = os.path.getsize(output_zip) / (1024.0 * 1024.0)
        arcpy.AddMessage("GDB Explorer ZIP created: {} ({:.2f} MB). Extract all files, then open index.html.".format(output_zip, size_mb))
        parameters[1].value = output_zip

    def _validate_app_assets(self):
        """Reject incomplete/mixed installations before touching any output ZIP."""
        missing = [name for name in REQUIRED_APP_ASSETS if not os.path.isfile(os.path.join(self._assets, *name.split("/")))]
        if missing:
            raise RuntimeError("GDB Explorer v{} installation is incomplete. Missing app files: {}. Extract the complete suite v2.0 installation ZIP and keep toolbox/engine/gdb_explorer_assets beside gdb_exporter.py.".format(APP_VERSION, ", ".join(missing)))
        try:
            with open(os.path.join(self._assets, "asset-manifest.json"), encoding="utf-8") as source:
                manifest = json.load(source)
        except (OSError, ValueError) as ex:
            raise RuntimeError("GDB Explorer v{} asset manifest is missing or unreadable. Extract the complete installation ZIP. {}".format(APP_VERSION, ex)) from ex
        if manifest.get("version") != APP_VERSION:
            raise RuntimeError("GDB Explorer toolbox and app assets have different versions. Use the complete v{} installation together.".format(APP_VERSION))
        mismatched = []
        for name in REQUIRED_APP_ASSETS:
            digest = hashlib.sha256()
            with open(os.path.join(self._assets, *name.split("/")), "rb") as source:
                for chunk in iter(lambda: source.read(65536), b""):
                    digest.update(chunk)
            if manifest.get("sha256", {}).get(name) != digest.hexdigest():
                mismatched.append(name)
        if mismatched:
            raise RuntimeError("GDB Explorer v{} app files do not match this release: {}. Extract the complete v{} installation ZIP.".format(APP_VERSION, ", ".join(mismatched), APP_VERSION))

    def _json(self, value):
        return json.dumps(self._sanitize_json(value), ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    def _chunk(self, path, value):
        text = "GDBChunks.receive(document.currentScript," + self._json(value) + ");\n"
        self._archive.writestr(path, text)
        return {"path": path, "bytes": len(text.encode("utf-8"))}

    def _copy_app_sources(self, page_title):
        for root, dirs, files in os.walk(self._assets):
            dirs.sort()
            for name in sorted(files):
                path = os.path.join(root, name)
                relative = os.path.relpath(path, self._assets).replace(os.sep, "/")
                if relative == "asset-manifest.json":
                    continue  # This manifest validates installed exporter sources, not output data.
                if relative == "index.html":
                    with open(path, encoding="utf-8") as source:
                        page = source.read().replace("__TITLE__", html.escape(page_title))
                        self._archive.writestr(relative, page.replace(" data-gdb-import-shell", ""))
                else:
                    self._archive.write(path, relative)

    def _store_dataset(self, dataset):
        key = "data/layer-{:06d}".format(self._current_layer_serial)
        dataset["metadataFile"] = self._chunk(key + "-metadata.js", dataset.pop("metadata", {}))
        fields = dataset.pop("fields")
        dataset["fieldCount"] = len(fields)
        dataset["searchText"] = " ".join(str(f.get("name", "")) + " " + str(f.get("alias", "")) for f in fields)
        analytics = {f["name"]: {"topValues":f.pop("topValues", []), "topValuesStatus":f.pop("topValuesStatus", "")} for f in fields}
        dataset["schemaFile"] = self._chunk(key + "-schema.js", {"fields":fields})
        dataset["analyticsFile"] = self._chunk(key + "-analytics.js", analytics)
        geometry = dataset.pop("spatialGeoJSON", None)
        dataset["geometryFile"] = self._chunk(key + "-geometry.js", geometry) if geometry else None
        spatial_index = dataset.pop("_spatialAttributeIndex", {})
        dataset["spatialAttributeIndexFile"] = self._chunk(key + "-spatial-attribute-index.js", spatial_index) if spatial_index else None
        dataset["geometrySummary"] = {"count":len(geometry["features"]), "truncated":geometry.get("truncated", False), "reason":geometry.get("limitReason", "")} if geometry else None
        attachments = dataset.pop("attachments", [])
        if dataset.get("attachmentSummary", {}).get("available") and not dataset["attachmentSummary"].get("error"):
            dataset["storage"]["attachments"] = self._summarize_attachment_storage(attachments)
        dataset["attachmentPages"] = [self._chunk(key + "-attachments-{:06d}.js".format(i // 40), attachments[i:i+40]) for i in range(0, len(attachments), 40)]
        # Per-feature indexes let map clicks read only that feature's attachments.
        by_parent = {}
        for attachment in attachments:
            by_parent.setdefault(self._normalize_relation_key(attachment.get("parentKey")), []).append(attachment)
        parent_index = {}
        for i, (parent, items) in enumerate(by_parent.items()):
            ref = self._chunk(key + "-parent-{}.js".format(i), items[:40])
            ref["count"] = len(items)
            parent_index[parent] = ref
        dataset["attachmentParentIndexFile"] = self._chunk(key + "-attachment-parents.js", parent_index) if parent_index else None
        return dataset

    def _reported_size(self, desc):
        """ArcGIS reports size for some dataset types/providers. Unknown is never zero."""
        try:
            value = getattr(desc, "size", None)
            if isinstance(value, bool) or value is None:
                return None
            number = float(value)
            return int(number) if math.isfinite(number) and number >= 0 else None
        except (TypeError, ValueError, OverflowError, AttributeError, RuntimeError):
            return None

    def _disk_storage(self, input_gdb):
        """Stat local database files once; never read their content or follow links."""
        result = {"bytes": None, "files": 0, "partial": False}
        path = os.path.abspath(input_gdb)
        if not path.lower().endswith((".gdb", ".geodatabase")):
            return result  # A .sde connection file is not the database's storage.
        if os.path.isfile(path):
            try:
                result.update(bytes=os.stat(path).st_size, files=1)
            except OSError:
                result["partial"] = True
            return result
        if not os.path.isdir(path):
            return result
        total, count, pending = 0, 0, [path]
        while pending:
            try:
                with os.scandir(pending.pop()) as entries:
                    for entry in entries:
                        try:
                            if entry.is_symlink() or entry.name.lower().endswith(".lock"):
                                continue
                            if entry.is_dir(follow_symlinks=False):
                                pending.append(entry.path)
                            elif entry.is_file(follow_symlinks=False):
                                total += entry.stat(follow_symlinks=False).st_size
                                count += 1
                        except OSError:
                            result["partial"] = True
            except OSError:
                result["partial"] = True
        result.update(bytes=total if count or not result["partial"] else None, files=count)
        return result

    def _summarize_attachment_storage(self, attachments):
        types, largest, total, count = {}, [], 0, 0
        for item in attachments:
            count += 1
            size = item.get("sizeBytes")
            if size is None:
                continue
            size = max(0, int(size))
            total += size
            mime = str(item.get("contentType") or "application/octet-stream").lower()
            category = "Images" if mime.startswith("image/") else "Video" if mime.startswith("video/") else "Audio" if mime.startswith("audio/") else "PDF" if mime == "application/pdf" else "Other"
            types[category] = types.get(category, 0) + size
            largest.append({"name": str(item.get("name") or "Unnamed attachment"), "bytes": size})
            largest.sort(key=lambda row: row["bytes"], reverse=True)
            del largest[8:]
        return {"bytes": total, "count": count, "types": types, "largest": largest, "known": True}

    def _attachment_storage_without_blobs(self, attach_path):
        """Storage analysis still works when attachment export is disabled."""
        try:
            fields = {field.name.upper(): field.name for field in arcpy.ListFields(attach_path)}
            if "ATT_SIZE" not in fields:
                return {"known": False}
            names = [fields[key] for key in ("ATT_SIZE", "ATT_NAME", "CONTENT_TYPE") if key in fields]
            def records(cursor):
                for row in cursor:
                    record = dict(zip(names, row))
                    value = record.get(fields["ATT_SIZE"])
                    if value is None or not math.isfinite(float(value)) or float(value) < 0:
                        raise ValueError("Invalid attachment size")
                    yield {"sizeBytes": int(value), "name": record.get(fields.get("ATT_NAME")), "contentType": record.get(fields.get("CONTENT_TYPE"))}
            with arcpy.da.SearchCursor(attach_path, names) as cursor:
                return self._summarize_attachment_storage(records(cursor))
        except Exception:
            return {"known": False}

    def _build_storage(self, catalogue, input_gdb):
        layers = []
        for si, group in enumerate(catalogue["featureSets"]):
            for fi, feature in enumerate(group["features"]):
                storage = feature.pop("storage", {})
                storage.update(id="layer-{}-{}".format(si, fi), name=feature["name"], group=si, kind=feature["kind"])
                layers.append(storage)
        return {"disk": self._disk_storage(input_gdb), "groups": [g["name"] for g in catalogue["featureSets"]], "layers": layers}

    def _read_metadata(self, item_path):
        """Read ArcGIS metadata defensively and return JSON-safe plain values."""
        result = {
            "title": "",
            "tags": [],
            "summary": "",
            "description": "",
            "credits": "",
            "accessConstraints": "",
            "hasMetadata": False
        }
        try:
            md = arcpy.metadata.Metadata(item_path)
            title = getattr(md, "title", "") or ""
            tags = getattr(md, "tags", "") or ""
            summary = getattr(md, "summary", "") or ""
            description = getattr(md, "description", "") or ""
            credits = getattr(md, "credits", "") or ""
            constraints = getattr(md, "accessConstraints", "") or ""

            if isinstance(tags, str):
                tags = [x.strip() for x in tags.split(",") if x.strip()]
            elif tags is None:
                tags = []
            else:
                tags = [str(x).strip() for x in tags if str(x).strip()]

            result.update({
                "title": str(title),
                "tags": tags,
                "summary": str(summary),
                "description": str(description),
                "credits": str(credits),
                "accessConstraints": str(constraints),
            })
            result["hasMetadata"] = any([
                result["title"], result["tags"], result["summary"],
                result["description"], result["credits"],
                result["accessConstraints"]
            ])
        except Exception as ex:
            result["error"] = str(ex)
        return result

    def _sanitize_json(self, value):
        """Recursively eliminate values that make JSON.parse fail in browsers."""
        if value is None or isinstance(value, (str, bool, int)):
            return value
        if isinstance(value, float):
            return value if math.isfinite(value) else None
        if isinstance(value, (datetime.datetime, datetime.date)):
            return value.isoformat()
        if isinstance(value, dict):
            return {
                str(k): self._sanitize_json(v)
                for k, v in value.items()
            }
        if isinstance(value, (list, tuple, set)):
            return [self._sanitize_json(v) for v in value]
        return str(value)

    def _scan_geodatabase(self, input_gdb, include_tables, calculate_top_values,
                          include_system_fields, include_attachment_viewer,
                          max_attachment_mb, max_attribute_rows):
        desc = arcpy.Describe(input_gdb)
        root_metadata = self._read_metadata(input_gdb)

        root = {
            "name": os.path.basename(input_gdb.rstrip("\\/")),
            "path": input_gdb,
            "workspaceType": getattr(desc, "workspaceType", None),
            "workspaceFactoryProgID": getattr(desc, "workspaceFactoryProgID", None),
            "generated": datetime.datetime.now().isoformat(timespec="seconds"),
            "metadata": root_metadata,
            "featureSets": [],
            "diagnostics": {
                "discoveryMethod": "",
                "discoveredFeatureClasses": 0,
                "discoveredTables": 0,
                "warnings": []
            }
        }

        old_workspace = arcpy.env.workspace
        discovered = []
        feature_dataset_paths = {}

        try:
            # Primary discovery: arcpy.da.Walk is materially more robust across
            # file, enterprise and less-common geodatabase structures.
            try:
                for dirpath, dirnames, filenames in arcpy.da.Walk(
                    input_gdb,
                    datatype=["FeatureClass", "Table"]
                ):
                    if os.path.normcase(os.path.normpath(dirpath)) != os.path.normcase(os.path.normpath(input_gdb)):
                        directory_desc = arcpy.Describe(dirpath)
                        if str(getattr(directory_desc, "datasetType", "") or getattr(directory_desc, "dataType", "")).lower() == "featuredataset":
                            feature_dataset_paths[os.path.normcase(os.path.normpath(dirpath))] = dirpath
                    for item_name in filenames:
                        item_path = os.path.join(dirpath, item_name)
                        try:
                            item_desc = arcpy.Describe(item_path)
                            shape_type = getattr(item_desc, "shapeType", None)
                            data_type = str(getattr(item_desc, "dataType", "") or "")
                            is_fc = bool(shape_type) or data_type.lower() == "featureclass"
                            kind = "Feature Class" if is_fc else "Table"
                            discovered.append({
                                "dirpath": dirpath,
                                "name": item_name,
                                "path": item_path,
                                "kind": kind
                            })
                        except Exception as ex:
                            msg = "Could not describe discovered item {}: {}".format(
                                item_path, ex
                            )
                            root["diagnostics"]["warnings"].append(msg)
                            arcpy.AddWarning(msg)

                root["diagnostics"]["discoveryMethod"] = "arcpy.da.Walk"
            except Exception as ex:
                # A generator can fail after yielding part of the workspace.
                # Do not silently treat that partial catalogue as a full scan.
                discovered.clear()
                feature_dataset_paths.clear()
                root["diagnostics"]["warnings"].append(
                    "arcpy.da.Walk failed; using List* fallback: {}".format(ex)
                )
                arcpy.AddWarning(
                    "arcpy.da.Walk discovery failed; using List* fallback: {}".format(ex)
                )

            # Fallback for ArcGIS environments where Walk returns nothing or
            # behaves differently for a particular workspace provider.
            if not discovered and not feature_dataset_paths:
                root["diagnostics"]["discoveryMethod"] = "ListFeatureClasses/ListDatasets fallback"
                arcpy.env.workspace = input_gdb

                for fc in arcpy.ListFeatureClasses() or []:
                    discovered.append({
                        "dirpath": input_gdb,
                        "name": fc,
                        "path": os.path.join(input_gdb, fc),
                        "kind": "Feature Class"
                    })

                for table in arcpy.ListTables() or []:
                    discovered.append({
                        "dirpath": input_gdb,
                        "name": table,
                        "path": os.path.join(input_gdb, table),
                        "kind": "Table"
                    })

                for dataset_name in arcpy.ListDatasets(feature_type="Feature") or []:
                    dataset_path = os.path.join(input_gdb, dataset_name)
                    feature_dataset_paths[os.path.normcase(os.path.normpath(dataset_path))] = dataset_path
                    arcpy.env.workspace = dataset_path
                    for fc in arcpy.ListFeatureClasses() or []:
                        discovered.append({
                            "dirpath": dataset_path,
                            "name": fc,
                            "path": os.path.join(dataset_path, fc),
                            "kind": "Feature Class"
                        })
                    arcpy.env.workspace = input_gdb

            feature_items = [x for x in discovered if x["kind"] == "Feature Class"]
            table_items = [x for x in discovered if x["kind"] == "Table"]

            root["diagnostics"]["discoveredFeatureClasses"] = len(feature_items)
            root["diagnostics"]["discoveredTables"] = len(table_items)

            if not discovered:
                msg = "No feature classes or tables were discovered in the selected geodatabase."
                root["diagnostics"]["warnings"].append(msg)
                arcpy.AddWarning(msg)

            attachment_tables = [x["path"] for x in table_items]
            attachment_index = self._build_attachment_index(input_gdb, attachment_tables)

            # Group by containing feature dataset / root.
            grouped = {key: {"name": os.path.basename(path.rstrip("\\/")), "path": path,
                             "kind": "featureDataset", "metadata": self._read_metadata(path), "features": []}
                       for key, path in feature_dataset_paths.items()}
            input_norm = os.path.normcase(os.path.normpath(input_gdb))

            for item in discovered:
                if item["kind"] == "Table" and not include_tables:
                    continue
                if item["kind"] == "Table" and self._is_attachment_support_object(item["name"]):
                    continue

                dir_norm = os.path.normcase(os.path.normpath(item["dirpath"]))
                is_root = dir_norm == input_norm

                if is_root:
                    group_key = "__ROOT__"
                    group_name = "Standalone / Root"
                    group_kind = "root"
                    group_path = input_gdb
                    group_metadata = root_metadata
                else:
                    group_key = dir_norm
                    group_name = os.path.basename(item["dirpath"].rstrip("\\/"))
                    group_kind = "featureDataset"
                    group_path = item["dirpath"]
                    group_metadata = None

                if group_key not in grouped:
                    grouped[group_key] = {
                        "name": group_name,
                        "path": group_path,
                        "kind": group_kind,
                        "metadata": group_metadata if group_kind == "root" else self._read_metadata(group_path),
                        "features": []
                    }

                try:
                    self._current_layer_serial = self._serial
                    self._serial += 1
                    export_start = len(self._archive.infolist())
                    profiled = self._store_dataset(self._describe_dataset(
                            item["path"],
                            item["kind"],
                            calculate_top_values,
                            include_system_fields,
                            attachment_index,
                            max_attachment_mb,
                            max_attribute_rows
                        ))
                    components = {"Attributes": 0, "Geometry": 0, "Attachments": 0, "Support": 0}
                    compressed = 0
                    for entry in self._archive.infolist()[export_start:]:
                        category = "Attachments" if entry.filename.startswith("attachments/") else "Attributes" if entry.filename.startswith("data/attributes-") else "Geometry" if entry.filename.endswith("-geometry.js") else "Support"
                        components[category] += entry.file_size
                        compressed += entry.compress_size
                    profiled["storage"].update(exportBytes=sum(components.values()), zipBytes=compressed, components=components)
                    grouped[group_key]["features"].append(profiled)
                except Exception as ex:
                    msg = "Could not profile {}: {}".format(item["path"], ex)
                    root["diagnostics"]["warnings"].append(msg)
                    arcpy.AddWarning(msg)

            groups = list(grouped.values())
            groups.sort(
                key=lambda g: (
                    0 if g["kind"] == "root" else 1,
                    str(g["name"]).lower()
                )
            )

            for group in groups:
                group["features"].sort(key=lambda f: str(f["name"]).lower())
                if group["features"] or group["kind"] == "featureDataset":
                    root["featureSets"].append(group)

        finally:
            arcpy.env.workspace = old_workspace

        all_features = [f for g in root["featureSets"] for f in g["features"]]
        root["summary"] = {
            "featureSetCount": len(root["featureSets"]),
            "featureCount": len(all_features),
            "fieldCount": sum(f["fieldCount"] for f in all_features),
            "attachmentCount": sum(
                f.get("attachmentSummary", {}).get("count", 0)
                for f in all_features
            ),
            "embeddedAttachmentCount": sum(
                f.get("attachmentSummary", {}).get("embeddedCount", 0)
                for f in all_features
            )
        }

        arcpy.AddMessage(
            "Discovery complete: {} groups, {} feature classes/tables.".format(
                len(root["featureSets"]), len(all_features)
            )
        )
        return root

    def _build_attachment_index(self, input_gdb, tables):
        index = {}
        for table in tables:
            table_path = table if os.path.dirname(str(table)) else os.path.join(input_gdb, table)
            table_name = os.path.basename(str(table_path))
            simple = self._simple_name(table_name)
            if not simple.upper().endswith(ATTACH_TABLE_SUFFIX):
                continue
            # Retain owner/database qualification. Different enterprise owners
            # may have feature classes with the same unqualified name.
            parent_name = table_name[:-len(ATTACH_TABLE_SUFFIX)]
            info = {
                "name": table_name,
                "path": table_path,
                "parentName": parent_name
            }
            index.setdefault(parent_name.casefold(), []).append(info)
            arcpy.AddMessage(
                "Detected attachment table: {} -> {}".format(
                    table_name, parent_name
                )
            )
        return index

    def _attachment_info(self, index, dataset_path):
        candidates = index.get(os.path.basename(dataset_path).casefold(), [])
        parent_dir = os.path.normcase(os.path.dirname(os.path.normpath(dataset_path))).casefold()
        local = [info for info in candidates if os.path.normcase(os.path.dirname(os.path.normpath(info["path"]))).casefold() == parent_dir]
        if len(local) == 1:
            return local[0]
        if len(candidates) == 1:
            return candidates[0]  # Attachment tables may live at GDB root.
        if candidates:
            arcpy.AddWarning("Ambiguous attachment tables for {}. Attachments omitted rather than assigning another dataset's files.".format(dataset_path))
        return None

    def _is_attachment_support_object(self, name):
        simple = self._simple_name(name).upper()
        return simple.endswith(ATTACH_TABLE_SUFFIX) or simple.endswith(ATTACH_REL_SUFFIX)

    def _simple_name(self, name):
        return str(name).split(".")[-1]

    def _describe_dataset(self, dataset_path, dataset_kind, calculate_top_values,
                          include_system_fields, attachment_index, max_attachment_mb,
                          max_attribute_rows):
        name = os.path.basename(dataset_path)
        simple_name = self._simple_name(name)
        desc = arcpy.Describe(dataset_path)
        arcpy.AddMessage("  Profiling {}: {}".format(dataset_kind, name))

        try:
            row_count = int(arcpy.management.GetCount(dataset_path)[0])
        except Exception:
            row_count = None

        fields = []
        for fld in arcpy.ListFields(dataset_path):
            field_info = {
                "name": fld.name, "alias": fld.aliasName, "type": fld.type,
                "length": fld.length, "precision": fld.precision, "scale": fld.scale,
                "nullable": bool(fld.isNullable), "required": bool(fld.required),
                "domain": fld.domain or "", "defaultValue": self._json_safe(fld.defaultValue),
                "topValues": [], "topValuesStatus": ""
            }
            if calculate_top_values and self._is_profileable_field(fld, include_system_fields):
                try:
                    field_info["topValues"] = self._top_10_values(dataset_path, fld.name)
                    field_info["topValuesStatus"] = "calculated"
                except Exception as ex:
                    field_info["topValuesStatus"] = "error: {}".format(ex)
                    arcpy.AddWarning("    Could not calculate top values for {}.{}: {}".format(name, fld.name, ex))
            else:
                field_info["topValuesStatus"] = "disabled" if not calculate_top_values else "not applicable"
            fields.append(field_info)

        spatial_reference = None
        geometry_type = getattr(desc, "shapeType", None)
        extent = None
        try:
            sr = getattr(desc, "spatialReference", None)
            if sr:
                spatial_reference = {
                    "name": getattr(sr, "name", None), "wkid": getattr(sr, "factoryCode", None),
                    "type": getattr(sr, "type", None), "linearUnitName": getattr(sr, "linearUnitName", None),
                    "angularUnitName": getattr(sr, "angularUnitName", None)
                }
            ext = getattr(desc, "extent", None)
            if ext:
                extent = {"xmin": ext.XMin, "ymin": ext.YMin, "xmax": ext.XMax, "ymax": ext.YMax}
        except Exception:
            pass

        indexes = []
        try:
            for idx in arcpy.ListIndexes(dataset_path) or []:
                indexes.append({"name": idx.name, "ascending": bool(idx.isAscending), "unique": bool(idx.isUnique), "fields": [f.name for f in idx.fields]})
        except Exception:
            pass

        subtype_info = []
        try:
            for code, info in (arcpy.da.ListSubtypes(dataset_path) or {}).items():
                subtype_info.append({"code": code, "name": info.get("Name"), "default": bool(info.get("Default"))})
        except Exception:
            pass

        attachments = []
        attachment_storage = {"known": True, "bytes": 0, "count": 0, "types": {}, "largest": []}
        attachment_summary = {"available": False, "count": 0, "embeddedCount": 0, "skippedCount": 0, "totalBytes": 0, "embeddedBytes": 0}
        attachment_info = self._attachment_info(attachment_index, dataset_path)
        if attachment_info and dataset_kind == "Feature Class" and self._include_attachment_viewer:
            attachment_storage = {"known": False}
            try:
                attachments, attachment_summary = self._read_attachments(dataset_path, attachment_info["path"], max_attachment_mb)
            except Exception as ex:
                arcpy.AddWarning("    Attachment viewer could not read {}: {}".format(name, ex))
                attachment_summary["available"] = True
                attachment_summary["error"] = str(ex)
        elif attachment_info and dataset_kind == "Feature Class":
            attachment_storage = self._attachment_storage_without_blobs(attachment_info["path"])

        spatial_geojson = self._read_compact_geojson(dataset_path)
        spatial_ids = {str(feature["properties"]["id"]) for feature in spatial_geojson["features"] if feature["properties"].get("id") is not None} if spatial_geojson else set()
        attribute_columns, attribute_rows, attribute_truncated = self._read_attribute_rows(
            dataset_path, max_attribute_rows, spatial_ids
        )
        spatial_index = {}
        matched = 0
        if spatial_geojson:
            for feature in spatial_geojson["features"]:
                feature_id = str(feature["properties"].get("id"))
                location = attribute_rows["locations"].get(feature_id)
                if location:
                    feature["properties"]["__gdbPage"] = location[0]
                    feature["properties"]["__gdbRow"] = location[1]
                    spatial_index[feature_id] = {"kind": "table", "page": location[0], "row": location[1]}
                    matched += 1
                else:
                    location = attribute_rows["popupLocations"].get(feature_id)
                    if location:
                        feature["properties"]["__gdbPopupPage"] = location[0]
                        feature["properties"]["__gdbRow"] = location[1]
                        spatial_index[feature_id] = {"kind": "popup", "page": location[0], "row": location[1]}
                        matched += 1
            if matched < len(spatial_geojson["features"]):
                arcpy.AddWarning("    Attribute lookup unavailable for {} of {} mapped features in {}. Check for source edits during export or a missing OID field.".format(len(spatial_geojson["features"]) - matched, len(spatial_geojson["features"]), name))

        return {
            "name": name, "path": dataset_path, "kind": dataset_kind,
            "catalogPath": getattr(desc, "catalogPath", dataset_path),
            "datasetType": getattr(desc, "datasetType", dataset_kind),
            "dataType": getattr(desc, "dataType", None), "geometryType": geometry_type,
            "rowCount": row_count, "hasOID": getattr(desc, "hasOID", None),
            "oidFieldName": getattr(desc, "OIDFieldName", None),
            "shapeFieldName": getattr(desc, "shapeFieldName", None),
            "displayField": getattr(desc, "displayField", None),
            "spatialReference": spatial_reference, "extent": extent,
            "indexes": indexes, "subtypes": subtype_info, "fields": fields,
            "metadata": self._read_metadata(dataset_path),
            "storage": {"sourceBytes": self._reported_size(desc), "attachments": attachment_storage},
            "attributeColumns": attribute_columns,
            "attributePages": attribute_rows["pages"],
            "spatialAttributePages": attribute_rows["popupPages"],
            "_spatialAttributeIndex": spatial_index,
            "spatialAttributeSummary": {"mappedCount": len(spatial_geojson["features"]) if spatial_geojson else 0, "matchedCount": matched, "supplementalRows": attribute_rows["popupCount"]},
            "exportedRowCount": attribute_rows["count"],
            "attributeRowsTruncated": attribute_truncated,
            "spatialGeoJSON": spatial_geojson,
            "attachments": attachments, "attachmentSummary": attachment_summary
        }

    def _read_compact_geojson(self, dataset_path):
        """Return a compact GeoJSON FeatureCollection for spatial datasets.

        Geometry is preserved; properties are deliberately minimal to keep the
        spatial preview compact. Each feature carries only its source OID
        when an OID field exists.
        """
        try:
            desc = arcpy.Describe(dataset_path)
            shape_type = getattr(desc, "shapeType", None)
            if not shape_type:
                return None

            oid_field = getattr(desc, "OIDFieldName", None)
            cursor_fields = ["SHAPE@"]
            if oid_field:
                cursor_fields.append("OID@")

            features = []
            vertex_count = 0
            truncated = False
            limit_reason = ""
            wgs84 = arcpy.SpatialReference(4326)
            with arcpy.da.SearchCursor(
                dataset_path,
                cursor_fields,
                spatial_reference=wgs84
            ) as cursor:
                for row in cursor:
                    if self._max_spatial_features > 0 and len(features) >= self._max_spatial_features:
                        truncated, limit_reason = True, "spatial feature limit"
                        break
                    shape = row[0]
                    if shape is None:
                        continue
                    # Check native point count before materialising a potentially huge JSON string.
                    source_vertices = int(getattr(shape, "pointCount", 0) or 0)
                    if self._max_spatial_vertices > 0 and vertex_count + source_vertices > self._max_spatial_vertices:
                        truncated, limit_reason = True, "spatial vertex limit"
                        break
                    esri = json.loads(shape.JSON)
                    if not esri:
                        continue
                    geom = self._esri_json_to_geojson(esri)
                    if not geom:
                        continue

                    vertices = self._vertex_count(geom.get("coordinates", []))
                    if self._max_spatial_vertices > 0 and vertex_count + vertices > self._max_spatial_vertices:
                        truncated, limit_reason = True, "spatial vertex limit"
                        break
                    vertex_count += vertices
                    props = {}
                    if oid_field and len(row) > 1:
                        props["id"] = row[1]

                    feature = {
                        "type": "Feature",
                        "geometry": geom,
                        "properties": props
                    }
                    features.append(feature)

            if truncated:
                arcpy.AddWarning("    Spatial preview limited for {}: {} ({} features, {} vertices).".format(os.path.basename(dataset_path), limit_reason, len(features), vertex_count))
            return {"type": "FeatureCollection", "features": features, "truncated":truncated, "limitReason":limit_reason, "vertexCount":vertex_count}
        except Exception as ex:
            arcpy.AddWarning(
                "    Spatial GeoJSON could not be generated for {}: {}".format(
                    os.path.basename(dataset_path), ex
                )
            )
            return None

    def _vertex_count(self, coordinates):
        if not coordinates:
            return 0
        if isinstance(coordinates[0], (int, float)):
            return 1
        return sum(self._vertex_count(child) for child in coordinates)

    def _esri_json_to_geojson(self, esri):
        """Convert ArcGIS geometry JSON to compact RFC 7946-style geometry."""
        if "x" in esri and "y" in esri:
            coords = [esri["x"], esri["y"]]
            if "z" in esri:
                coords.append(esri["z"])
            return {"type": "Point", "coordinates": coords}

        if "points" in esri:
            return {"type": "MultiPoint", "coordinates": esri.get("points", [])}

        if "paths" in esri:
            paths = esri.get("paths", [])
            if len(paths) == 1:
                return {"type": "LineString", "coordinates": paths[0]}
            return {"type": "MultiLineString", "coordinates": paths}

        if "rings" in esri:
            # ArcGIS rings may contain multipart polygons and holes. For a
            # compact catalogue viewer, retain rings exactly and represent them
            # as a Polygon. This preserves coordinate content without adding a
            # topology reconstruction pass to the export.
            return {"type": "Polygon", "coordinates": esri.get("rings", [])}

        return None

    def _read_attribute_rows(self, dataset_path, max_rows, spatial_ids=None):
        """Keep table limits while streaming separate pages for other mapped rows."""
        columns = [f.name for f in arcpy.ListFields(dataset_path) if f.type not in {"Geometry", "Blob", "Raster"}]
        pages, rows, locations = [], [], {}
        popup_pages, popup_rows, popup_locations = [], [], {}
        needed = set(spatial_ids or ())
        remaining = set(needed)
        count = page_bytes = 0
        popup_count = popup_bytes = 0
        truncated = False
        desc = arcpy.Describe(dataset_path)
        oid = getattr(desc, "OIDFieldName", None)
        oid_index = columns.index(oid) if oid in columns else -1
        layer_key = "data/attributes-{:06d}".format(self._current_layer_serial)
        def flush():
            nonlocal page_bytes
            if rows:
                ref = self._chunk(layer_key + "-{:06d}.js".format(len(pages)), rows)
                ref["count"] = len(rows)
                pages.append(ref)
                rows.clear()
                page_bytes = 0
        def flush_popup():
            nonlocal popup_bytes
            if popup_rows:
                ref = self._chunk(layer_key + "-popup-{:06d}.js".format(len(popup_pages)), popup_rows)
                ref["count"] = len(popup_rows)
                popup_pages.append(ref)
                popup_rows.clear()
                popup_bytes = 0
        if columns:
            with arcpy.da.SearchCursor(dataset_path, columns) as cursor:
                for row in cursor:
                    table_full = max_rows > 0 and count >= max_rows
                    if table_full:
                        truncated = True
                        if not remaining:
                            break
                    key = str(row[oid_index]) if oid_index >= 0 and row[oid_index] is not None else None
                    if table_full and key not in remaining:
                        continue
                    values = [self._json_safe(v) for v in row]
                    encoded_size = len(self._json(values).encode("utf-8"))
                    if table_full:
                        if popup_rows and (len(popup_rows) >= 150 or popup_bytes + encoded_size > 256 * 1024):
                            flush_popup()
                        popup_locations[key] = [len(popup_pages), len(popup_rows)]
                        popup_rows.append(values)
                        popup_bytes += encoded_size
                        popup_count += 1
                    else:
                        if rows and (len(rows) >= 150 or page_bytes + encoded_size > 256 * 1024):
                            flush()
                        if key is not None and (spatial_ids is None or key in needed):
                            locations[key] = [len(pages), len(rows)]
                        rows.append(values)
                        page_bytes += encoded_size
                        count += 1
                    remaining.discard(key)
            flush()
            flush_popup()
        return columns, {"pages":pages, "count":count, "locations":locations, "popupPages":popup_pages, "popupCount":popup_count, "popupLocations":popup_locations}, truncated

    def _read_attachments(self, parent_path, attach_path, max_attachment_mb):
        parent_desc = arcpy.Describe(parent_path)
        parent_fields = arcpy.ListFields(parent_path)
        attach_fields = arcpy.ListFields(attach_path)
        attach_by_upper = {f.name.upper(): f for f in attach_fields}

        if "REL_GLOBALID" in attach_by_upper:
            rel_field = attach_by_upper["REL_GLOBALID"].name
            parent_key_field = next((f.name for f in parent_fields if f.type == "GlobalID"), None)
        elif "REL_OBJECTID" in attach_by_upper:
            rel_field = attach_by_upper["REL_OBJECTID"].name
            parent_key_field = getattr(parent_desc, "OIDFieldName", None)
        else:
            raise RuntimeError("Attachment table has neither REL_GLOBALID nor REL_OBJECTID.")

        if not parent_key_field:
            raise RuntimeError("Could not resolve the parent attachment key field.")

        name_field = self._field_name(attach_by_upper, "ATT_NAME")
        content_field = self._field_name(attach_by_upper, "CONTENT_TYPE")
        data_field = self._field_name(attach_by_upper, "DATA")
        attachment_id_field = self._field_name(attach_by_upper, "ATTACHMENTID") or getattr(arcpy.Describe(attach_path), "OIDFieldName", None)
        if not data_field:
            raise RuntimeError("Attachment table does not contain a DATA BLOB field.")

        display_field = self._choose_display_field(parent_desc, parent_fields)
        parent_lookup = self._build_parent_lookup(parent_path, parent_key_field, display_field)

        cursor_fields = []
        for f in (attachment_id_field, rel_field, name_field, content_field, data_field):
            if f and f not in cursor_fields:
                cursor_fields.append(f)
        positions = {f: i for i, f in enumerate(cursor_fields)}
        max_bytes = int(max_attachment_mb * 1024 * 1024) if max_attachment_mb and max_attachment_mb > 0 else 0

        attachments = []
        total_bytes = embedded_bytes = skipped_count = 0
        try:
            with arcpy.da.SearchCursor(attach_path, cursor_fields) as cursor:
                for row in cursor:
                    att_id = row[positions[attachment_id_field]] if attachment_id_field else None
                    relation_value = row[positions[rel_field]]
                    att_name = row[positions[name_field]] if name_field else "Attachment {}".format(att_id)
                    content_type = row[positions[content_field]] if content_field else "application/octet-stream"
                    blob = row[positions[data_field]]
                    if isinstance(blob, memoryview):
                        blob = blob.tobytes()
                    elif isinstance(blob, bytearray):
                        blob = bytes(blob)
                    if blob is None:
                        blob = b""

                    size_bytes = len(blob)
                    total_bytes += size_bytes
                    parent_key = self._normalize_relation_key(relation_value)
                    parent_label = parent_lookup.get(parent_key, str(relation_value) if relation_value is not None else "(unknown)")
                    embed = (max_bytes == 0 or size_bytes <= max_bytes)
                    data_url = None
                    if embed:
                        ext = os.path.splitext(str(att_name or ""))[1].lower()
                        if not re_full_extension(ext):
                            ext = mimetypes.guess_extension(content_type or "") or ".bin"
                        data_url = "attachments/" + uuid.uuid4().hex + ext
                        self._archive.writestr(data_url, blob)
                        embedded_bytes += size_bytes
                    else:
                        skipped_count += 1

                    attachments.append({
                        "id": self._json_safe(att_id), "parentKey": self._json_safe(relation_value),
                        "parentLabel": parent_label, "name": att_name or "Unnamed attachment",
                        "contentType": content_type or "application/octet-stream",
                        "sizeBytes": size_bytes, "embedded": embed, "dataUrl": data_url
                    })

        finally:
            parent_lookup.close()

        attachments.sort(key=lambda a: (str(a.get("parentLabel") or "").lower(), str(a.get("name") or "").lower()))
        summary = {
            "available": True, "count": len(attachments),
            "embeddedCount": len(attachments) - skipped_count, "skippedCount": skipped_count,
            "totalBytes": total_bytes, "embeddedBytes": embedded_bytes
        }
        arcpy.AddMessage("    Attachments: {} total, {} included as files, {} skipped".format(summary["count"], summary["embeddedCount"], summary["skippedCount"]))
        return attachments, summary

    def _field_name(self, by_upper, key):
        fld = by_upper.get(key)
        return fld.name if fld else None

    def _choose_display_field(self, desc, fields):
        candidate = getattr(desc, "displayField", None)
        names = {f.name for f in fields}
        if candidate and candidate in names:
            return candidate
        upper_map = {f.name.upper(): f.name for f in fields}
        for preferred in ("NAME", "TITLE", "DESCRIPTION", "LABEL", "ASSET_ID", "UNITID", "ID"):
            if preferred in upper_map:
                return upper_map[preferred]
        for fld in fields:
            if fld.type == "String" and fld.name.upper() not in {"GLOBALID", "SHAPE"}:
                return fld.name
        return None

    def _build_parent_lookup(self, parent_path, key_field, display_field):
        path = os.path.join(self._work_dir, "parents.sqlite")
        with closing(sqlite3.connect(path)) as connection:
            connection.execute("DROP TABLE IF EXISTS labels")
            connection.execute("CREATE TABLE labels (key TEXT PRIMARY KEY, label TEXT)")
            fields = [key_field] + ([display_field] if display_field and display_field != key_field else [])
            with arcpy.da.SearchCursor(parent_path, fields) as cursor:
                for i, row in enumerate(cursor):
                    label_value = row[1] if len(fields) > 1 else row[0]
                    connection.execute("INSERT OR REPLACE INTO labels VALUES (?,?)", (self._normalize_relation_key(row[0]), "{} [{}]".format(self._display_value(label_value), self._display_value(row[0]))))
                    if i % 1000 == 999:
                        connection.commit()
            connection.commit()
        return _DiskLabels(path)

    def _normalize_relation_key(self, value):
        if value is None:
            return ""
        return str(value).strip("{}").upper()

    def _is_profileable_field(self, fld, include_system_fields):
        if fld.type in {"Geometry", "Blob", "Raster"}:
            return False
        if not include_system_fields:
            if fld.type in {"OID", "GlobalID"}:
                return False
            if fld.name.upper() in {"OBJECTID", "FID", "GLOBALID", "SHAPE_LENGTH", "SHAPE_AREA"}:
                return False
        return True

    def _top_10_values(self, dataset_path, field_name):
        counts = Counter()
        total = 0
        with closing(sqlite3.connect(os.path.join(self._work_dir, "counts.sqlite"))) as connection:
            connection.execute("PRAGMA temp_store=FILE")
            connection.execute("PRAGMA cache_size=-2048")
            connection.execute("DROP TABLE IF EXISTS counts")
            connection.execute("CREATE TABLE counts (value TEXT PRIMARY KEY, n INTEGER)")
            def flush():
                connection.executemany("INSERT INTO counts VALUES (?,?) ON CONFLICT(value) DO UPDATE SET n=n+excluded.n", counts.items())
                connection.commit()
                counts.clear()
            with arcpy.da.SearchCursor(dataset_path, [field_name]) as cursor:
                for row in cursor:
                    counts[self._display_value(row[0])] += 1
                    total += 1
                    if len(counts) >= 2048:
                        flush()
            flush()
            top = connection.execute("SELECT value,n FROM counts ORDER BY n DESC,value LIMIT 10").fetchall()
        return [{"value":value,"count":count,"percent":round(count / total * 100.0 if total else 0.0, 2)} for value, count in top]

    def _display_value(self, value):
        if value is None:
            return "(NULL)"
        if isinstance(value, datetime.datetime):
            return value.isoformat(sep=" ")
        if isinstance(value, datetime.date):
            return value.isoformat()
        if isinstance(value, bytes):
            return "<binary>"
        return str(value)

    def _json_safe(self, value):
        if value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (datetime.datetime, datetime.date)):
            return value.isoformat()
        return str(value)


class _DiskLabels:
    def __init__(self, path):
        self.connection = sqlite3.connect(path)
    def get(self, key, default=None):
        row = self.connection.execute("SELECT label FROM labels WHERE key=?", (key,)).fetchone()
        return row[0] if row else default
    def close(self):
        self.connection.close()


def re_full_extension(ext):
    return 1 < len(ext) <= 12 and ext[0] == "." and ext[1:].isalnum()

APP_README = """GDB Explorer v22.7
Extract ALL files from this ZIP to a normal folder and open index.html in Edge, Chrome or Firefox.
No installation, admin rights, network, local server or build step is required for catalogue data.
Keep the folders together. Opening index.html while still inside the ZIP does not work.
Map geometry and the bundled map engine load only in Spatial. Esri Topography is on by default.
The Spatial toolbar checkbox remembers this preference; uncheck it or select No basemap for offline use.
Data pages, map feature/vertex limits and omitted attachments are reported in the interface.
The attribute table limit does not truncate map popup details; additional mapped rows are loaded on click.
This is a read-only export snapshot, not a live geodatabase editor.
Separate source: index.html, styles.css, js/*.js, vendor/* and data/*.js.
Data files are classic script wrappers rather than fetch() JSON, for local-file browser compatibility.
Attachment files are raw binary files. Thumbnail toggles default off; enabling them loads images lazily.
Gallery paging and View/Download remain available with thumbnails on or off.
MetroMap key entry and browser save/remove controls are in a modal opened by the MetroMap button.
Storage loads only on demand: size mosaic, ranked bars and attachment breakdown.
GDB disk bytes exclude locks. ArcGIS-reported dataset sizes and attachment payloads are separate measures.
Unavailable source sizes stay unknown. Export sizes describe the limited snapshot, not the full source.
"""
