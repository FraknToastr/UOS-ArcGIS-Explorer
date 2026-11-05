# -*- coding: utf-8 -*-
"""Conference entry points; the standard v2.1 toolbox remains the source of its tools."""
import importlib.machinery
import importlib.util
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
            "Extract the complete suite folder.".format(path)
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
        self.label = "UOS Explorer Suite — Conference Edition"
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
                "Extract the complete suite folder before running this tool."
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
    """Use the original Build tool without changing its parameters or execution."""


class MergeExistingExplorer(_standard.MergeExistingExplorer):
    """Use the original Merge tool without changing its parameters or execution."""
