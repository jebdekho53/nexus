"""Server script to patch the new logo into all 4 releases and web assets in seconds."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import zipfile

RELEASES_DIR = Path('/srv/matrix-releases')
ASSETS_ZIP = RELEASES_DIR / 'updated-assets.zip'

if not ASSETS_ZIP.exists():
    raise FileNotFoundError(f"Missing {ASSETS_ZIP}")

temp_assets = Path('/tmp/matrix-logo-patch')
if temp_assets.exists():
    shutil.rmtree(temp_assets)
temp_assets.mkdir(parents=True)

with zipfile.ZipFile(ASSETS_ZIP, 'r') as z:
    z.extractall(temp_assets)

print("Extracted updated assets:")
for p in temp_assets.rglob('*'):
    if p.is_file():
        print(f"  {p.relative_to(temp_assets)} ({p.stat().st_size:,} bytes)")

updated_names = {p.relative_to(temp_assets).as_posix(): p for p in temp_assets.rglob('*') if p.is_file()}

def build_setup_1013(target_exe: Path):
    print("Assembling Matrix-Setup-1.0.13.exe...")
    base_exe = RELEASES_DIR / 'Matrix-Setup-1.0.12.exe'
    updater_exe = RELEASES_DIR / 'Matrix-Updater-1.0.13.exe'

    raw_base = base_exe.read_bytes()
    idx = raw_base.find(b'PK\x03\x04')
    stub = raw_base[:idx]

    tmp_out = target_exe.with_name(target_exe.name + '.assembling')
    tmp_out.write_bytes(stub)

    # 1. Read files from updater (has 1.0.13 code)
    updater_files = {}
    with zipfile.ZipFile(updater_exe, 'r') as up_z:
        for item in up_z.infolist():
            updater_files[item.filename] = (item, up_z.read(item))

    # 2. Assemble complete setup
    with zipfile.ZipFile(base_exe, 'r') as base_z, \
         zipfile.ZipFile(tmp_out, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:
        written = set()
        for item in base_z.infolist():
            fn = item.filename
            if fn in updated_names:
                new_data = updated_names[fn].read_bytes()
                new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                new_info.external_attr = item.external_attr
                new_info.compress_type = zipfile.ZIP_DEFLATED
                dst_z.writestr(new_info, new_data)
                written.add(fn)
            elif fn in updater_files:
                up_item, up_data = updater_files[fn]
                dst_z.writestr(up_item, up_data)
                written.add(fn)
            else:
                dst_z.writestr(item, base_z.read(item))
                written.add(fn)

        for fn, (up_item, up_data) in updater_files.items():
            if fn not in written:
                if fn in updated_names:
                    new_data = updated_names[fn].read_bytes()
                    new_info = zipfile.ZipInfo(fn, date_time=up_item.date_time)
                    new_info.external_attr = up_item.external_attr
                    new_info.compress_type = zipfile.ZIP_DEFLATED
                    dst_z.writestr(new_info, new_data)
                else:
                    dst_z.writestr(up_item, up_data)
                written.add(fn)

    os.replace(tmp_out, target_exe)
    h = hashlib.sha256(target_exe.read_bytes()).hexdigest()
    print(f"Patched {target_exe.name}: {target_exe.stat().st_size:,} bytes, sha256 {h}")
    return target_exe.stat().st_size, h

def patch_updater(updater_exe: Path):
    print("Patching Matrix-Updater-1.0.13.exe...")
    raw = updater_exe.read_bytes()
    idx = raw.find(b'PK\x03\x04')
    stub = raw[:idx]

    tmp_out = updater_exe.with_name(updater_exe.name + '.tmp')
    tmp_out.write_bytes(stub)

    with zipfile.ZipFile(updater_exe, 'r') as src_z, \
         zipfile.ZipFile(tmp_out, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:
        for item in src_z.infolist():
            fn = item.filename
            if fn in updated_names:
                new_data = updated_names[fn].read_bytes()
                new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                new_info.external_attr = item.external_attr
                new_info.compress_type = zipfile.ZIP_DEFLATED
                dst_z.writestr(new_info, new_data)
            else:
                dst_z.writestr(item, src_z.read(item))

    os.replace(tmp_out, updater_exe)
    h = hashlib.sha256(updater_exe.read_bytes()).hexdigest()
    print(f"Patched {updater_exe.name}: {updater_exe.stat().st_size:,} bytes, sha256 {h}")
    return updater_exe.stat().st_size, h

def patch_mac_zip(zip_path: Path):
    print(f"Patching {zip_path.name}...")
    tmp_out = zip_path.with_name(zip_path.name + '.tmp')
    if tmp_out.exists():
        tmp_out.unlink()

    app_prefix = 'Matrix.app/Contents/Resources/app/'
    icns_file = temp_assets / 'resources' / 'Matrix.icns'
    icns_data = icns_file.read_bytes() if icns_file.exists() else None

    with zipfile.ZipFile(zip_path, 'r') as src_z, \
         zipfile.ZipFile(tmp_out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:
        for item in src_z.infolist():
            fn = item.filename
            if fn == 'Matrix.app/Contents/Resources/electron.icns' and icns_data:
                new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                new_info.external_attr = item.external_attr
                new_info.compress_type = zipfile.ZIP_DEFLATED
                dst_z.writestr(new_info, icns_data)
            elif fn.startswith(app_prefix):
                rel = fn[len(app_prefix):]
                if rel in updated_names:
                    new_data = updated_names[rel].read_bytes()
                    new_info = zipfile.ZipInfo(fn, date_time=item.date_time)
                    new_info.external_attr = item.external_attr
                    new_info.compress_type = zipfile.ZIP_DEFLATED
                    dst_z.writestr(new_info, new_data)
                else:
                    dst_z.writestr(item, src_z.read(item))
            else:
                dst_z.writestr(item, src_z.read(item))

    os.replace(tmp_out, zip_path)
    h = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    print(f"Patched {zip_path.name}: {zip_path.stat().st_size:,} bytes, sha256 {h}")
    return zip_path.stat().st_size, h

# Run all patches
setup_size, setup_sha = build_setup_1013(RELEASES_DIR / 'Matrix-Setup-1.0.13.exe')
updater_size, updater_sha = patch_updater(RELEASES_DIR / 'Matrix-Updater-1.0.13.exe')
arm64_size, arm64_sha = patch_mac_zip(RELEASES_DIR / 'Matrix-1.0.13-darwin-arm64.zip')
x64_size, x64_sha = patch_mac_zip(RELEASES_DIR / 'Matrix-1.0.13-darwin-x64.zip')

# Write sha256 files
(RELEASES_DIR / 'Matrix-Setup-1.0.13.exe.sha256').write_text(f"{setup_sha}  Matrix-Setup-1.0.13.exe\n")
(RELEASES_DIR / 'Matrix-Updater-1.0.13.exe.sha256').write_text(f"{updater_sha}  Matrix-Updater-1.0.13.exe\n")
(RELEASES_DIR / 'Matrix-1.0.13-darwin-arm64.zip.sha256').write_text(f"{arm64_sha}  Matrix-1.0.13-darwin-arm64.zip\n")
(RELEASES_DIR / 'Matrix-1.0.13-darwin-x64.zip.sha256').write_text(f"{x64_sha}  Matrix-1.0.13-darwin-x64.zip\n")

# Update manifest.json
manifest = {
    'version': '1.0.13',
    'name': 'Matrix',
    'setup': None,
    'distribution': 'cross-platform',
    'notes': 'Futuristic Blue Matrix Software Logo branding updated across Windows setup, macOS packages, ticket panel, toolbar dock, and web portals. Ticket panel scheduler presets and offset delays enabled.',
    'offlineSetup': {
        'url': '/downloads/Matrix-Setup-1.0.13.exe',
        'bytes': setup_size,
        'sha256': setup_sha,
    },
    'updaterExe': {
        'url': '/downloads/Matrix-Updater-1.0.13.exe',
        'bytes': updater_size,
        'sha256': updater_sha,
    },
    'macArm64': {
        'url': '/downloads/Matrix-1.0.13-darwin-arm64.zip',
        'bytes': arm64_size,
        'sha256': arm64_sha,
    },
    'macX64': {
        'url': '/downloads/Matrix-1.0.13-darwin-x64.zip',
        'bytes': x64_size,
        'sha256': x64_sha,
    }
}
(RELEASES_DIR / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print("manifest.json successfully updated.")

# Update web portal assets
for item in ['matrix-logo.svg', 'matrix-mark.png', 'matrix-logo.jpg', 'matrix.ico']:
    src = temp_assets / 'services/control-plane/assets' / item
    if src.exists():
        dst = Path('/srv/matrix/assets') / item
        shutil.copy2(src, dst)
        print(f"Copied {item} to /srv/matrix/assets")

for item in ['downloads.html', 'public.js']:
    src = temp_assets / 'services/control-plane/admin' / item
    if src.exists():
        dst = Path('/srv/matrix/admin') / item
        shutil.copy2(src, dst)
        print(f"Copied {item} to /srv/matrix/admin")

server_cjs = temp_assets / 'services/control-plane/server.cjs'
if server_cjs.exists():
    shutil.copy2(server_cjs, Path('/srv/matrix/server.cjs'))
    print("Copied server.cjs to /srv/matrix")

print("All server assets and packages patched successfully!")
