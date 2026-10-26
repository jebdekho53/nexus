"""Build Matrix-Setup-<version>.exe: a small C# installer stub with the app payload (ZIP) appended."""
import hashlib, json, os, subprocess, sys, zipfile
from pathlib import Path
from production_payload import files as production_files,report as payload_report,validate as validate_payload,cleanup_manifest

ROOT = Path(__file__).resolve().parent.parent
IS_UPDATE = '--updater' in sys.argv
validate_payload(IS_UPDATE)
if '--plan' in sys.argv:
    print(json.dumps(payload_report(IS_UPDATE),indent=2))
    sys.exit(0)
ARGS = [arg for arg in sys.argv[1:] if arg != '--updater']
OUT = Path(ARGS[0]) if ARGS else ROOT.parent / 'matrix-build'
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
CLEANUP=cleanup_manifest(VERSION)
(ROOT / 'src/renderer/matrix-build.js').write_text(
    'globalThis.MATRIX_BUILD=Object.freeze(' + json.dumps({'name': 'Matrix', 'version': VERSION}, separators=(',', ':')) + ');\n',
    encoding='utf-8', newline='\n')
CSC = Path(os.environ.get('WINDIR', r'C:\Windows')) / 'Microsoft.NET' / 'Framework64' / 'v4.0.30319' / 'csc.exe'
OUT.mkdir(parents=True, exist_ok=True)
exe = OUT / f'Matrix-{"Updater" if IS_UPDATE else "Setup"}-{VERSION}.exe'
if exe.exists():
    exe.unlink()
(OUT / 'AssemblyInfo.cs').write_text(
    f'[assembly: System.Reflection.AssemblyVersion("{VERSION}")]\n'
    f'[assembly: System.Reflection.AssemblyFileVersion("{VERSION}")]\n'
    f'[assembly: System.Reflection.AssemblyInformationalVersion("{VERSION}")]\n')
subprocess.run([
    str(CSC), '/nologo', '/target:winexe', '/optimize+', *(['/define:MATRIX_UPDATE'] if IS_UPDATE else []), f'/out:{exe}', f'/win32icon:{ROOT / "resources" / "matrix.ico"}',
    '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
    str(Path(__file__).with_name('installer_stub.cs')), str(OUT / 'AssemblyInfo.cs')], check=True)
count = 0
# Appending to a non-ZIP file makes Python write absolute offsets, which .NET ZipFile.OpenRead(exe) can read.
with zipfile.ZipFile(exe, 'a', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for file,relative in production_files(IS_UPDATE):
        z.write(file,relative.as_posix())
        count += 1
    z.writestr('matrix-distribution.json',json.dumps({'mode':'production','runtime':'compiled','browserEngine':'on-demand','version':VERSION}))
    z.writestr('matrix-cleanup.txt',CLEANUP)
digest = hashlib.sha256(exe.read_bytes()).hexdigest()
(OUT / (exe.name + '.sha256')).write_text(f'{digest}  {exe.name}\n')
print(f'{count} files; {exe} {exe.stat().st_size:,} bytes; sha256 {digest}')
