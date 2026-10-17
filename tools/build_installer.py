"""Build Matrix-Setup-<version>.exe: a small C# installer stub with the app payload (ZIP) appended."""
import hashlib, json, os, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IS_UPDATE = '--updater' in sys.argv
ARGS = [arg for arg in sys.argv[1:] if arg != '--updater']
OUT = Path(ARGS[0]) if ARGS else ROOT.parent / 'matrix-build'
# Compile src/ts -> build/ts first; the payload must carry build/ts because the migrated modules load it at run time.
subprocess.run(['node', str(ROOT / 'scripts' / 'ensure-ts-build.cjs')], check=True)
if not (ROOT / 'build' / 'ts').is_dir():
    raise SystemExit('build/ts is missing; run `npm install` and `npm run build:ts` before building the installer.')
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
(ROOT / 'src/renderer/matrix-build.js').write_text(
    'globalThis.MATRIX_BUILD=Object.freeze(' + json.dumps({'name': 'Matrix', 'version': VERSION}, separators=(',', ':')) + ');\n',
    encoding='utf-8', newline='\n')
INCLUDE = ['.runtime', 'src', 'build', 'scripts/ensure-ts-build.cjs', 'vendor', 'resources', 'package.json', 'Matrix.cmd', 'test']
if IS_UPDATE:
    INCLUDE = ['src', 'build', 'scripts/ensure-ts-build.cjs', 'resources', 'vendor/package.json', 'package.json', 'Matrix.cmd']
SKIP_NAMES = {'__pycache__', '.git'}
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
with zipfile.ZipFile(exe, 'a', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for item in INCLUDE:
        base = ROOT / item
        files = [base] if base.is_file() else [p for p in base.rglob('*') if p.is_file()]
        for p in files:
            if SKIP_NAMES & set(p.parts):
                continue
            z.write(p, p.relative_to(ROOT).as_posix())
            count += 1
digest = hashlib.sha256(exe.read_bytes()).hexdigest()
(OUT / (exe.name + '.sha256')).write_text(f'{digest}  {exe.name}\n')
print(f'{count} files; {exe} {exe.stat().st_size:,} bytes; sha256 {digest}')
