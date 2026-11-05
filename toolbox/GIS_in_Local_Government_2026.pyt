# -*- coding: utf-8 -*-
"""Six conference entry points; keep the complete explorer-suite-v2 folder together.

The existing Conference toolbox supplies the local Factory and GDB tools. This
additional toolbox leaves both earlier toolboxes and their companion files intact.
"""
import importlib.machinery
import importlib.util
from pathlib import Path
import sys
import webbrowser

import arcpy


ROOT = Path(__file__).resolve().parent


def _load_conference_toolbox():
    path = ROOT / "UOS_Explorer_Suite_Conference_Edition.pyt"
    if not path.is_file():
        raise RuntimeError(
            "GIS in Local Government 2026 needs the Conference toolbox beside it: {}. "
            "Keep the complete GDB Explorer installation folder together.".format(path)
        )
    loader = importlib.machinery.SourceFileLoader("_gis_local_government_2026_conference", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    try:
        loader.exec_module(module)
    except Exception:
        sys.modules.pop(loader.name, None)
        raise
    return module


_conference = _load_conference_toolbox()


class Toolbox:
    def __init__(self):
        self.label = "GIS in Local Government 2026"
        self.alias = "gis_local_government_2026"
        self.tools = [
            GeoGlyph,
            ChatGPTPytFactory,
            GDBArcGISOnlineExplorer,
            CreateGDBExplorerFile,
            UpdateGDBExplorerFile,
            ViewsAndVistas,
        ]


class _OpenWebsite:
    def __init__(self):
        self.description = "Open {} in your default browser: {}".format(self.title, self.url)
        self.canRunInBackground = False

    def getParameterInfo(self):
        return []

    def isLicensed(self):
        return True

    def execute(self, parameters, messages):
        try:
            opened = webbrowser.open(self.url, new=2)
            if not opened:
                raise RuntimeError("The default browser did not accept the request.")
        except Exception as error:
            message = "Could not open {}. Open this URL manually: {}".format(self.title, self.url)
            arcpy.AddError(message)
            raise RuntimeError(message) from error
        arcpy.AddMessage("Opened {}: {}".format(self.title, self.url))


class GeoGlyph(_OpenWebsite):
    label = "1. GeoGlyph"
    title = "GeoGlyph — GIS in Local Government 2026"
    url = "https://frakntoastr.github.io/geoglyph-locate-2026/"


class ChatGPTPytFactory(_conference.ChatGPTPytFactory):
    def __init__(self):
        super().__init__()
        self.label = "2. ChatGPT Pyt Factory"


class GDBArcGISOnlineExplorer(_OpenWebsite):
    label = "3. GDB & ArcGIS Online Explorer"
    title = "GDB & ArcGIS Online Explorer"
    url = "https://frakntoastr.github.io/UOS-ArcGIS-Explorer/"


class CreateGDBExplorerFile(_conference.BuildExplorerSuite):
    def __init__(self):
        super().__init__()
        self.label = "4. Create GDB Explorer File"


class UpdateGDBExplorerFile(_conference.MergeExistingExplorer):
    def __init__(self):
        super().__init__()
        self.label = "5. Update GDB Explorer File"


class ViewsAndVistas(_OpenWebsite):
    label = "6. Views & Vistas · Adelaide Park Lands"
    title = "Views & Vistas · Adelaide Park Lands"
    url = "https://frakntoastr.github.io/adelaide-views-vistas-panorama-explorer/"
