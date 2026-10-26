"""Offline opcode-shape census; matching shapes do NOT prove equal behavior."""
import collections, csv, hashlib, importlib, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS = Path(r'C:/Users/lexus/Videos/New folder/TS')
sys.path.insert(0, str(TS / 'analysis/backend-tools'))
# Import defines static opcode decoders. Reader / target execution is never invoked.
emitter = importlib.import_module('emit_disassembly')
old = json.loads(subprocess.check_output(['node', '-e',
    "const d=require('./src/main/generated/index.cjs');process.stdout.write(JSON.stringify(Object.entries(d).map(([id,f])=>({id,ops:f.code.map(i=>i[1])}))));"
], cwd=ROOT, text=True))
new = json.loads((TS / 'analysis/main-reconstruction/backend-ir.json').read_text())['functions']
locations = {f['name']: f for f in json.loads((TS / 'analysis/main-reconstruction/readable/function-index.json').read_text(encoding='utf-8'))}

def shape(ops):
    # Width prefixes are decoder mechanics; ignore them in both inventories.
    return hashlib.sha256('\n'.join(x for x in ops if x not in ('Wide', 'ExtraWide')).encode()).hexdigest()

buckets = collections.defaultdict(list)
for f in old:
    buckets[shape(f['ops'])].append(f['id'])
rows = []
for f in new:
    ops = [i['opcode'] for i in emitter.decode(f)]
    candidates = buckets.get(shape(ops), [])
    rows.append({'ts_function': f['name'], 'literal_id': f['literal_id'],
                 'file': locations[f['name']]['file'], 'line': locations[f['name']]['line'],
                 'instructions': len(ops), 'same_opcode_shape_candidates': candidates,
                 'status': 'same-opcode-shape' if candidates else 'different-or-new-shape'})
out = ROOT / 'diagnostics/ts-comparison/backend-shape-census.json'
summary = {'matrix_functions': len(old), 'ts_functions': len(rows),
           'ts_instruction_total': sum(r['instructions'] for r in rows),
           'shape_status_counts': dict(collections.Counter(r['status'] for r in rows)),
           'limitations': ['Opcode sequences exclude operand/constant values and do not establish semantic equivalence.',
                          'A different/new shape may be a modified function, not a new feature.',
                          'Matrix current handwritten overrides must be audited separately.'], 'functions': rows}
out.write_text(json.dumps(summary, indent=2), encoding='utf-8')
with out.with_name('different-or-new-shape-functions.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=['ts_function', 'literal_id', 'file', 'line', 'instructions', 'status'])
    writer.writeheader()
    for row in sorted(rows, key=lambda r:r['instructions'], reverse=True):
        if row['status'] == 'different-or-new-shape':
            writer.writerow({k:row[k] for k in writer.fieldnames})
print(json.dumps({k:v for k,v in summary.items() if k != 'functions'}, indent=2))
