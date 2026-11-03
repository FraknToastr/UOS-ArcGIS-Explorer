"""Clean-install and streaming-namespace regression checks, using an ArcPy simulation."""
import sys
import importlib.util
import importlib.machinery
import json
import hashlib
import tempfile
import stat
import zipfile
from pathlib import Path
from unittest.mock import patch
import unittest

sys.path.insert(0, str(Path(__file__).parent))
from test_toolbox_fixtures import arcpy, OUTPUT, decode_script

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader("uos_suite", str(ROOT / "toolbox/UOS_Explorer_Suite_v2_1.pyt"))
spec = importlib.util.spec_from_loader(loader.name, loader)
suite = importlib.util.module_from_spec(spec)
loader.exec_module(suite)


class SuiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tool = suite.BuildExplorerSuite()
        params = cls.tool.getParameterInfo()
        params[0].value = "/fake/Fixture.gdb"
        params[1].value = str(OUTPUT / "suite.zip")
        params[8].value = 2
        params[9].value = 200
        params[6].value = 1
        cls.tool.execute(params, None)
        cls.archive = zipfile.ZipFile(OUTPUT / "suite.zip")
        cls.archive.extractall(OUTPUT / "app")
        cls.catalogue = json.loads(cls.archive.read("gdb/data/catalogue.js").decode()[len("window.GDBCatalogue="):-2])

    @classmethod
    def tearDownClass(cls):
        cls.archive.close()

    def test_both_workspaces_and_launcher_are_complete(self):
        names = self.archive.namelist()
        for name in ["index.html", "launcher/app.js", "launcher/audio.js", "launcher/workspace.js", "launcher/workspace-link.css", "online/index.html", "online/js/app.js", "online/vendor/maplibre.js", "gdb/index.html", "gdb/js/runtime.js", "gdb/js/bootstrap.js", "gdb/data/catalogue.js"]:
            self.assertIn(name, names)
        self.assertEqual(len(names), len(set(names)), "Never write duplicate ZIP members")
        self.assertNotIn("data/catalogue.js", names)
        self.assertNotIn("toolbox/UOS_Explorer_Suite_v2_1.pyt", names)

    def test_launcher_config_and_versions(self):
        raw = self.archive.read("launcher/workspace.js").decode()
        config = json.loads(raw[len("window.UOS_WORKSPACE="):-2])
        self.assertTrue(config["hasGdb"])
        self.assertEqual(config["gdbName"], "Fixture.gdb")
        self.assertEqual(config["version"], "2.1")
        self.assertEqual(json.loads(self.archive.read("gdb/BUILD_INFO.json"))["version"], "22.7")
        self.assertEqual(json.loads(self.archive.read("BUILD_INFO.json"))["arcgisExplorerVersion"], "2.5")

    def test_portable_shell_dependencies_and_export_startup(self):
        names = set(self.archive.namelist())
        for relative in suite._shell_files():
            self.assertIn(relative, names)
        self.assertFalse(any(name.startswith(("toolbox/", "tests/")) for name in names))
        self.assertNotIn("data-gdb-import-shell", self.archive.read("gdb/index.html").decode())
        self.assertIn('href="../index.html"', self.archive.read("gdb/index.html").decode())
        self.assertIn('href="../index.html"', self.archive.read("online/index.html").decode())

    def test_unlisted_shell_dependency_rejects_before_output_replacement(self):
        shell_files = list(suite._shell_files()) + ["assets/unlisted-runtime.js"]
        target = OUTPUT / "unlisted-preserved.zip"
        target.write_bytes(b"original")
        tool = suite.BuildExplorerSuite()
        params = tool.getParameterInfo()
        params[0].value, params[1].value = "/fake/Fixture.gdb", str(target)
        with patch.object(suite, "_shell_files", return_value=iter(shell_files)):
            with self.assertRaisesRegex(RuntimeError, "Unlisted suite dependency"):
                tool.execute(params, None)
        self.assertEqual(target.read_bytes(), b"original")

    def test_launcher_is_a_required_install_dependency(self):
        self.assertIn("launcher/app.js", suite.REQUIRED_SUITE_ASSETS)
        manifest = json.loads((ROOT / "suite-manifest.json").read_text())
        with patch.object(suite.json, "load", return_value={**manifest, "sha256": {key: value for key, value in manifest["sha256"].items() if key != "launcher/app.js"}}):
            with self.assertRaisesRegex(RuntimeError, "manifest is incomplete"):
                validator = suite.BuildExplorerSuite()
                validator._assets = str(ROOT / "toolbox/engine/gdb_explorer_assets")
                # The engine loads its own manifest first; isolate the suite validation.
                with patch.object(suite.engine.BuildGDBStaticCatalogue, "_validate_app_assets"):
                    validator._validate_app_assets()

    def test_namespaced_chunks_and_popup_fix(self):
        item = self.catalogue["featureSets"][0]["features"][0]
        def chunk(ref):
            raw = self.archive.read("gdb/" + ref["path"]).decode()
            return json.loads(raw[len("GDBChunks.receive(document.currentScript,"):-3])
        self.assertEqual(item["exportedRowCount"], 2)
        self.assertEqual(item["spatialAttributeSummary"]["matchedCount"], 200)
        geometry = chunk(item["geometryFile"])
        index = chunk(item["spatialAttributeIndexFile"])
        location = index["161"]
        rows = chunk(item["spatialAttributePages"][location["page"]])
        self.assertEqual(rows[location["row"]][0], 161)
        self.assertIn("__gdbPopupPage", geometry["features"][160]["properties"])
        page = chunk(item["attachmentPages"][0])
        self.assertIn("gdb/" + page[0]["dataUrl"], self.archive.namelist())

    def test_storage_counts_only_gdb_dataset_files(self):
        ref = self.catalogue["storageFile"]
        raw = self.archive.read("gdb/" + ref["path"]).decode()
        data = json.loads(raw[len("GDBChunks.receive(document.currentScript,"):-3])
        entries = [info for info in self.archive.infolist() if info.filename.startswith(("gdb/data/layer-", "gdb/data/attributes-", "gdb/attachments/"))]
        self.assertEqual(sum(item["exportBytes"] for item in data["layers"]), sum(info.file_size for info in entries))
        self.assertEqual(sum(item["zipBytes"] for item in data["layers"]), sum(info.compress_size for info in entries))

    def test_output_default_and_visible_tool_version(self):
        params = self.tool.getParameterInfo()
        self.assertEqual(Path(params[1].valueAsText).parent, ROOT / "toolbox")
        self.assertTrue(params[1].valueAsText.endswith("_UOS_Explorer.zip"))
        self.assertIn("v2.1", self.tool.label)

    def test_failed_combined_export_preserves_existing_file(self):
        target = OUTPUT / "protected-suite.zip"
        target.write_bytes(b"existing")
        tool = suite.BuildExplorerSuite()
        params = tool.getParameterInfo()
        params[0].value = "/fake/Fixture.gdb"
        params[1].value = str(target)
        with patch.object(tool, "_build_storage", side_effect=RuntimeError("simulated late failure")):
            with self.assertRaises(RuntimeError):
                tool.execute(params, None)
        self.assertEqual(target.read_bytes(), b"existing")

    def test_merge_existing_export_preserves_source_and_data(self):
        source = OUTPUT / "existing-gdb.zip"
        with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
            for info in self.archive.infolist():
                if info.filename.startswith("gdb/"):
                    archive.writestr("EnclosingFolder/" + info.filename[4:], self.archive.read(info))
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value = str(source)
        params[1].value = str(OUTPUT / "merged-existing.zip")
        tool.execute(params, None)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
        with zipfile.ZipFile(OUTPUT / "merged-existing.zip") as merged:
            self.assertEqual(len(merged.namelist()), len(set(merged.namelist())))
            self.assertIn("online/index.html", merged.namelist())
            self.assertEqual(merged.read("gdb/data/catalogue.js"), self.archive.read("gdb/data/catalogue.js"))
            self.assertIn('href="../index.html"', merged.read("gdb/index.html").decode())
            self.assertIn("GDB Explorer v22.7", merged.read("gdb/README.txt").decode())
            self.assertEqual(json.loads(merged.read("BUILD_INFO.json"))["gdbExplorerVersion"], "22.7")
            merged.extractall(OUTPUT / "merged-app")

    def test_merge_rejects_same_input_and_output(self):
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value = params[1].value = str(OUTPUT / "suite.zip")
        with self.assertRaisesRegex(RuntimeError, "differ"):
            tool.execute(params, None)

    def test_merge_rejects_directory_alias_of_source(self):
        source_dir = OUTPUT / "alias-source"
        source_dir.mkdir(exist_ok=True)
        source = source_dir / "source.zip"
        before = (OUTPUT / "suite.zip").read_bytes()
        source.write_bytes(before)
        alias = OUTPUT / "alias-destination"
        if not alias.exists():
            try:
                alias.symlink_to(source_dir, target_is_directory=True)
            except OSError as error:
                self.skipTest("Directory symlinks unavailable: " + str(error))
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value, params[1].value = str(source), str(alias / "source.zip")
        with self.assertRaisesRegex(RuntimeError, "differ"):
            tool.execute(params, None)
        self.assertEqual(source.read_bytes(), before)

    def test_bad_existing_zip_preserves_output(self):
        source = OUTPUT / "bad-source.zip"
        with zipfile.ZipFile(source, "w") as archive:
            archive.writestr("index.html", "incomplete")
        output = OUTPUT / "protected-merge.zip"
        output.write_bytes(b"keep")
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value = str(source)
        params[1].value = str(output)
        with self.assertRaises(RuntimeError):
            tool.execute(params, None)
        self.assertEqual(output.read_bytes(), b"keep")

    def _merge_rejects_mutation(self, label, mutate, error):
        source = OUTPUT / (label + "-source.zip")
        with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
            entries = {info.filename[4:]: self.archive.read(info) for info in self.archive.infolist() if info.filename.startswith("gdb/")}
            mutate(entries)
            for name, content in entries.items():
                archive.writestr(name, content)
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        output = OUTPUT / (label + "-protected.zip")
        output.write_bytes(b"existing output")
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value, params[1].value = str(source), str(output)
        pending = set(OUTPUT.glob("uos-merge-*.zip"))
        with self.assertRaisesRegex(RuntimeError, error):
            tool.execute(params, None)
        self.assertEqual(output.read_bytes(), b"existing output")
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)
        self.assertEqual(set(OUTPUT.glob("uos-merge-*.zip")), pending)

    def test_merge_requires_bootstrap_and_storage(self):
        for name in ("js/bootstrap.js", "js/storage.js"):
            with self.subTest(name=name):
                self._merge_rejects_mutation(name.replace("/", "-"), lambda entries: entries.pop(name), "incomplete")

    def test_merge_rejects_windows_paths_and_canonical_aliases(self):
        for name in ("C:/escape.txt", "data/name:stream", "data/./alias.js", "data//alias.js", "data/name.", "data/CON.txt", "data/bad?.js", "JS/CORE.JS"):
            with self.subTest(name=name):
                self._merge_rejects_mutation("unsafe-" + str(len(name)) + "-" + str(sum(map(ord, name))), lambda entries: entries.update({name: b"unsafe"}), "unsafe|collision")

    def test_merge_rejects_symlink_member(self):
        def mutate(entries):
            info = zipfile.ZipInfo("data/link.js")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            entries[info] = b"../../outside"
        self._merge_rejects_mutation("symlink", mutate, "unsafe")

    def test_merge_rejects_unknown_runtime_without_replacing_output(self):
        self._merge_rejects_mutation("unknown-runtime", lambda entries: entries.update({"BUILD_INFO.json": b'{"version":"21.0"}'}), "re-export")

    def test_merge_updates_runtime_but_retains_vendor_and_data(self):
        source = OUTPUT / "old-runtime.zip"
        with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
            for info in self.archive.infolist():
                if info.filename.startswith("gdb/"):
                    relative = info.filename[4:]
                    content = b"// old core" if relative == "js/core.js" else self.archive.read(info)
                    if relative == "BUILD_INFO.json":
                        content = b'{"version":"22.5"}'
                    archive.writestr(relative, content)
        tool = suite.MergeExistingExplorer()
        params = tool.getParameterInfo()
        params[0].value, params[1].value = str(source), str(OUTPUT / "updated-runtime.zip")
        tool.execute(params, None)
        with zipfile.ZipFile(params[1].valueAsText) as merged:
            self.assertEqual(merged.read("gdb/js/core.js"), (ROOT / "toolbox/engine/gdb_explorer_assets/js/core.js").read_bytes())
            self.assertEqual(merged.read("gdb/vendor/maplibre.js"), self.archive.read("gdb/vendor/maplibre.js"))
            self.assertEqual(merged.read("gdb/data/catalogue.js"), self.archive.read("gdb/data/catalogue.js"))
            self.assertIn('href="../index.html"', merged.read("gdb/index.html").decode())

    def test_merge_accepts_legacy_sources_without_new_browser_import_assets(self):
        baseline = suite.MERGE_REQUIRED_GDB_ASSETS
        for version in ("22.5", "22.6"):
            with self.subTest(version=version):
                source = OUTPUT / ("legacy-" + version + ".zip")
                with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
                    for info in self.archive.infolist():
                        if not info.filename.startswith("gdb/"):
                            continue
                        relative = info.filename[4:]
                        if relative in suite.engine.REQUIRED_APP_ASSETS and relative not in baseline:
                            continue
                        content = self.archive.read(info)
                        if relative == "BUILD_INFO.json":
                            content = json.dumps({"version": version}).encode()
                        archive.writestr(relative, content)
                original = hashlib.sha256(source.read_bytes()).hexdigest()
                tool = suite.MergeExistingExplorer()
                params = tool.getParameterInfo()
                params[0].value, params[1].value = str(source), str(OUTPUT / ("merged-legacy-" + version + ".zip"))
                tool.execute(params, None)
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original)
                with zipfile.ZipFile(params[1].valueAsText) as merged:
                    self.assertEqual(merged.read("gdb/data/catalogue.js"), self.archive.read("gdb/data/catalogue.js"))
                    self.assertNotIn("data-gdb-import-shell", merged.read("gdb/index.html").decode())
                    for relative in suite.engine.REQUIRED_APP_ASSETS:
                        self.assertIn("gdb/" + relative, merged.namelist())
                    self.assertIn("gdb/vendor/zip.js-LICENSE.txt", merged.namelist())


if __name__ == "__main__":
    unittest.main(verbosity=2)
