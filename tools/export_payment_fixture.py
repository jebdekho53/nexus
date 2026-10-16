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
code = "const d=require('./src/main/generated/index.cjs');console.log(JSON.stringify(Object.fromEntries(['f152','f510','f535','f542','f543','f544','f545','f546',...Array.from({length:8},(_,i)=>'f'+(547+i)),'f1609','f1610','f1621','f1622','f1630','f1631',...Array.from({length:19},(_,i)=>'f'+(1659+i)),...Array.from({length:11},(_,i)=>'f'+(1719+i)),'f1756','f1757','f2382',...Array.from({length:14},(_,i)=>'f'+(2172+i)),...Array.from({length:63},(_,i)=>'f'+(2186+i))].map(id=>[id,d[id]]))));"
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
