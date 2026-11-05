# -*- coding: utf-8 -*-
"""GDB Explorer entry points with the original exporting and updating behaviour."""
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import sys
import webbrowser

import arcpy


ROOT = Path(__file__).resolve().parent
FACTORY_HTML = ROOT / "ChatGPT_PYT_Factory_Conference_Edition.html"


def _load_standard_toolbox():
    path = ROOT / "UOS_Explorer_Suite_v2_1.pyt"
    if not path.is_file():
        raise RuntimeError(
            "Conference Edition needs the original toolbox beside it: {}. "
            "Extract the complete GDB Explorer installation folder.".format(path)
        )
    loader = importlib.machinery.SourceFileLoader("_uos_conference_standard_v2_1", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    try:
        loader.exec_module(module)
    except Exception:
        sys.modules.pop(loader.name, None)
        raise
    return module


_standard = _load_standard_toolbox()


class Toolbox:
    def __init__(self):
        self.label = "GDB Explorer"
        self.alias = "uos_explorer_suite_conference"
        self.tools = [ChatGPTPytFactory, BuildExplorerSuite, MergeExistingExplorer]


class ChatGPTPytFactory:
    def __init__(self):
        self.label = "ChatGPT Pyt Factory"
        self.description = (
            "Open the Conference Edition of ChatGPT Pyt Factory in your default browser. "
            "The local HTML opens when you run this tool."
        )
        self.canRunInBackground = False

    def getParameterInfo(self):
        return []

    def isLicensed(self):
        return True

    def execute(self, parameters, messages):
        path = FACTORY_HTML.resolve()
        if not path.is_file():
            message = (
                "The Conference Factory HTML is missing: {}. "
                "Extract the complete GDB Explorer installation folder before running this tool."
            ).format(path)
            arcpy.AddError(message)
            raise RuntimeError(message)
        try:
            opened = webbrowser.open(path.as_uri(), new=2)
            if not opened:
                raise RuntimeError("The default browser did not accept the request.")
        except Exception as error:
            message = "Could not open ChatGPT Pyt Factory. Open this file manually: {}".format(path)
            arcpy.AddError(message)
            raise RuntimeError(message) from error
        arcpy.AddMessage("Opened ChatGPT Pyt Factory — Conference Edition: {}".format(path))


class BuildExplorerSuite(_standard.BuildExplorerSuite):
    """Use the original exporter with GDB Explorer File presentation."""

    def __init__(self):
        super().__init__()
        self.label = "Create GDB Explorer File"
        self.description = (
            "Create a GDB Explorer File from a geodatabase. "
            "The file uses ZIP format and includes GDB Explorer and ArcGIS Online Explorer."
        )

    def _default_output_path(self, input_gdb):
        original = super()._default_output_path(input_gdb)
        return original.replace("_UOS_Explorer.zip", "_GDB_Explorer_File.zip")

    def getParameterInfo(self):
        parameters = super().getParameterInfo()
        parameters[1].displayName = "Output GDB Explorer File"
        parameters[7].displayName = "Explorer page title"
        parameters[7].value = "GDB Explorer"
        return parameters

    def updateMessages(self, parameters):
        super().updateMessages(parameters)
        output = parameters[1].valueAsText
        if output and os.path.splitext(output)[1].lower() != ".zip":
            parameters[1].setErrorMessage("Choose an output GDB Explorer File with a .zip extension.")


class MergeExistingExplorer(_standard.MergeExistingExplorer):
    """Use the original updater with GDB Explorer File presentation."""

    def __init__(self):
        super().__init__()
        self.label = "Update GDB Explorer File"
        self.description = (
            "Update an existing GDB Explorer File with the current explorer screens. "
            "The input file remains unchanged."
        )

    def _default(self, source):
        name = str(source or "Geodatabase").rstrip("\\/").replace("\\", "/").rsplit("/", 1)[-1]
        name = os.path.splitext(name)[0]
        for suffix in ("_GDB_Explorer_File_Updated", "_GDB_Explorer_File", "_UOS_Explorer", "_GDB_Explorer"):
            if name.lower().endswith(suffix.lower()):
                name = name[:-len(suffix)]
                break
        return str(ROOT / ((name or "Geodatabase") + "_GDB_Explorer_File_Updated.zip"))

    def getParameterInfo(self):
        parameters = super().getParameterInfo()
        parameters[0].displayName = "Input GDB Explorer File"
        parameters[1].displayName = "Output GDB Explorer File"
        return parameters

    def updateMessages(self, parameters):
        for parameter in parameters:
            if parameter.valueAsText and not parameter.valueAsText.lower().endswith(".zip"):
                parameter.setErrorMessage("Choose a GDB Explorer File with a .zip extension.")
        source, output = parameters[0].valueAsText, parameters[1].valueAsText
        if source and output and os.path.normcase(os.path.realpath(source)) == os.path.normcase(os.path.realpath(output)):
            parameters[1].setErrorMessage("Choose an output GDB Explorer File different from the input file.")
