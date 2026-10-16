"""Export static decoder lookups for offline payment equivalence tests.

Requires the locally recovered string table and decoder tools. No network or
application boot occurs; this never reads profiles, accounts or captured HTTP.
"""
import argparse
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
spec = importlib.util.spec_from_file_location('payment_fixture_decoder', args.decoder)
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
table = decoder.StringTable(args.string_table)
selected_ids = [
    'f152', 'f510', 'f535', 'f542', 'f543', 'f544', 'f545', 'f546',
    *[f'f{n}' for n in range(547, 555)],
    'f1599', 'f1600', 'f1601', 'f1602', 'f1603', 'f1604', 'f1605', 'f1606', 'f1607', 'f1608', 'f1609', 'f1610', 'f1611',
    *[f'f{n}' for n in range(1617, 1652)],
    *[f'f{n}' for n in range(1652, 1719)],
    *[f'f{n}' for n in range(1719, 1730)],
    *[f'f{n}' for n in range(1612, 1617)], 'f1623',
    *[f'f{n}' for n in range(1730, 1800)],
    'f149', 'f150', 'f151', *[f'f{n}' for n in range(2040, 2172)], 'f1756', 'f1757', 'f2382',
    *[f'f{n}' for n in range(2172, 2186)],
    *[f'f{n}' for n in range(2186, 2249)],
]
code = (
    "const d=require('./src/main/generated/index.cjs');const ids="
    + json.dumps(selected_ids)
    + ";console.log(JSON.stringify(Object.fromEntries(ids.map(id=>[id,d[id]]))));"
)
definitions = json.loads(subprocess.run([args.node, '-e', code], cwd=root, check=True, capture_output=True, text=True, encoding='utf-8').stdout)
output = {}
for name, definition in definitions.items():
    registers, accumulator, strings = {}, None, {}
    for _, operation, operands, *_ in definition['code']:
        if operation == 'LdaSmi':
            accumulator = operands[0]
        elif operation == 'LdaConstant':
            accumulator = definition['constants'][operands[0]['c']]
        elif operation == 'Ldar':
            accumulator = registers.get(operands[0].get('r'))
        elif operation.startswith('Star'):
            register = int(operation[4:]) if operation[4:].isdigit() else operands[0]['r']
            registers[register] = accumulator
        elif operation == 'CallUndefinedReceiver2':
            index, key = registers.get(operands[1].get('r')), registers.get(operands[2].get('r'))
            if isinstance(index, int) and isinstance(key, str) and len(key) == 4:
                strings[f'{index}|{key}'] = table.get(index, key)
            accumulator = None
        else:
            accumulator = None
    output[name] = strings
destination = root / 'test/fixtures/payment-strings.json'
destination.write_text(json.dumps(output, indent=2, ensure_ascii=True) + '\n', encoding='utf-8', newline='\n')
print(f'Exported {sum(map(len, output.values()))} static lookups from {len(output)} functions')
