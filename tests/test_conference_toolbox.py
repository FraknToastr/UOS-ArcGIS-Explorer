"""Conference toolbox discovery, local HTML launching and original tool regression checks."""
import hashlib
import importlib.machinery
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
from test_toolbox_fixtures import arcpy, messages

ROOT = Path(__file__).resolve().parents[1]
STANDARD_PATH = ROOT / "toolbox/UOS_Explorer_Suite_v2_1.pyt"
FACTORY_PATH = ROOT / "toolbox/ChatGPT_PYT_Factory.html"
ORIGINAL_HASHES = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (STANDARD_PATH, FACTORY_PATH)}


def load_conference():
    loader = importlib.machinery.SourceFileLoader(
        "conference_test_toolbox", str(ROOT / "toolbox/UOS_Explorer_Suite_Conference_Edition.pyt")
    )
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def parameter_contract(tool):
    return [
        {name: getattr(p, name, None) for name in ("name", "displayName", "datatype", "parameterType", "direction", "valueAsText")}
        for p in tool.getParameterInfo()
    ]


class ConferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conference = load_conference()

    def test_discovery_order_parameters_and_no_launch(self):
        with patch("webbrowser.open") as launch:
            conference = load_conference()
            toolbox = conference.Toolbox()
            self.assertEqual(toolbox.label, "GDB Explorer")
            self.assertNotEqual(toolbox.alias, conference._standard.Toolbox().alias)
            self.assertEqual([tool.__name__ for tool in toolbox.tools], ["ChatGPTPytFactory", "BuildExplorerSuite", "MergeExistingExplorer"])
            factory = toolbox.tools[0]()
            self.assertEqual(factory.label, "ChatGPT Pyt Factory")
            self.assertEqual(factory.getParameterInfo(), [])
            self.assertTrue(factory.isLicensed())
            self.assertFalse(factory.canRunInBackground)
            for name in ("BuildExplorerSuite", "MergeExistingExplorer"):
                wrapped, original = getattr(conference, name), getattr(conference._standard, name)
                self.assertIs(wrapped.execute, original.execute)
                self.assertEqual(wrapped().label, "Create GDB Explorer File" if name == "BuildExplorerSuite" else "Update GDB Explorer File")
                actual, previous = parameter_contract(wrapped()), parameter_contract(original())
                for current, old in zip(actual, previous):
                    for field in ("name", "datatype", "parameterType", "direction"):
                        self.assertEqual(current[field], old[field], "Parameter contract stays compatible")
                    self.assertNotRegex(current["displayName"], r"U[·]?OS|Suite|v\d")
                self.assertEqual(actual[1]["displayName"], "Output GDB Explorer File")
                self.assertNotIn("UOS", Path(actual[1]["valueAsText"]).name)
                self.assertEqual(wrapped().getParameterInfo()[1].filter.list, ["zip"])
                if name == "BuildExplorerSuite":
                    self.assertEqual(actual[7]["valueAsText"], "GDB Explorer")
                else:
                    self.assertEqual(actual[0]["displayName"], "Input GDB Explorer File")
            launch.assert_not_called()

    def test_output_defaults_and_validation_use_file_naming(self):
        conference = self.conference
        for cls in (conference.BuildExplorerSuite, conference.MergeExistingExplorer):
            tool = cls()
            parameters = tool.getParameterInfo()
            parameters[0].value = "/fake/Parks.gdb" if cls is conference.BuildExplorerSuite else "/fake/Parks_UOS_Explorer.zip"
            tool.updateParameters(parameters)
            self.assertIn("Parks", parameters[1].valueAsText)
            self.assertIn("GDB_Explorer_File", parameters[1].valueAsText)
            self.assertNotIn("UOS", Path(parameters[1].valueAsText).name)
            parameters[1].value = "/fake/User chosen output.zip"
            parameters[0].value = "/fake/Another.gdb" if cls is conference.BuildExplorerSuite else "/fake/Another.zip"
            tool.updateParameters(parameters)
            self.assertEqual(parameters[1].valueAsText, "/fake/User chosen output.zip")
            parameters[1].value = "/fake/invalid.txt"
            tool.updateMessages(parameters)
            self.assertIn("GDB Explorer File", parameters[1].error)
        for source in ("Parks_GDB_Explorer_File.zip", "Parks_GDB_Explorer_File_Updated.zip", "Parks_GDB_Explorer.zip", "Parks_UOS_Explorer.zip"):
            self.assertEqual(Path(conference.MergeExistingExplorer()._default(source)).name, "Parks_GDB_Explorer_File_Updated.zip")

    def test_factory_launches_conference_copy_only_on_execute(self):
        conference = self.conference
        self.assertTrue(conference.FACTORY_HTML.is_file())
        self.assertNotEqual(conference.FACTORY_HTML, FACTORY_PATH)
        with patch.object(conference.webbrowser, "open", return_value=True) as launch:
            tool = conference.ChatGPTPytFactory()
            tool.getParameterInfo()
            launch.assert_not_called()
            tool.execute([], None)
            launch.assert_called_once_with(conference.FACTORY_HTML.resolve().as_uri(), new=2)
        self.assertIn(str(conference.FACTORY_HTML), messages[-1])

    def test_file_uri_handles_spaces_and_unicode(self):
        conference = self.conference
        with tempfile.TemporaryDirectory(prefix="uos conference café ") as directory:
            html = Path(directory) / "Factory conférence.html"
            html.write_text("<!doctype html><title>Factory</title>", encoding="utf-8")
            with patch.object(conference, "FACTORY_HTML", html), patch.object(conference.webbrowser, "open", return_value=True) as launch:
                conference.ChatGPTPytFactory().execute([], None)
                launch.assert_called_once_with(html.resolve().as_uri(), new=2)
                self.assertIn("%20", launch.call_args.args[0])
                self.assertIn("%C3%A9", launch.call_args.args[0])

    def test_missing_html_and_browser_failure_report_manual_path(self):
        conference = self.conference
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.html"
            errors = []
            with patch.object(conference, "FACTORY_HTML", missing), patch.object(arcpy, "AddError", errors.append, create=True), patch.object(conference.webbrowser, "open") as launch:
                with self.assertRaisesRegex(RuntimeError, "missing"):
                    conference.ChatGPTPytFactory().execute([], None)
                launch.assert_not_called()
                self.assertIn(str(missing), errors[-1])
        for effect in (False, OSError("browser unavailable")):
            errors = []
            options = {"side_effect": effect} if isinstance(effect, Exception) else {"return_value": effect}
            with patch.object(arcpy, "AddError", errors.append, create=True), patch.object(conference.webbrowser, "open", **options):
                with self.assertRaisesRegex(RuntimeError, "Open this file manually"):
                    conference.ChatGPTPytFactory().execute([], None)
                self.assertIn(str(conference.FACTORY_HTML), errors[-1])

    def test_missing_original_toolbox_reports_dependency(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(self.conference, "ROOT", Path(directory)):
            with self.assertRaisesRegex(RuntimeError, "needs the original toolbox"):
                self.conference._load_standard_toolbox()

    def test_inherited_build_and_merge_export_complete_suite(self):
        conference = self.conference
        with tempfile.TemporaryDirectory(prefix="uos-conference-export-") as directory:
            built, merged = Path(directory) / "built.zip", Path(directory) / "merged.zip"
            tool = conference.BuildExplorerSuite()
            params = tool.getParameterInfo()
            params[0].value, params[1].value = "/fake/Fixture.gdb", str(built)
            params[6].value, params[8].value, params[9].value = 1, 2, 200
            tool.execute(params, None)
            merger = conference.MergeExistingExplorer()
            merge_params = merger.getParameterInfo()
            merge_params[0].value, merge_params[1].value = str(built), str(merged)
            merger.execute(merge_params, None)
            for file in (built, merged):
                with zipfile.ZipFile(file) as archive:
                    self.assertIsNone(archive.testzip())
                    for name in ("index.html", "gdb/index.html", "online/index.html", "launcher/satellites.js"):
                        self.assertIn(name, archive.namelist())
                    self.assertNotIn("data-gdb-import-shell", archive.read("gdb/index.html").decode())
                    self.assertIn("gdb/assets/toolbox.svg", archive.namelist())

    def test_original_sources_unchanged(self):
        for path, before in ORIGINAL_HASHES.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
