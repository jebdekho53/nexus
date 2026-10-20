"""Build native macOS Matrix.app distributions (darwin-arm64 and darwin-x64)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import stat
import sys
import zipfile

ELECTRON_VERSION = 'v33.2.1'

ROOT = Path(__file__).resolve().parent.parent
CACHE_CANDIDATES = [
    ROOT.parent / 'matrix-build' / '.cache' / 'electron-mac',
    ROOT.parent.parent / 'matrix-build' / '.cache' / 'electron-mac',
]
CACHE_DIR = next((p for p in CACHE_CANDIDATES if (p / f'electron-{ELECTRON_VERSION}-darwin-arm64.zip').exists()), CACHE_CANDIDATES[0])
CACHE_DIR.mkdir(parents=True, exist_ok=True)

VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']

# Update build banner in renderer
(ROOT / 'src/renderer/matrix-build.js').write_text(
    'globalThis.MATRIX_BUILD=Object.freeze(' + json.dumps({'name': 'Matrix', 'version': VERSION}, separators=(',', ':')) + ');\n',
    encoding='utf-8', newline='\n')

HELPER_RENAMES = {
    'Electron Helper.app': 'Matrix Helper.app',
    'Electron Helper (GPU).app': 'Matrix Helper (GPU).app',
    'Electron Helper (Plugin).app': 'Matrix Helper (Plugin).app',
    'Electron Helper (Renderer).app': 'Matrix Helper (Renderer).app',
}

HELPER_EXEC_RENAMES = {
    'Electron Helper': 'Matrix Helper',
    'Electron Helper (GPU)': 'Matrix Helper (GPU)',
    'Electron Helper (Plugin)': 'Matrix Helper (Plugin)',
    'Electron Helper (Renderer)': 'Matrix Helper (Renderer)',
}

def transform_zip_path(name: str) -> str:
    if not name.startswith('Electron.app/'):
        return name
    out = 'Matrix.app/' + name[len('Electron.app/'):]
    for old_h, new_h in HELPER_RENAMES.items():
        if old_h in out:
            out = out.replace(old_h, new_h)
    for old_e, new_e in HELPER_EXEC_RENAMES.items():
        if f'MacOS/{old_e}' in out:
            out = out.replace(f'MacOS/{old_e}', f'MacOS/{new_e}')
    if out == 'Matrix.app/Contents/MacOS/Electron':
        out = 'Matrix.app/Contents/MacOS/Matrix'
    return out

def update_plist(data: bytes, path: str, version: str) -> bytes:
    try:
        plist = plistlib.loads(data)
    except Exception:
        return data

    if path == 'Matrix.app/Contents/Info.plist':
        plist['CFBundleDisplayName'] = 'Matrix'
        plist['CFBundleName'] = 'Matrix'
        plist['CFBundleIdentifier'] = 'com.matrix.workspace'
        plist['CFBundleExecutable'] = 'Matrix'
        plist['CFBundleVersion'] = version
        plist['CFBundleShortVersionString'] = version
        plist['CFBundleIconFile'] = 'electron.icns'
        plist['NSHumanReadableCopyright'] = 'Copyright (c) 2026 Matrix. All rights reserved.'
    else:
        for helper_name, helper_app in [
            ('Matrix Helper (GPU)', 'Matrix Helper (GPU).app'),
            ('Matrix Helper (Plugin)', 'Matrix Helper (Plugin).app'),
            ('Matrix Helper (Renderer)', 'Matrix Helper (Renderer).app'),
            ('Matrix Helper', 'Matrix Helper.app'),
        ]:
            if helper_app in path:
                plist['CFBundleDisplayName'] = helper_name
                plist['CFBundleName'] = helper_name
                plist['CFBundleExecutable'] = helper_name
                sub = helper_name.lower().replace(' ', '.').replace('(', '').replace(')', '')
                plist['CFBundleIdentifier'] = f'com.matrix.workspace.{sub}'
                plist['CFBundleVersion'] = version
                plist['CFBundleShortVersionString'] = version
                break
    return plistlib.dumps(plist)

def build_mac_distribution(arch: str, out_dir: Path):
    electron_zip = CACHE_DIR / f'electron-{ELECTRON_VERSION}-darwin-{arch}.zip'
    if not electron_zip.exists():
        raise FileNotFoundError(f'Missing Electron zip: {electron_zip}')

    out_zip = out_dir / f'Matrix-{VERSION}-darwin-{arch}.zip'
    if out_zip.exists():
        out_zip.unlink()

    icon_icns = (ROOT / 'resources' / 'Matrix.icns').read_bytes() if (ROOT / 'resources' / 'Matrix.icns').exists() else None

    print(f'Building Matrix macOS {arch} release -> {out_zip.name}...')

    with zipfile.ZipFile(electron_zip, 'r') as src_z, \
         zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_z:

        # 1. Transform and write Electron runtime
        for item in src_z.infolist():
            new_path = transform_zip_path(item.filename)
            raw = src_z.read(item)

            if new_path.endswith('.plist'):
                raw = update_plist(raw, new_path, VERSION)
            elif icon_icns and new_path == 'Matrix.app/Contents/Resources/electron.icns':
                raw = icon_icns

            new_info = zipfile.ZipInfo(new_path, date_time=item.date_time)
            new_info.external_attr = item.external_attr
            new_info.compress_type = item.compress_type

            # For symlinks or files
            dst_z.writestr(new_info, raw)

        # 2. Add app files into Matrix.app/Contents/Resources/app/
        app_prefix = 'Matrix.app/Contents/Resources/app'

        include_folders = ['src', 'resources', 'nexus2.0']
        include_files = ['package.json']

        app_files = []
        for f in include_files:
            app_files.append(ROOT / f)
        for folder in include_folders:
            base = ROOT / folder
            if base.exists():
                app_files.extend(p for p in base.rglob('*') if p.is_file())

        # Vendor files (carefully filtered)
        vendor_base = ROOT / 'vendor'
        if vendor_base.exists():
            for p in vendor_base.rglob('*'):
                if not p.is_file():
                    continue
                rel_parts = p.relative_to(ROOT).parts
                # Skip win32 koffi when packaging for mac
                if 'koffi-win32-ia32' in rel_parts or 'koffi-win32-x64' in rel_parts:
                    continue
                if arch == 'arm64' and 'koffi-darwin-x64' in rel_parts:
                    continue
                if arch == 'x64' and 'koffi-darwin-arm64' in rel_parts:
                    continue
                if p.suffix == '.node' and 'sqlite3' in rel_parts:
                    continue
                app_files.append(p)

        skip_names = {'__pycache__', '.git', '.runtime'}

        count = 0
        for p in app_files:
            if skip_names & set(p.parts):
                continue
            rel_path = p.relative_to(ROOT).as_posix()
            zip_target = f'{app_prefix}/{rel_path}'

            raw = p.read_bytes()
            info = zipfile.ZipInfo(zip_target)

            # Unix permissions: 0o755 for executables/dylibs, 0o644 for others
            is_exec = (
                p.suffix in {'.dylib', '.node', '.sh', '.command'} or
                p.name in {'index-mac', 'index-mac-arm64'}
            )
            mode = (stat.S_IFREG | (0o755 if is_exec else 0o644))
            info.external_attr = mode << 16
            info.compress_type = zipfile.ZIP_DEFLATED

            dst_z.writestr(info, raw)
            count += 1

    digest = hashlib.sha256(out_zip.read_bytes()).hexdigest()
    (out_dir / (out_zip.name + '.sha256')).write_text(f'{digest}  {out_zip.name}\n', encoding='utf-8')
    print(f'Done: {count} app files packed. Output: {out_zip} ({out_zip.stat().st_size:,} bytes). SHA256: {digest}')
    return {
        'file': out_zip.name,
        'path': out_zip,
        'bytes': out_zip.stat().st_size,
        'sha256': digest,
    }

def main():
    parser = argparse.ArgumentParser(description='Build Matrix macOS release')
    parser.add_argument('--arch', choices=['arm64', 'x64', 'all'], default='all', help='Target architecture')
    parser.add_argument('--out', type=Path, default=ROOT.parent / 'matrix-build', help='Output directory')
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    archs = ['arm64', 'x64'] if args.arch == 'all' else [args.arch]
    results = {}
    for arch in archs:
        results[arch] = build_mac_distribution(arch, args.out)

    print('\nAll macOS builds completed successfully:')
    for arch, res in results.items():
        print(f"  {arch}: {res['file']} ({res['bytes']:,} bytes, {res['sha256'][:16]}...)")

if __name__ == '__main__':
    main()
