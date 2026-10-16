"""Derive method/property names for recovered functions from the static string table.

Class members and object-literal methods are created right after a decoder call of the form
(LdaSmi index, LdaConstant key). This script finds, for every CreateClosure of a recovered
function, the nearest preceding such lookup, decodes it with the local static table
(never a profile, session or network) and writes docs/reconstruction-inventory/function-names.csv.
The name is a hint for review planning, not a proof.
"""
import argparse
import csv
import importlib.util
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--node', required=True)
parser.add_argument('--decoder', type=Path, required=True)
parser.add_argument('--string-table', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location('name_decoder', args.decoder)
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
table = decoder.StringTable(args.string_table)

script = r"""
const d=require('./src/main/generated/index.cjs');const rows=[];
for(const [parent,def] of Object.entries(d)){
  const code=def.code;let last=null;
  for(let i=0;i<code.length;i++){
    const [pc,op,a]=code[i];
    if(op==='LdaSmi'&&code[i+1]&&/^Star/.test(code[i+1][1])&&code[i+2]&&code[i+2][1]==='LdaConstant'){
      const key=def.constants[code[i+2][2][0].c];
      if(typeof key==='string'&&key.length===4)last=[a[0],key,pc];
    }
    if(op==='CreateClosure'){
      const c=def.constants[a[0].c];
      if(c&&c.type==='function')rows.push([c.id,parent,last,pc]);
    }
  }
}
console.log(JSON.stringify(rows));
"""
rows = json.loads(subprocess.run([args.node, '-e', script], cwd=root, check=True, capture_output=True,
                                 text=True, encoding='utf-8', env={**__import__('os').environ}).stdout)
cache = {}
output = root / 'docs/reconstruction-inventory/function-names.csv'
with output.open('w', encoding='utf-8', newline='') as handle:
    writer = csv.writer(handle, lineterminator='\n')
    writer.writerow(['id', 'parent', 'nameHint'])
    for function_id, parent, last, _ in sorted(rows, key=lambda r: int(r[0][1:])):
        name = ''
        if last:
            key = (last[0], last[1])
            if key not in cache:
                try:
                    cache[key] = table.get(*key)
                except Exception:
                    cache[key] = ''
            name = cache[key]
        writer.writerow([function_id, parent, name])
print('Wrote', len(rows), 'rows to', output.relative_to(root))
