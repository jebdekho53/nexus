"""Extract the verified public engine into a Matrix-owned runtime and portable ZIP."""
from pathlib import Path
import hashlib,json,os,shutil,zipfile,ctypes,re
from ctypes import wintypes
root=Path(__file__).resolve().parent.parent
build=root.parent/'matrix-browser-build'
manifest=json.loads((build/'source-manifest.json').read_text())
archive=build/'ShardX-Windows.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['sha256'],'Archive changed'
target=Path(os.environ['LOCALAPPDATA'])/'Matrix'/'Browser'
target.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None,'Corrupt engine archive'
    for entry in z.infolist():
        parts=Path(entry.filename).parts
        assert parts and parts[0]=='ShardX-Windows' and '..' not in parts and not Path(entry.filename).is_absolute(),'Unexpected archive path'
    z.extractall(target)
assert (target/'ShardX-Windows/chrome.exe').is_file()
exe=target/'ShardX-Windows/chrome.exe'
original=exe.read_bytes()
text=original.decode('utf-8',errors='ignore')
start=text.index('<assembly');end=text.index('</assembly>',start)+len('</assembly>')
original_manifest=text[start:end]
fixed_manifest=re.sub(r'<dependency><dependentAssembly><assemblyIdentity type="win32" name="156\.0\.8078\.48" version="156\.0\.8078\.48" language="\*"/></dependentAssembly></dependency>','',original_manifest)
assert fixed_manifest!=original_manifest,'Upstream launch manifest changed; inspect before rebuilding'
assert 'requestedExecutionLevel level="asInvoker"' in fixed_manifest and 'Microsoft.Windows.Common-Controls' in fixed_manifest
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.BeginUpdateResourceW.argtypes=[wintypes.LPCWSTR,wintypes.BOOL];kernel.BeginUpdateResourceW.restype=wintypes.HANDLE
kernel.UpdateResourceW.argtypes=[wintypes.HANDLE,ctypes.c_void_p,ctypes.c_void_p,wintypes.WORD,ctypes.c_void_p,wintypes.DWORD]
kernel.EndUpdateResourceW.argtypes=[wintypes.HANDLE,wintypes.BOOL]
handle=kernel.BeginUpdateResourceW(str(exe),False);assert handle,ctypes.get_last_error()
data=fixed_manifest.encode('utf-8');buffer=ctypes.create_string_buffer(data)
ok=kernel.UpdateResourceW(handle,ctypes.c_void_p(24),ctypes.c_void_p(1),1033,buffer,len(data))
error=ctypes.get_last_error();assert kernel.EndUpdateResourceW(handle,not ok),ctypes.get_last_error();assert ok,error
manifest['packagingFix']={'kind':'Windows launch manifest resource','change':'Remove broken private versioned chrome_elf assembly dependency; use bundled root chrome_elf.dll. UAC/asInvoker and Common Controls retained.','originalExeSha256':hashlib.sha256(original).hexdigest(),'packagedExeSha256':hashlib.sha256(exe.read_bytes()).hexdigest()}
shutil.copy2(build/'LICENSE-ShardBrowser.txt',target/'LICENSE-ShardBrowser.txt')
(target/'source-manifest.json').write_text(json.dumps(manifest,indent=2))
(target/'Launch-Matrix-Browser.cmd').write_text('@echo off\nstart "Matrix Browser" "%~dp0ShardX-Windows\\chrome.exe" --user-data-dir="%LOCALAPPDATA%\\Matrix\\BrowserProfile" --no-first-run\n')
(target/'README.txt').write_text('Matrix Browser runtime\nBased on the public ProxyShard ShardBrowser engine. Original upstream notices are retained.\nLaunch-Matrix-Browser.cmd uses an independent Matrix profile.\nFor Matrix app detection, extract this package into %LOCALAPPDATA%\\Matrix\\Browser.\nNo TS installation or TS user profile is required.\n')
package=build/('Matrix-Browser-'+manifest['version']+'-win-x64.zip')
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for folder in [target/'ShardX-Windows']:
        for file in folder.rglob('*'):
            if file.is_file():z.write(file,file.relative_to(target).as_posix())
    for name in ['LICENSE-ShardBrowser.txt','source-manifest.json','Launch-Matrix-Browser.cmd','README.txt']:z.write(target/name,name)
    ready=target/'runtime-ready.json'
    if ready.exists() and json.loads(ready.read_text()).get('exeSha256')==manifest['packagingFix']['packagedExeSha256']:
        z.write(ready,'runtime-ready.json')
digest=hashlib.sha256(package.read_bytes()).hexdigest()
(build/(package.name+'.sha256')).write_text(digest+'  '+package.name+'\n')
print(json.dumps({'installed':str(target),'package':str(package),'bytes':package.stat().st_size,'sha256':digest}))
