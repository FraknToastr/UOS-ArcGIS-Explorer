"""Sync the copied Pro runtime and generate SHA256 installation manifests."""
from pathlib import Path
import hashlib
import json
import shutil
import argparse
import zipfile

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--zip',type=Path)
args=parser.parse_args()
def files(folder):
    return [p for p in sorted(folder.rglob('*')) if p.is_file() and not any(x in p.parts for x in ('__pycache__','node_modules','.cache')) and p.suffix!='.pyc']
def manifest(folder,name,version,items):
    value={'version':version,'sha256':{p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in items}}
    (folder/name).write_text(json.dumps(value,indent=2)+'\n')
gdb=root/'gdb'
manifest(gdb,'asset-manifest.json','22.7',[p for p in files(gdb) if p.name!='asset-manifest.json'])
dest=root/'toolbox/engine/gdb_explorer_assets'
shutil.copytree(gdb,dest,dirs_exist_ok=True)
items=[root/'index.html',root/'toolbox/engine/gdb_exporter.py']
for directory in ('launcher','assets','vendor','online','gdb'):
    items+=files(root/directory)
manifest(root,'suite-manifest.json','2.1',items)
for p in (root/'suite-manifest.json',dest/'asset-manifest.json',gdb/'asset-manifest.json'):
    value=json.loads(p.read_text())
    assert all(hashlib.sha256((p.parent/n).read_bytes()).hexdigest()==h for n,h in value['sha256'].items())
print('Runtime synchronized; all three manifests verified.')
if args.zip:
    with zipfile.ZipFile(args.zip,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for p in files(root):
            if p.suffix!='.zip':archive.write(p,'explorer-suite-v2/'+p.relative_to(root).as_posix())
    with zipfile.ZipFile(args.zip) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(set(archive.namelist()))
    print(args.zip,hashlib.sha256(args.zip.read_bytes()).hexdigest())
