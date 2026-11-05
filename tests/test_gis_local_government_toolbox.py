"""New conference entry points, browser failures and inherited GDB behavior.

Uses the existing synthetic ArcPy adapter; no browser or real geodatabase opens.
"""
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
TOOLBOX_PATH = ROOT / "toolbox/GIS_in_Local_Government_2026.pyt"
FALLBACK_PATHS = [
    ROOT / "toolbox/UOS_Explorer_Suite_v2_1.pyt",
    ROOT / "toolbox/UOS_Explorer_Suite_Conference_Edition.pyt",
    ROOT / "toolbox/ChatGPT_PYT_Factory.html",
    ROOT / "toolbox/ChatGPT_PYT_Factory_Conference_Edition.html",
]
ORIGINAL_HASHES = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in FALLBACK_PATHS}


def load_toolbox(path=TOOLBOX_PATH):
    loader = importlib.machinery.SourceFileLoader("gis_local_government_test_toolbox", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def parameter_contract(tool):
    return [
        {name: getattr(parameter, name, None) for name in
         ("name", "displayName", "datatype", "parameterType", "direction", "valueAsText")}
        for parameter in tool.getParameterInfo()
    ]


class LocalGovernmentToolboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conference = load_toolbox()

    def test_six_numbered_entries_and_unique_alias_without_launching(self):
        with patch("webbrowser.open") as launch:
            module = load_toolbox()
            toolbox = module.Toolbox()
            self.assertEqual(toolbox.label, "GIS in Local Government 2026")
            self.assertEqual([tool().label for tool in toolbox.tools], [
                "1. GeoGlyph",
                "2. ChatGPT Pyt Factory",
                "3. GDB & ArcGIS Online Explorer",
                "4. Create GDB Explorer File",
                "5. Update GDB Explorer File",
                "6. Views & Vistas · Adelaide Park Lands",
            ])
            self.assertEqual(len({tool.__name__ for tool in toolbox.tools}), 6)
            aliases = [toolbox.alias, module._conference.Toolbox().alias,
                       module._conference._standard.Toolbox().alias]
            self.assertEqual(len(set(aliases)), 3)
            for tool in toolbox.tools:
                tool().getParameterInfo()
            launch.assert_not_called()

    def test_website_tools_open_exact_urls_only_when_executed(self):
        module = self.conference
        for cls, url in [
            (module.GeoGlyph, "https://frakntoastr.github.io/geoglyph-locate-2026/"),
            (module.GDBArcGISOnlineExplorer, "https://frakntoastr.github.io/UOS-ArcGIS-Explorer/"),
            (module.ViewsAndVistas, "https://frakntoastr.github.io/adelaide-views-vistas-panorama-explorer/"),
        ]:
            with self.subTest(tool=cls.__name__), patch.object(module.webbrowser, "open", return_value=True) as launch:
                tool = cls()
                self.assertEqual(tool.getParameterInfo(), [])
                self.assertTrue(tool.isLicensed())
                self.assertFalse(tool.canRunInBackground)
                launch.assert_not_called()
                tool.execute([], None)
                launch.assert_called_once_with(url, new=2)
                self.assertIn(url, messages[-1])

    def test_website_failures_report_the_manual_url_and_raise(self):
        module = self.conference
        for cls in (module.GeoGlyph, module.GDBArcGISOnlineExplorer, module.ViewsAndVistas):
            for effect in (False, OSError("browser unavailable")):
                errors = []
                options = {"side_effect": effect} if isinstance(effect, Exception) else {"return_value": effect}
                with self.subTest(tool=cls.__name__, effect=effect), \
                     patch.object(arcpy, "AddError", errors.append, create=True), \
                     patch.object(module.webbrowser, "open", **options) as launch:
                    with self.assertRaisesRegex(RuntimeError, "Open this URL manually"):
                        cls().execute([], None)
                    launch.assert_called_once_with(cls.url, new=2)
                    self.assertEqual(len(errors), 1)
                    self.assertIn(cls.url, errors[0])

    def test_factory_still_opens_the_local_conference_html(self):
        module = self.conference
        factory = module.ChatGPTPytFactory()
        self.assertIs(type(factory).execute, module._conference.ChatGPTPytFactory.execute)
        self.assertEqual(factory.getParameterInfo(), [])
        with patch.object(module.webbrowser, "open", return_value=True) as launch:
            factory.execute([], None)
            launch.assert_called_once_with(module._conference.FACTORY_HTML.resolve().as_uri(), new=2)

    def test_gdb_parameter_defaults_filters_and_validation_are_inherited(self):
        module = self.conference
        for cls, previous in [
            (module.CreateGDBExplorerFile, module._conference.BuildExplorerSuite),
            (module.UpdateGDBExplorerFile, module._conference.MergeExistingExplorer),
        ]:
            with self.subTest(tool=cls.__name__):
                self.assertIs(cls.execute, previous.execute)
                self.assertEqual(parameter_contract(cls()), parameter_contract(previous()))
                tool = cls()
                parameters = tool.getParameterInfo()
                self.assertEqual(parameters[1].filter.list, ["zip"])
                parameters[0].value = "/fake/Parks.gdb" if cls is module.CreateGDBExplorerFile else "/fake/Parks.zip"
                tool.updateParameters(parameters)
                self.assertIn("GDB_Explorer_File", parameters[1].valueAsText)
                parameters[1].value = "/fake/invalid.txt"
                tool.updateMessages(parameters)
                self.assertIn("GDB Explorer File", parameters[1].error)

    def test_numbered_create_and_update_tools_produce_portable_archives(self):
        module = self.conference
        with tempfile.TemporaryDirectory(prefix="gis-conference-export-") as directory:
            built, updated = Path(directory) / "built.zip", Path(directory) / "updated.zip"
            parameters = module.CreateGDBExplorerFile().getParameterInfo()
            parameters[0].value, parameters[1].value = "/fake/Fixture.gdb", str(built)
            parameters[6].value, parameters[8].value, parameters[9].value = 1, 2, 200
            module.CreateGDBExplorerFile().execute(parameters, None)
            before = hashlib.sha256(built.read_bytes()).hexdigest()
            parameters = module.UpdateGDBExplorerFile().getParameterInfo()
            parameters[0].value, parameters[1].value = str(built), str(updated)
            module.UpdateGDBExplorerFile().execute(parameters, None)
            self.assertEqual(hashlib.sha256(built.read_bytes()).hexdigest(), before)
            for file in (built, updated):
                with zipfile.ZipFile(file) as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
                    for name in ("index.html", "gdb/index.html", "online/index.html", "gdb/assets/toolbox.svg"):
                        self.assertIn(name, archive.namelist())

    def test_missing_conference_toolbox_has_an_actionable_error(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(self.conference, "ROOT", Path(directory)):
            with self.assertRaisesRegex(RuntimeError, "Keep the complete GDB Explorer installation folder"):
                self.conference._load_conference_toolbox()

    def test_existing_toolboxes_and_both_factory_variants_are_unchanged(self):
        for path, expected in ORIGINAL_HASHES.items():
            with self.subTest(file=path.name):
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
