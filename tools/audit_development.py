"""Inventory candidate side-effect references; the runtime policy enforces the boundary."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
categories = {'exit_candidates': [], 'network_candidates': [], 'command_candidates': []}
terms = {
    'exit_candidates': {'exit', 'quit', 'relaunch', 'destroy', 'close', 'onKill', 'taskkill'},
    'network_candidates': {'fetch', 'request', 'http', 'https', 'connect'},
    'command_candidates': {'exec', 'execFile', 'spawn', 'powershell', 'cmd.exe', 'taskkill', 'Remove-Item'},
}
functions = 0
for file in (ROOT / 'src/main/generated').glob('part-*.cjs'):
    for chunk in re.split(r'^exports\.', file.read_text(encoding='utf-8'), flags=re.M)[1:]:
        functions += 1
        ident = chunk.split(' =')[0]
        comments = [json.loads(line.split('reference: ', 1)[1]) for line in chunk.splitlines()
                    if 'Decoded string reference:' in line]
        for category, words in terms.items():
            matches = sorted({value for value in comments if value in words or
                              (category == 'network_candidates' and 'telemetry' in value.lower())})
            if matches:
                categories[category].append({'function': ident, 'references': matches})

report = {
    'functionsScanned': functions,
    'method': 'Decoded property/string references in every generated function; candidates include ordinary browser closes and RegExp.exec. Counts are not counts of harmful behavior.',
    'counts': {name: len(rows) for name, rows in categories.items()},
    'reviewedPaths': {
        'f2689': 'Quick local process denylist that blocked ChatGPT/Codex after startup',
        'f2835': 'Continuous runtime check',
        'f2877': 'Forced shutdown: app.exit, process.exit, process.kill(SIGKILL)',
        'f2009': 'Encrypted client-update reporting containing booking metadata',
        'f1778': 'External captcha-service calls under a telementry route',
        'f4249': 'Updater writes batch/VBS scripts and invokes taskkill/installer/restart',
        'f4252': 'Updater fallback launches cmd.exe',
        'nativeDllRequests': 'Koffi loads shipped native request/requestAsync clients. Native clients are enabled in the live build.',
    },
    'policy': 'Live source build: networking, browser processes and native clients enabled. Original window managers preserved. Vendor license/version and local inspection gates overridden; f2877 forced shutdown and f2009 reporting disabled. Genuine service authentication remains. Explicit Quit/Restart uses the confirmation page.',
    'nativeNodeAddons': [str(file.relative_to(ROOT)) for file in (ROOT / 'vendor').rglob('*.node')],
    'candidates': categories,
}
(ROOT / 'AUDIT.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'functionsScanned': functions, 'candidateCounts': report['counts'], 'nativeNodeAddons': len(report['nativeNodeAddons'])}))
