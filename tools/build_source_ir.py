"""Lift the recovered listing and full constants into editable JS program modules."""
import collections
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / 'recovery'
OUTPUT = ROOT / 'src/main/generated'
INSN = re.compile(r'@\s*(\d+) : (?:[0-9a-f]{2}\s+)+([A-Za-z][A-Za-z0-9.]*)\s*(.*)')


def split_operands(text):
    result, start, depth, quote, escaped = [], 0, 0, False, False
    for pos, char in enumerate(text):
        if quote:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == '"': quote = False
        elif char == '"': quote = True
        elif char in '[{(': depth += 1
        elif char in ']})': depth -= 1
        elif char == ',' and depth == 0:
            result.append(text[start:pos].strip()); start = pos + 1
    if text[start:].strip(): result.append(text[start:].strip())
    return result


def operand(text):
    text = text.strip()
    if re.fullmatch(r'r\d+', text): return {'r': int(text[1:])}
    if re.fullmatch(r'a\d+', text): return {'a': int(text[1:])}
    m = re.fullmatch(r'r(\d+)-r(\d+)', text)
    if m: return {'range': [int(m[1]), int(m[2])]}
    m = re.fullmatch(r'a(\d+)-a(\d+)', text)
    if m: return {'argRange': [int(m[1]), int(m[2])]}
    if text.startswith('<') and text.endswith('>'): return {'special': text[1:-1]}
    m = re.match(r'^\[(\d+):', text)
    if m: return {'c': int(m[1])}
    m = re.fullmatch(r'(?:FBV|EmbeddedFeedback)?\[(-?\d+)\]', text)
    if m: return int(m[1])
    if text.startswith('[') and text.endswith(']'): return text[1:-1]
    if text.startswith('#'): return int(text[1:], 16)
    if text.startswith('{'): return {'table': {int(k): int(v) for k,v in re.findall(r'(-?\d+):\s*@(-?\d+)', text)}}
    if re.fullmatch(r'-?\d+', text): return int(text)
    if not text: return None
    raise ValueError('Unparsed operand: ' + text[:180])


def parse_listing(path):
    functions, frame, instructions, metadata = [], None, False, False
    for line in path.open(encoding='utf-8', errors='strict'):
        if line.startswith('Start SharedFunctionInfo'):
            frame = {'code': [], 'handlers': [], 'constants': []}; instructions = False; metadata = True
        if frame is None: continue
        m = re.match(r'0x([0-9a-f]+): \[SharedFunctionInfo\]', line)
        if m: frame['nativeId'] = m[1]
        for label, field in [('kind','kind'),('language_mode','language'),('function_literal_id','literalId'),('length','length')]:
            m = re.match(r' - ' + label + r': (.*)', line)
            if m and metadata: frame[field] = int(m[1]) if field in ['literalId','length'] else m[1].strip()
        m = re.match(r' - name:.*<String\[\d+\]: #(.*)>', line)
        if m: frame['name'] = m[1]
        if line.startswith('Start BytecodeArray'): instructions = True; metadata = False; continue
        if line.startswith('End BytecodeArray'): instructions = False
        if line.startswith('Register count '): frame['registerCount'] = int(line.split()[-1])
        if line.startswith('Parameter count '): frame['parameterCount'] = int(line.split()[-1])
        if instructions:
            m = INSN.search(line)
            if m:
                pc, op, text = int(m[1]), m[2].split('.')[0], m[3].strip()
                target = re.search(r'\(0x[0-9a-f]+\s*@\s*(\d+)\)', text)
                text = re.sub(r'\s*\(0x[0-9a-f]+\s*@\s*\d+\)', '', text)
                table = re.search(r'\{.*\}', text)
                if table:
                    text = text[:table.start()].rstrip().rstrip(',') + ', ' + table[0]
                row = [pc, op, [operand(x) for x in split_operands(text)]]
                if target: row.append(int(target[1]))
                frame['code'].append(row)
            h = re.match(r'\s*\(\s*(\d+),\s*(\d+)\)\s*->\s*(\d+) \(prediction=(\d+), data=(\d+)\)', line)
            if h: frame['handlers'].append([int(x) for x in h.groups()])
        if line.startswith('End SharedFunctionInfo'):
            assert frame['code'], frame
            functions.append(frame); frame = None
    return functions


def main():
    frames = parse_listing(INPUT / 'listing-v6.txt')
    constants = {row['id']: row for row in
                 (json.loads(line) for line in (INPUT / 'constants-v6.jsonl').open(encoding='utf-8'))}
    ids = {f['nativeId']: 'f' + str(f['literalId']) for f in frames}
    assert len(ids) == len(set(ids.values())) == len(frames)
    unresolved = collections.Counter()
    def convert(value):
        if isinstance(value, list): return [convert(x) for x in value]
        if isinstance(value, dict):
            if value.get('type') == 'function':
                if value['id'] not in ids: raise ValueError('Missing closure ' + value['id'])
                return {**value, 'id': ids[value['id']]}
            if value.get('type') in ['unsupported','depth-limit']: unresolved[value.get('instanceType',value['type'])] += 1
            return {k: convert(v) for k,v in value.items()}
        return value
    opcounts = collections.Counter()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    parts = []
    for offset in range(0, len(frames), 100):
        name = f'part-{offset//100+1:02d}.cjs'; parts.append(name)
        with (OUTPUT / name).open('w', encoding='utf-8', newline='\n') as out:
            out.write('// Recovered function definitions. Instructions retain original offsets and control flow.\n')
            for f in frames[offset:offset+100]:
                item = constants[f['nativeId']]
                f['constants'] = convert(item['constants']); f['incoming'] = item.get('incoming'); f['registerCounts'] = item.get('registerCounts',{}); f['id'] = ids[f['nativeId']]
                head = {k:v for k,v in f.items() if k != 'code'}
                out.write('exports.' + f['id'] + ' = {\n')
                for key,value in head.items(): out.write('  ' + json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=True) + ',\n')
                out.write('  code: [\n')
                for row in f['code']: out.write('    ' + json.dumps(row, ensure_ascii=True) + ',\n')
                out.write('  ]\n};\n')
                opcounts.update(row[1] for row in f['code'])
    index = "'use strict';\nmodule.exports = Object.assign({},\n" + ',\n'.join('  require("./'+name+'")' for name in parts) + '\n);\n'
    (OUTPUT / 'index.cjs').write_text(index)
    report = {'functions': len(frames), 'instructions': sum(opcounts.values()), 'opcodes': dict(opcounts),
              'entry': ids[frames[0]['nativeId']], 'unresolvedConstants': dict(unresolved)}
    (INPUT / 'source-lift-report.json').write_text(json.dumps(report, indent=2))
    print('Generated',len(frames),'functions;',sum(opcounts.values()),'instructions; unresolved constants:',dict(unresolved))


if __name__ == '__main__': main()
