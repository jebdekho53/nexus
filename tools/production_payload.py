"""Explicit Windows production payload selection; source checkout stays untouched."""
from pathlib import Path
from collections import Counter
import hashlib,zipfile
ROOT=Path(__file__).resolve().parent.parent
ROOTS=['.runtime','src','vendor','resources','package.json','Matrix.cmd']
UPDATE_ROOTS=['src','resources','vendor/package.json','package.json','Matrix.cmd']
FOREIGN_TLS={'index','index-mac','index-freebsd','index-mac-arm64','index-arm64','index-arm'}
def exclusion(relative):
    p=Path(relative);parts=p.parts;name=p.name
    if any(x in {'.git','__pycache__','.cache','.pytest_cache'} for x in parts):return 'development caches'
    if parts[:3]==('src','main','generated'):return 'archived interpreter definitions'
    if parts[:2]==('src','renderer') and (name.endswith(('.map','.tsbuildinfo'))):return 'source maps'
    if parts[:1]==('resources',) and name.endswith(('.icns','.dmg','.dylib','.so')):return 'non-Windows resources'
    if parts[:2]==('.runtime','resources') and name.endswith(('.icns','.dmg','.dylib','.so')):return 'non-Windows runtime resources'
    if parts[:2]==('.runtime','locales') and name not in {'en-US.pak','en-GB.pak','hi.pak'}:return 'unused Electron UI translations'
    if 'node_modules' in parts:
        if 'cycletls' in parts and name in FOREIGN_TLS:return 'non-Windows CycleTLS binaries'
        if any(x in {'test','tests','__tests__','example','examples','docs','.github','coverage'} for x in parts):return 'dependency tests/examples/docs'
        if name.endswith(('.map','.tsbuildinfo','.md')) and not name.lower().startswith(('license','notice','copying','copyright')):return 'dependency development metadata'
        if name.endswith('.d.ts'):return 'TypeScript declaration files'
        if any(x in {'build','Release'} for x in parts) and name.endswith(('.obj','.pdb','.ilk','.tlog')):return 'native build intermediates'
    return None
def candidates(updater=False):
    for name in UPDATE_ROOTS if updater else ROOTS:
        base=ROOT/name
        for file in [base] if base.is_file() else sorted(base.rglob('*')):
            if file.is_file():yield file,file.relative_to(ROOT)
def files(updater=False):
    for file,relative in candidates(updater):
        if not exclusion(relative):yield file,relative
def validate(updater=False):
    selected={relative.as_posix() for _,relative in files(updater)}
    required={'src/main/index.cjs','src/main/compiled/index.cjs','src/main/compiled/meta.cjs','src/preload/matrix.js','src/renderer/controller.html','src/renderer/matrix-visual.css','resources/data/stations.json','resources/data/trains.json','resources/icon.png','resources/matrix.ico','package.json','Matrix.cmd'}
    if not updater:required|={'.runtime/electron.exe','.runtime/LICENSES.chromium.html','vendor/node_modules/cycletls/dist/index.exe'}
    missing=required-selected
    if missing:raise RuntimeError('Required production files missing: '+', '.join(sorted(missing)))
    if any(p.startswith(('test/','src/main/generated/')) or p.endswith(('.dmg','.icns','.dylib')) for p in selected):raise RuntimeError('Development or non-Windows payload detected')
    return selected
def report(updater=False):
    reasons=Counter();included=excluded=0;count=0;largest=[]
    for file,relative in candidates(updater):
        size=file.stat().st_size;reason=exclusion(relative)
        if reason:excluded+=size;reasons[reason]+=size
        else:included+=size;count+=1;largest.append((size,str(relative)))
    tests=sum(p.stat().st_size for p in (ROOT/'test').rglob('*') if p.is_file())
    return {'mode':'updater' if updater else 'setup','files':count,'includedBytes':included,'excludedBytes':excluded+tests,'excludedReasons':dict(reasons)|{'test harness not included':tests},'largestIncluded':[{'path':p,'bytes':n} for n,p in sorted(largest,reverse=True)[:8]],'browserEngine':'separate verified on-demand download','installerBuilt':False}
def cleanup_manifest(version):
    """Hash-match obsolete shipped files; never delete unknown user data."""
    records=set();current={p.as_posix() for _,p in files()}
    for archive in sorted((ROOT.parent/'matrix-build').glob('Matrix-Setup-*.exe')):
        if archive.name=='Matrix-Setup-'+version+'.exe':continue
        try:
            with zipfile.ZipFile(archive) as z:
                for item in z.infolist():
                    name=item.filename
                    if name.endswith('/') or name in current:continue
                    if name.startswith('test/') or exclusion(Path(name)):
                        if not name.startswith(('test/','src/main/generated/','vendor/node_modules/','.runtime/locales/','resources/','.runtime/resources/')):continue
                        if '|' in name or '\n' in name or '..' in Path(name).parts:continue
                        records.add((name,hashlib.sha256(z.read(item)).hexdigest()))
        except zipfile.BadZipFile:continue
    return ''.join(name+'|'+digest+'\n' for name,digest in sorted(records))
