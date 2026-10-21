"""Prepare patch zip containing updated 1.0.14 files."""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ZIP = ROOT.parent / 'matrix-build' / 'patch-1.0.14.zip'

INCLUDE_DIRS = ['src', 'resources', 'test', 'services/control-plane']
INCLUDE_FILES = ['package.json', 'Matrix.cmd', 'TASK-STATE.json']

with zipfile.ZipFile(OUTPUT_ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for f in INCLUDE_FILES:
        p = ROOT / f
        if p.exists():
            z.write(p, f)
            print(f"Added {f}")
    for d in INCLUDE_DIRS:
        p = ROOT / d
        for file_path in p.rglob('*'):
            if file_path.is_file() and '__pycache__' not in file_path.parts and '.git' not in file_path.parts:
                rel = file_path.relative_to(ROOT).as_posix()
                z.write(file_path, rel)
                print(f"Added {rel}")

print(f"Created {OUTPUT_ZIP} ({OUTPUT_ZIP.stat().st_size:,} bytes)")
