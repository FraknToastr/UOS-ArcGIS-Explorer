# -*- coding: utf-8 -*-
"""U·OS Explorer Suite: one launcher, a GDB snapshot and ArcGIS Online Explorer."""
import arcpy
import os
import json
import hashlib
import importlib.util
import copy
import zipfile
import tempfile
import shutil
import stat
import html

SUITE_VERSION = "2.1"
ROOT = os.path.dirname(os.path.abspath(__file__))
SUITE_ROOT = os.path.dirname(ROOT)
SHELL_DIRECTORIES = ("launcher", "assets", "vendor", "online")
REQUIRED_SUITE_ASSETS = {"index.html", "launcher/app.js", "launcher/audio.js", "launcher/tooltips.js", "launcher/tooltips.css", "launcher/sid-tracks.js", "vendor/sid-core.js", "launcher/styles.css", "launcher/workspace.js", "launcher/workspace-link.css", "online/index.html", "online/styles.css", "online/js/app.js", "online/js/graph-layout.js", "online/vendor/maplibre.js", "online/vendor/maplibre.css", "toolbox/engine/gdb_exporter.py"}
# Source compatibility is a data contract, not the list of this release's new UI dependencies.
MERGE_REQUIRED_GDB_ASSETS = {"index.html", "styles.css", "js/bootstrap.js", "js/runtime.js", "js/core.js", "js/tables.js", "js/metadata.js", "js/attachments.js", "js/spatial.js", "js/storage.js", "vendor/maplibre.js", "vendor/maplibre.css", "BUILD_INFO.json"}
_engine_path = os.path.join(ROOT, "engine", "gdb_exporter.py")
if not os.path.isfile(_engine_path):
    raise RuntimeError("The UOS Explorer engine is missing. Extract the complete suite ZIP.")
_spec = importlib.util.spec_from_file_location("uos_suite_gdb_engine", _engine_path)
engine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(engine)


class Toolbox:
    def __init__(self):
        self.label = "U·OS Explorer Suite v" + SUITE_VERSION
        self.alias = "uos_explorer_suite"
        self.tools = [BuildExplorerSuite, MergeExistingExplorer]


class _GDBArchive:
    """Namespace GDB files in one streaming ZIP, without recompressing a second ZIP."""
    def __init__(self, archive):
        self.archive = archive
        self.infos = []

    def _record(self, name):
        info = copy.copy(self.archive.getinfo("gdb/" + name))
        info.filename = name
        self.infos.append(info)

    def writestr(self, name, data, *args, **kwargs):
        self.archive.writestr("gdb/" + name, data, *args, **kwargs)
        self._record(name)

    def write(self, source, name, *args, **kwargs):
        self.archive.write(source, "gdb/" + name, *args, **kwargs)
        self._record(name)

    def infolist(self):
        return self.infos


class BuildExplorerSuite(engine.BuildGDBStaticCatalogue):
    def __init__(self):
        super().__init__()
        self.label = "Build U·OS Explorer Suite v" + SUITE_VERSION
        self.description = "Export one ZIP containing a visual launcher, the chosen geodatabase in GDB Explorer, and ArcGIS Online Explorer."

    def _default_output_path(self, input_gdb):
        name = os.path.basename(super()._default_output_path(input_gdb)).replace("_GDB_Explorer.zip", "_UOS_Explorer.zip")
        return os.path.join(ROOT, name)

    def getParameterInfo(self):
        parameters = super().getParameterInfo()
        parameters[1].displayName = "Output Explorer Suite ZIP"
        parameters[7].value = "U·OS Explorer"
        return parameters

    def _validate_app_assets(self):
        super()._validate_app_assets()
        try:
            with open(os.path.join(SUITE_ROOT, "suite-manifest.json"), encoding="utf-8") as source:
                manifest = json.load(source)
            if manifest.get("version") != SUITE_VERSION:
                raise ValueError("Toolbox and launcher versions differ")
            if not REQUIRED_SUITE_ASSETS.issubset(manifest["sha256"]):
                raise ValueError("The suite manifest is incomplete")
            for name, expected in manifest["sha256"].items():
                parts = name.split("/")
                if "\\" in name or any(part in {"..", ".", ""} or ":" in part for part in parts):
                    raise ValueError("Invalid asset path")
                asset = os.path.join(SUITE_ROOT, *parts)
                if os.path.commonpath([os.path.realpath(SUITE_ROOT), os.path.realpath(asset)]) != os.path.realpath(SUITE_ROOT):
                    raise ValueError("Asset path leaves the suite folder")
                digest = hashlib.sha256()
                with open(asset, "rb") as source:
                    for chunk in iter(lambda: source.read(65536), b""):
                        digest.update(chunk)
                if digest.hexdigest() != expected:
                    raise ValueError("Mismatched app file: " + name)
            # Shell output is portable only when every copied dependency is validated.
            for name in _shell_files():
                if name not in manifest["sha256"]:
                    raise ValueError("Unlisted suite dependency: " + name)
        except (OSError, KeyError, ValueError) as error:
            raise RuntimeError("U·OS Explorer Suite installation is incomplete or mixed. Extract the complete v{} ZIP. {}".format(SUITE_VERSION, error)) from error

    def execute(self, parameters, messages):
        arcpy.AddMessage("U·OS Explorer Suite v{}: building launcher and both workspaces.".format(SUITE_VERSION))
        try:
            super().execute(parameters, messages)
        finally:
            self._suite_archive = None
        arcpy.AddMessage("Suite ready. Extract the complete output ZIP and open index.html to choose a workspace.")

    def _copy_app_sources(self, page_title):
        self._suite_archive = self._archive
        _write_suite_shell(self._suite_archive)
        self._archive = _GDBArchive(self._suite_archive)
        super()._copy_app_sources(page_title)

    def _build_storage(self, catalogue, input_gdb):
        storage = super()._build_storage(catalogue, input_gdb)
        config = {"version": SUITE_VERSION, "hasGdb": True, "gdbName": catalogue["name"]}
        self._suite_archive.writestr("launcher/workspace.js", "window.UOS_WORKSPACE=" + self._json(config) + ";\n")
        self._suite_archive.writestr("BUILD_INFO.json", self._json({"suiteVersion": SUITE_VERSION, "gdbExplorerVersion": engine.APP_VERSION, "arcgisExplorerVersion": "2.5", "geodatabase": catalogue["name"]}))
        return storage


def _shell_files():
    yield "index.html"
    for directory in SHELL_DIRECTORIES:
        for parent, dirs, files in os.walk(os.path.join(SUITE_ROOT, directory)):
            dirs.sort()
            for name in sorted(files):
                source = os.path.join(parent, name)
                yield os.path.relpath(source, SUITE_ROOT).replace(os.sep, "/")


def _write_suite_shell(archive):
    for relative in _shell_files():
        if relative != "launcher/workspace.js":
            archive.write(os.path.join(SUITE_ROOT, *relative.split("/")), relative)
    archive.writestr("README.txt", SUITE_README)


def _validate_zip_members(infos):
    """Reject aliases that extract differently on Windows and non-regular members."""
    identities = set()
    files = set()
    directories = set()
    reserved = {"CON", "PRN", "AUX", "NUL"} | {"COM" + str(i) for i in range(1, 10)} | {"LPT" + str(i) for i in range(1, 10)}
    for info in infos:
        name = info.filename
        parts = name.rstrip("/").split("/")
        mode = stat.S_IFMT(info.external_attr >> 16)
        if (not name or name.startswith("/") or "\\" in name or "\x00" in info.orig_filename
                or any(part in {"", ".", ".."} or any(char in ':"<>|?*' or ord(char) < 32 for char in part) or part.endswith((".", " "))
                       or part.split(".", 1)[0].upper() in reserved for part in parts)
                or mode not in {0, stat.S_IFREG, stat.S_IFDIR}
                or (mode == stat.S_IFDIR and not info.is_dir())):
            raise RuntimeError("The source ZIP contains unsafe file paths or non-regular members.")
        identity = "/".join(parts).casefold()
        if identity in identities:
            raise RuntimeError("The source ZIP contains a file-name collision on Windows.")
        identities.add(identity)
        if info.is_dir():
            directories.add(identity)
        else:
            files.add(identity)
        directories.update("/".join(parts[:i]).casefold() for i in range(1, len(parts)))
    if files & directories:
        raise RuntimeError("The source ZIP contains a file/directory collision.")


class MergeExistingExplorer:
    def __init__(self):
        self.label = "Merge Existing GDB Explorer ZIP · v" + SUITE_VERSION
        self.description = "Add the launcher and ArcGIS Online Explorer to an existing modular GDB Explorer app ZIP. The source ZIP remains unchanged."
        self.canRunInBackground = False

    def _default(self, source):
        name = os.path.splitext(os.path.basename(str(source or "Geodatabase_GDB_Explorer.zip")))[0]
        name = name[:-len("_GDB_Explorer")] if name.endswith("_GDB_Explorer") else name
        return os.path.join(ROOT, name + "_UOS_Explorer.zip")

    def getParameterInfo(self):
        source = arcpy.Parameter(displayName="Existing GDB Explorer App ZIP", name="existing_gdb_zip", datatype="DEFile", parameterType="Required", direction="Input")
        output = arcpy.Parameter(displayName="Output Explorer Suite ZIP", name="output_suite_zip", datatype="DEFile", parameterType="Required", direction="Output")
        source.filter.list = output.filter.list = ["zip"]
        output.value = self._default(None)
        self._last_default = str(output.value)
        return [source, output]

    def isLicensed(self):
        return True

    def updateParameters(self, parameters):
        current = parameters[1].valueAsText
        if not current or current == getattr(self, "_last_default", None):
            parameters[1].value = self._default(parameters[0].valueAsText)
            self._last_default = str(parameters[1].value)

    def updateMessages(self, parameters):
        for parameter in parameters:
            if parameter.valueAsText and not parameter.valueAsText.lower().endswith(".zip"):
                parameter.setErrorMessage("Choose a ZIP file.")
        if parameters[0].valueAsText and parameters[1].valueAsText and os.path.normcase(os.path.realpath(parameters[0].valueAsText)) == os.path.normcase(os.path.realpath(parameters[1].valueAsText)):
            parameters[1].setErrorMessage("Choose an output different from the source ZIP.")

    def execute(self, parameters, messages):
        source = os.path.abspath(parameters[0].valueAsText)
        output = os.path.abspath(parameters[1].valueAsText or self._default(source))
        if os.path.normcase(os.path.realpath(source)) == os.path.normcase(os.path.realpath(output)):
            raise RuntimeError("Output must differ from the source ZIP.")
        if not output.lower().endswith(".zip"):
            raise ValueError("Output must be a ZIP file.")
        if os.path.exists(output) and not arcpy.env.overwriteOutput:
            raise RuntimeError("Output exists. Choose another name or enable overwrite outputs.")
        validator = BuildExplorerSuite()
        validator._assets = os.path.join(ROOT, "engine", "gdb_explorer_assets")
        validator._validate_app_assets()
        os.makedirs(os.path.dirname(output), exist_ok=True)
        fd, pending = tempfile.mkstemp(prefix="uos-merge-", suffix=".zip", dir=os.path.dirname(output))
        os.close(fd)
        try:
            with zipfile.ZipFile(source) as original:
                names = original.namelist()
                if len(names) != len(set(names)):
                    raise RuntimeError("The source ZIP contains duplicate file names.")
                _validate_zip_members(original.infolist())
                candidates = [name for name in names if name == "data/catalogue.js" or name.endswith("/data/catalogue.js")]
                if len(candidates) != 1:
                    raise RuntimeError("Choose a modular GDB Explorer app ZIP containing one data/catalogue.js. Monolithic HTML is not supported.")
                prefix = candidates[0][:-len("data/catalogue.js")]
                required = sorted(MERGE_REQUIRED_GDB_ASSETS)
                missing = [name for name in required if prefix + name not in names]
                if missing:
                    raise RuntimeError("The source GDB app is incomplete: " + ", ".join(missing))
                try:
                    build_info = json.loads(original.read(prefix + "BUILD_INFO.json").decode("utf-8-sig"))
                except (ValueError, UnicodeError) as error:
                    raise RuntimeError("The source BUILD_INFO.json is invalid. Please re-export before merging.") from error
                if not isinstance(build_info, dict) or build_info.get("version") not in {"22.5", "22.6", "22.7"}:
                    raise RuntimeError("This GDB export has an incompatible runtime. Please re-export with the current toolbox before merging.")
                raw = original.read(candidates[0]).decode("utf-8-sig").strip()
                if not raw.startswith("window.GDBCatalogue=") or not raw.endswith(";"):
                    raise RuntimeError("The GDB catalogue wrapper is invalid.")
                catalogue = json.loads(raw[len("window.GDBCatalogue="):-1])
                if not isinstance(catalogue, dict) or not isinstance(catalogue.get("featureSets"), list):
                    raise RuntimeError("The GDB catalogue is invalid.")
                name = str(catalogue.get("name") or "Geodatabase")
                arcpy.AddMessage("Merging {} into U·OS Explorer Suite v{}...".format(name, SUITE_VERSION))
                with zipfile.ZipFile(pending, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as merged:
                    _write_suite_shell(merged)
                    # v22.5/22.6/22.7 share the paged catalogue contract. Refresh their UI,
                    # while preserving the supplied map engine and all data bytes.
                    runtime = set()
                    for parent, directories, files in os.walk(validator._assets):
                        directories.sort()
                        for filename in files:
                            relative = os.path.relpath(os.path.join(parent, filename), validator._assets).replace(os.sep, "/")
                            if relative not in {"vendor/maplibre.js", "vendor/maplibre.css", "asset-manifest.json"}:
                                runtime.add(relative)
                    for info in original.infolist():
                        if info.is_dir() or not info.filename.startswith(prefix):
                            continue
                        relative = info.filename[len(prefix):]
                        if relative in runtime or relative in {"BUILD_INFO.json", "asset-manifest.json", "README.txt"}:
                            continue
                        with original.open(info) as incoming, merged.open("gdb/" + relative, "w", force_zip64=True) as outgoing:
                            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
                    for relative in sorted(runtime):
                        asset = os.path.join(validator._assets, *relative.split("/"))
                        if relative == "index.html":
                            with open(asset, encoding="utf-8") as page:
                                current_page = page.read().replace("__TITLE__", html.escape(name))
                                merged.writestr("gdb/index.html", current_page.replace(" data-gdb-import-shell", ""))
                        else:
                            merged.write(asset, "gdb/" + relative)
                    build_info["importedRuntimeVersion"] = build_info["version"]
                    build_info["version"] = engine.APP_VERSION
                    merged.writestr("gdb/BUILD_INFO.json", validator._json(build_info))
                    merged.writestr("gdb/README.txt", engine.APP_README)
                    merged.writestr("launcher/workspace.js", "window.UOS_WORKSPACE=" + validator._json({"version": SUITE_VERSION, "hasGdb": True, "gdbName": name}) + ";\n")
                    merged.writestr("BUILD_INFO.json", validator._json({"suiteVersion": SUITE_VERSION, "gdbExplorerVersion": engine.APP_VERSION, "gdbImport": "existing export", "arcgisExplorerVersion": "2.5", "geodatabase": name}))
            os.replace(pending, output)
        finally:
            if os.path.exists(pending):
                os.remove(pending)
        parameters[1].value = output
        arcpy.AddMessage("Suite created: {}. Extract all files and open index.html.".format(output))


SUITE_README = """U·OS Explorer Suite v2.1
Extract every file into a normal folder and open index.html.
Choose GDB Explorer for this exported geodatabase or ArcGIS Online for live content.
Use the arrow in either workspace header to return to the launcher.
Only the chosen workspace loads; leaving it releases its page and map resources.
Export an ArcGIS Online workspace JSON before leaving if you want to retain its scanned resources.
ArcGIS Online tokens remain in that workspace's memory and are never passed to the launcher.
Local GDB data and included attachments work offline. Live content and basemaps need internet access.
Keep the folders together. Do not open index.html from inside the ZIP preview.
"""
