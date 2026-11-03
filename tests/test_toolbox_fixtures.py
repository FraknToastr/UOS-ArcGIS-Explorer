"""Synthetic ArcPy test adapter; never used by the production toolbox."""
import datetime
import json
import os
from pathlib import Path
import sys
import tempfile
import types
OUTPUT=Path(os.environ.get("UOS_TOOLBOX_TEST_OUTPUT",tempfile.mkdtemp(prefix="uos-v2-toolbox-"))).resolve()
OUTPUT.mkdir(parents=True,exist_ok=True)
NS=types.SimpleNamespace
class Parameter:
    def __init__(self,**kw):
        self.__dict__.update(kw);self.value=None;self.filter=NS(list=[]);self.error=None
    @property
    def valueAsText(self):return None if self.value is None else str(self.value)
    def setErrorMessage(self,text):self.error=text
class Cursor:
    def __init__(self,path,fields,**kw):self.fields=fields;self.path=path
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def __iter__(self):
        if self.path.endswith('__ATTACH'):
            for i in range(85):
                blob=b'\x89PNG\r\n\x1a\n'+b'x'*20 if i!=84 else b'x'*(2*1024*1024)
                record={'ATTACHMENTID':i+1,'REL_OBJECTID':1 if i<45 else i+1,'ATT_NAME':f'Photo {i}.png','CONTENT_TYPE':'image/png','DATA':memoryview(blob)}
                yield tuple(record[f] for f in self.fields)
        else:
            n=0 if self.path.endswith('Empty') else (2300 if self.path.endswith('Unique') else 380)
            for i in range(n):
                record={'OBJECTID':i+1,'NAME':f'Bench <{i}> café','GLOBALID':'{GUID-%d}'%i,'SHAPE@':NS(pointCount=1,JSON=json.dumps({'x':138.6+i*.00001,'y':-34.92})),'OID@':i+1}
                record.update({f'FIELD{j}':f'value {i%5}' for j in range(32)})
                record['FIELD0']=float('nan') if i==0 else f'value {i%5}'
                if self.path.endswith('Unique'):record['NAME']=f'unique-{i}'
                yield tuple(record.get(f) for f in self.fields)
def field(name,typ='String'):
    return NS(name=name,aliasName=name+' alias',type=typ,length=255,precision=0,scale=0,isNullable=True,required=False,domain='',defaultValue=None)
def fields(path):
    if path.endswith('__ATTACH'):return [field('ATTACHMENTID','OID'),field('REL_OBJECTID','Integer'),field('ATT_NAME'),field('CONTENT_TYPE'),field('DATA','Blob')]
    return [field('OBJECTID','OID'),field('NAME'),field('GLOBALID','GlobalID')]+[field(f'FIELD{j}') for j in range(32)]
def describe(path):
    table=path.endswith('Empty') or path.endswith('__ATTACH')
    return NS(shapeType=None if table else 'Point',dataType='Table' if table else 'FeatureClass',datasetType='Table' if table else 'FeatureClass',catalogPath=path,hasOID=True,OIDFieldName='OBJECTID',shapeFieldName='SHAPE',displayField='NAME',workspaceType='LocalDatabase',workspaceFactoryProgID='FileGDB',spatialReference=NS(name='WGS 84',factoryCode=4326,type='Geographic',linearUnitName=None,angularUnitName='Degree'),extent=NS(XMin=138.6,YMin=-34.92,XMax=138.61,YMax=-34.91))
messages=[]
arcpy=types.ModuleType('arcpy');arcpy.Parameter=Parameter;arcpy.Describe=describe
arcpy.env=NS(workspace='original-workspace',overwriteOutput=True)
arcpy.AddMessage=messages.append;arcpy.AddWarning=messages.append;arcpy.ListFields=fields;arcpy.ListIndexes=lambda p:[]
def metadata_for_path(path):
    name=Path(path).name
    return NS(title='Title for '+name,tags='test, offline, '+name,
              summary='Summary for '+name+' — café & accessible public spaces.',
              description='<div><p>Rich description for <strong>'+name+'</strong>.</p><p>'+('Detailed accessibility content, walking distances and amenities. '*40)+'</p><ul><li>First item</li><li>Second item</li></ul></div>',
              credits='Spatial team — credits for '+name,accessConstraints='Access constraints for '+name)
arcpy.metadata=NS(Metadata=metadata_for_path)
arcpy.SpatialReference=lambda wkid:wkid
arcpy.da=NS(SearchCursor=Cursor,Walk=lambda p,**kw:iter([(p,[],['Benches','Benches__ATTACH','Empty']),(os.path.join(p,'Parks'),[],['Trees'])]),ListSubtypes=lambda p:{})
arcpy.management=NS(GetCount=lambda p:[0 if p.endswith('Empty') else 380])
sys.modules['arcpy']=arcpy

def decode_script(archive,path):
    raw=archive.read(path).decode("utf-8")
    if path=="data/catalogue.js":return json.loads(raw[len("window.GDBCatalogue="):-2])
    return json.loads(raw[len("GDBChunks.receive(document.currentScript,"):-3])
