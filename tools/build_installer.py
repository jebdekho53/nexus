"""Build Matrix-Setup-<version>.exe: a small C# installer stub with the app payload (ZIP) appended."""
import hashlib, json, os, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'matrix-build'
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
INCLUDE = ['.runtime', 'src', 'vendor', 'resources', 'package.json', 'Matrix.cmd', 'test']
SKIP_NAMES = {'__pycache__', '.git'}
CSC = Path(os.environ.get('WINDIR', r'C:\Windows')) / 'Microsoft.NET' / 'Framework64' / 'v4.0.30319' / 'csc.exe'
OUT.mkdir(parents=True, exist_ok=True)
exe = OUT / f'Matrix-Setup-{VERSION}.exe'
if exe.exists():
    exe.unlink()
(OUT / 'AssemblyInfo.cs').write_text(
    f'[assembly: System.Reflection.AssemblyVersion("{VERSION}")]\n'
    f'[assembly: System.Reflection.AssemblyFileVersion("{VERSION}")]\n'
    f'[assembly: System.Reflection.AssemblyInformationalVersion("{VERSION}")]\n')
subprocess.run([
    str(CSC), '/nologo', '/target:winexe', '/optimize+', f'/out:{exe}', f'/win32icon:{ROOT / "resources" / "matrix.ico"}',
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
