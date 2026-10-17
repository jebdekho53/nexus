"""Package the reconstructed source and portable runtime, excluding machine diagnostics."""
import hashlib
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT.parent / 'Matrix-source-portable.zip'

def included(path):
    rel = path.relative_to(ROOT)
    if rel.parts[0] == 'node_modules':
        return False
    if rel.parts[0] in {'diagnostics', '.git', 'lexus'} or rel.name == 'diagnostics-smoke-console.log':
        return False
    if rel.parts[:2] == ('services', 'control-plane') and any(part in {'data', 'node_modules'} for part in rel.parts[2:]):
        return False
    if '__pycache__' in rel.parts:
        return False
    if rel.parts[0] == 'recovery' and len(rel.parts) == 2:
        return rel.name in {'listing-v6.txt', 'constants-v6.jsonl', 'source-lift-report.json'}
    return True

# build/ts holds the compiled TypeScript modules that the entry points load at run time; build it first.
subprocess.run(['node', str(ROOT / 'scripts' / 'ensure-ts-build.cjs')], check=True)
files = sorted(p for p in ROOT.rglob('*') if p.is_file() and included(p))
with zipfile.ZipFile(TARGET, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        archive.write(path, Path(ROOT.name) / path.relative_to(ROOT))
with zipfile.ZipFile(TARGET) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError('Archive verification failed: ' + bad)
digest = hashlib.file_digest(TARGET.open('rb'), 'sha256').hexdigest()
TARGET.with_suffix('.zip.sha256').write_text(digest + '  ' + TARGET.name + '\n')
print(f'Verified {len(files)} files; {TARGET.stat().st_size:,} bytes; SHA256 {digest}')
