"""Exercise the actual Windows extractor against relocated and damaged ZIPs."""
import argparse, hashlib, json, subprocess, tempfile, zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('installer', type=Path)
parser.add_argument('--install-target', type=Path)
args = parser.parse_args()
installer = args.installer.resolve()
root = Path(__file__).resolve().parent.parent
diagnostics = root / 'diagnostics'
diagnostics.mkdir(exist_ok=True)
data = installer.read_bytes()
with zipfile.ZipFile(installer) as archive:
    first = min(entry.header_offset for entry in archive.infolist())
    version = json.loads(archive.read('package.json'))['version']

def verify(archive, expected=0):
    result = subprocess.run([str(installer), '/S', '/verify', '/archive=' + str(archive)])
    assert result.returncode == expected, (archive.name, result.returncode, expected)

with tempfile.TemporaryDirectory(prefix='installer-payload-', dir=diagnostics) as folder:
    folder = Path(folder)
    verify(installer)
    wrapped = folder / 'wrapped.exe'
    # Preserve the executable PE sections while relocating its appended archive.
    wrapped.write_bytes(data[:first] + b'wrapper-padding' * 10000 + data[first:] + b'download-trailer-25-bytes!')
    verify(wrapped)
    truncated = folder / 'truncated.exe'
    truncated.write_bytes(data[:-128])
    verify(truncated, 1)
    report = {'version': version, 'normalPayload': True, 'relocatedPayload': True, 'truncatedRejected': True}
    if args.install_target:
        target = args.install_target.resolve()
        runtime = target / '.runtime/electron.exe'
        before = hashlib.sha256(runtime.read_bytes()).hexdigest()
        marker = target / 'diagnostics/installer-preservation-marker.json'
        marker.parent.mkdir(exist_ok=True)
        marker.write_text('{"preserve":"saved-profile-fixture"}')
        marker_before = marker.read_bytes()
        result = subprocess.run([str(wrapped), '/S', '/nolaunch', '/noshortcuts', '/target=' + str(target)])
        assert result.returncode == 0
        assert json.loads((target / 'package.json').read_text())['version'] == version
        assert hashlib.sha256(runtime.read_bytes()).hexdigest() == before
        assert marker.read_bytes() == marker_before
        report.update(wrappedExeInstall=True, runtimePreserved=True, savedMarkerPreserved=True)
    (diagnostics / 'installer-payload-test.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
