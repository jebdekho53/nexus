"""Server patch script to assemble 1.0.14 releases and update control plane."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

RELEASES_DIR = Path('/srv/matrix-releases')
MATRIX_DIR = Path('/srv/matrix')
PATCH_ZIP = Path('/tmp/patch-1.0.14.zip')
EXTRACT_DIR = Path('/tmp/matrix-patch-1014')

if not PATCH_ZIP.exists():
    raise FileNotFoundError(f"Missing {PATCH_ZIP}")

if EXTRACT_DIR.exists():
    shutil.rmtree(EXTRACT_DIR)
EXTRACT_DIR.mkdir(parents=True)

print(f"Extracting {PATCH_ZIP}...")
with zipfile.ZipFile(PATCH_ZIP, 'r') as z:
    z.extractall(EXTRACT_DIR)

patch_files = {p.relative_to(EXTRACT_DIR).as_posix(): p for p in EXTRACT_DIR.rglob('*') if p.is_file()}
print(f"Loaded {len(patch_files)} patch files.")

def patch_pe_zip(base_exe: Path, target_exe: Path, allowed_prefixes=None):
    print(f"Building {target_exe.name} from {base_exe.name}...")
    raw = base_exe.read_bytes()
    idx = raw.find(b'PK\x03\x04')
    if idx == -1:
        raise ValueError(f"No zip header found in {base_exe}")
    stub = raw[:idx]

    tmp_out = target_exe.with_name(target_exe.name + '.tmp')
    tmp_out.write_bytes(stub)

    with zipfile.ZipFile(base_exe, 'r') as src_z, \
         zipfile.ZipFile(tmp_out, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:
        written = set()
        for item in src_z.infolist():
            fn = item.filename
            if fn in patch_files:
                new_data = patch_files[fn].read_bytes()
                new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                new_info.external_attr = item.external_attr
                new_info.compress_type = zipfile.ZIP_DEFLATED
                dst_z.writestr(new_info, new_data)
                written.add(fn)
            else:
                dst_z.writestr(item, src_z.read(item))
                written.add(fn)

        for fn, p in patch_files.items():
            if fn not in written:
                if allowed_prefixes and not any(fn.startswith(pfx) for pfx in allowed_prefixes):
                    continue
                if fn.startswith('services/'):
                    continue
                new_data = p.read_bytes()
                dst_z.writestr(fn, new_data)
                written.add(fn)

    # Test zip validity
    with zipfile.ZipFile(tmp_out, 'r') as test_z:
        bad = test_z.testzip()
        if bad:
            raise RuntimeError(f"Corrupted entry in {tmp_out}: {bad}")

    os.replace(tmp_out, target_exe)
    h = hashlib.sha256(target_exe.read_bytes()).hexdigest()
    sz = target_exe.stat().st_size
    print(f"Created {target_exe.name}: {sz:,} bytes, sha256 {h}")
    return sz, h

def patch_mac_zip(base_zip: Path, target_zip: Path):
    print(f"Building {target_zip.name} from {base_zip.name}...")
    tmp_out = target_zip.with_name(target_zip.name + '.tmp')
    if tmp_out.exists():
        tmp_out.unlink()

    app_prefix = 'Matrix.app/Contents/Resources/app/'

    with zipfile.ZipFile(base_zip, 'r') as src_z, \
         zipfile.ZipFile(tmp_out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:
        written = set()
        for item in src_z.infolist():
            fn = item.filename
            if fn.startswith(app_prefix):
                rel = fn[len(app_prefix):]
                if rel in patch_files:
                    new_data = patch_files[rel].read_bytes()
                    new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                    new_info.external_attr = item.external_attr
                    new_info.compress_type = zipfile.ZIP_DEFLATED
                    dst_z.writestr(new_info, new_data)
                    written.add(rel)
                else:
                    dst_z.writestr(item, src_z.read(item))
                    written.add(rel)
            else:
                dst_z.writestr(item, src_z.read(item))

        for rel, p in patch_files.items():
            if rel not in written and not rel.startswith('services/'):
                fn = app_prefix + rel
                dst_z.writestr(fn, p.read_bytes())
                written.add(rel)

    # Test zip validity
    with zipfile.ZipFile(tmp_out, 'r') as test_z:
        bad = test_z.testzip()
        if bad:
            raise RuntimeError(f"Corrupted entry in {tmp_out}: {bad}")

    os.replace(tmp_out, target_zip)
    h = hashlib.sha256(target_zip.read_bytes()).hexdigest()
    sz = target_zip.stat().st_size
    print(f"Created {target_zip.name}: {sz:,} bytes, sha256 {h}")
    return sz, h

# Build all 4 releases
setup_sz, setup_sha = patch_pe_zip(
    RELEASES_DIR / 'Matrix-Setup-1.0.13.exe',
    RELEASES_DIR / 'Matrix-Setup-1.0.14.exe'
)
updater_sz, updater_sha = patch_pe_zip(
    RELEASES_DIR / 'Matrix-Updater-1.0.13.exe',
    RELEASES_DIR / 'Matrix-Updater-1.0.14.exe',
    allowed_prefixes=['src', 'resources', 'vendor', 'package.json', 'Matrix.cmd']
)
arm64_sz, arm64_sha = patch_mac_zip(
    RELEASES_DIR / 'Matrix-1.0.13-darwin-arm64.zip',
    RELEASES_DIR / 'Matrix-1.0.14-darwin-arm64.zip'
)
x64_sz, x64_sha = patch_mac_zip(
    RELEASES_DIR / 'Matrix-1.0.13-darwin-x64.zip',
    RELEASES_DIR / 'Matrix-1.0.14-darwin-x64.zip'
)

# Write sha256 files
(RELEASES_DIR / 'Matrix-Setup-1.0.14.exe.sha256').write_text(f"{setup_sha}  Matrix-Setup-1.0.14.exe\n")
(RELEASES_DIR / 'Matrix-Updater-1.0.14.exe.sha256').write_text(f"{updater_sha}  Matrix-Updater-1.0.14.exe\n")
(RELEASES_DIR / 'Matrix-1.0.14-darwin-arm64.zip.sha256').write_text(f"{arm64_sha}  Matrix-1.0.14-darwin-arm64.zip\n")
(RELEASES_DIR / 'Matrix-1.0.14-darwin-x64.zip.sha256').write_text(f"{x64_sha}  Matrix-1.0.14-darwin-x64.zip\n")

# Update manifest
manifest = {
    'version': '1.0.14',
    'name': 'Matrix',
    'setup': None,
    'distribution': 'cross-platform',
    'notes': 'Side-by-side multi-form window tiling, PNR privacy masking (last 3 digits), overhauled Cyber Emerald Status UI, illuminated controller dock toolbar icons, and streamlined tools window.',
    'offlineSetup': {
        'url': '/downloads/Matrix-Setup-1.0.14.exe',
        'bytes': setup_sz,
        'sha256': setup_sha
    },
    'updaterExe': {
        'url': '/downloads/Matrix-Updater-1.0.14.exe',
        'bytes': updater_sz,
        'sha256': updater_sha
    },
    'macArm64': {
        'url': '/downloads/Matrix-1.0.14-darwin-arm64.zip',
        'bytes': arm64_sz,
        'sha256': arm64_sha
    },
    'macX64': {
        'url': '/downloads/Matrix-1.0.14-darwin-x64.zip',
        'bytes': x64_sz,
        'sha256': x64_sha
    }
}
shutil.copy2(RELEASES_DIR / 'manifest.json', RELEASES_DIR / 'manifest-before-1.0.14.json')
(RELEASES_DIR / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print("Updated /srv/matrix-releases/manifest.json successfully.")

# Update control plane
cp_src = EXTRACT_DIR / 'services' / 'control-plane'
if cp_src.exists():
    for f in ['server.cjs', 'package.json', 'desktop-services.cjs', 'desktop-version-policy.cjs', 'licensing.cjs']:
        src_f = cp_src / f
        if src_f.exists():
            shutil.copy2(src_f, MATRIX_DIR / f)
            print(f"Updated /srv/matrix/{f}")
    for sub in ['admin', 'assets', 'app']:
        sub_src = cp_src / sub
        if sub_src.exists():
            sub_dst = MATRIX_DIR / sub
            sub_dst.mkdir(parents=True, exist_ok=True)
            for item in sub_src.rglob('*'):
                if item.is_file():
                    rel = item.relative_to(sub_src)
                    dst_item = sub_dst / rel
                    dst_item.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(item, dst_item)
            print(f"Updated /srv/matrix/{sub}/")

# Restart container
print("Restarting matrix-service container...")
res = subprocess.run(['docker', 'restart', 'matrix-service'], capture_output=True, text=True)
print("Docker restart output:", res.stdout.strip() or res.stderr.strip())

# Clean up temporary extract
shutil.rmtree(EXTRACT_DIR)
print("Deployment of 1.0.14 completed successfully!")
