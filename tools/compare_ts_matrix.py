"""Read-only comparison of supplied TS artifacts against Matrix source/assets."""
import json,hashlib,csv,re,sys
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parent.parent
TS=Path(r'C:/Users/lexus/Videos/New folder/TS')
OUT=ROOT/'diagnostics/ts-comparison';OUT.mkdir(parents=True,exist_ok=True)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def inventory(p):return {f.relative_to(p).as_posix():f for f in p.rglob('*') if f.is_file()} if p.exists() else {}
def compare(a,b):
 x,y=inventory(a),inventory(b);rows=[]
 for name in sorted(x.keys()|y.keys()):
  state='only-ts' if name not in y else 'only-matrix' if name not in x else 'identical' if x[name].stat().st_size==y[name].stat().st_size and digest(x[name])==digest(y[name]) else 'changed'
  rows.append({'path':name,'state':state,'ts_bytes':x[name].stat().st_size if name in x else None,'matrix_bytes':y[name].stat().st_size if name in y else None})
 return {'counts':dict(Counter(r['state'] for r in rows)),'ts_files':len(x),'matrix_files':len(y),'rows':rows}
results={}
for group,a,b in [('renderer',TS/'extracted-app/out/renderer',ROOT/'src/renderer'),('preload',TS/'extracted-app/out/preload',ROOT/'src/preload'),('dependencies',TS/'extracted-app/node_modules',ROOT/'vendor/node_modules')]:
 if group=='dependencies' and '--skip-dependencies' in sys.argv:continue
 results[group]=compare(a,b)
 with (OUT/(group+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=['path','state','ts_bytes','matrix_bytes']);w.writeheader();w.writerows(results[group]['rows'])
summary_text=(TS/'analysis/rea-summary.json').read_text(encoding='utf-16');summary=json.loads(summary_text[summary_text.index('{'):])
sha=digest(TS/'resources/app.asar');bytecode=digest(TS/'extracted-app/out/main/index.jsc')
results['identity']={'ts_version':json.loads((TS/'package.json').read_text())['version'],'matrix_version':json.loads((ROOT/'package.json').read_text())['version'],'asar_sha256':sha,'saved_rea_sha256':summary['subject']['digest']['sha256'],'saved_rea_matches':sha==summary['subject']['digest']['sha256'],'jsc_sha256':bytecode}
results['ts_verification']=json.loads((TS/'analysis/main-reconstruction/verification.json').read_text())
oldfuncs=json.loads((ROOT/'docs/reconstruction-inventory/functions.json').read_text());results['matrix_function_inventory_type']=type(oldfuncs).__name__
old=(ROOT/'recovery/readable-reference/ipc-channels.md').read_text();new=json.loads((TS/'analysis/main-reconstruction/readable/ipc-channels.json').read_text())['registrations']
oldchannels={line.split('|')[1].strip() for line in old.splitlines() if line.startswith('|') and '`func_sfi_' in line};newchannels={r['symbol'] for r in new}
results['ipc']={'ts_registrations':len(new),'ts_unique_symbols':len(newchannels),'matrix_archived_symbols':len(oldchannels),'ts_only_symbols':sorted(newchannels-oldchannels),'matrix_archived_only_symbols':sorted(oldchannels-newchannels),'shared_symbols':len(newchannels&oldchannels),'limits':'Symbol-level comparison of supplied recovered maps; both maps are static candidates and may differ in mapping coverage.'}
def blocks(folder):
 found=[]
 for p in sorted(folder.glob('part-*.js')):
  text=p.read_text(encoding='utf-8',errors='replace');starts=list(re.finditer(r'^(?:async )?function (func_sfi_[a-f0-9]+)\([^\n]*',text,re.M))
  for i,m in enumerate(starts):
   body=text[m.start():starts[i+1].start() if i+1<len(starts) else len(text)]
   strings=set()
   for token in re.findall(r'"(?:\\.|[^"\\])*"',body):
    try:value=json.loads(token)
    except:continue
    if len(value)>=12 and re.search('[A-Za-z]{3}',value):strings.add(value)
   found.append({'id':m.group(1),'file':p.name,'line':text.count('\n',0,m.start())+1,'lines':body.count('\n'),'strings':strings,'body':body})
 return found
ob=blocks(ROOT/'recovery/readable-reference');nb=blocks(TS/'analysis/main-reconstruction/readable')
ost=set().union(*(r['strings'] for r in ob));nst=set().union(*(r['strings'] for r in nb));added=nst-ost;removed=ost-nst
terms=re.compile(r'login|booking|captcha|payment|proxy|browser|warm.?up|pnr|security|cookie|qr|sensor|session|token|clientupdate|analytics',re.I)
rows=[]
for state,values,items in [('ts-only',added,nb),('old-only',removed,ob)]:
 lookup={}
 for b in items:
  for s in b['strings']&values:lookup.setdefault(s,(b['file'],b['line'],b['id']))
 for s in sorted(values):
  if terms.search(s) and not re.search(r'password|Bearer|secret|api.?key|token=',s,re.I):rows.append({'state':state,'text':s[:1500],'file':lookup[s][0],'line':lookup[s][1],'function':lookup[s][2]})
with (OUT/'feature-string-differences.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['state','text','file','line','function']);w.writeheader();w.writerows(rows)
host=re.compile(r'(?:https?|wss?)://([a-zA-Z0-9_.-]+)')
def hosts(items):
 d=defaultdict(list)
 for b in items:
  for s in b['strings']:
   for h in host.findall(s):
    if len(d[h.lower()])<4:d[h.lower()].append({'function':b['id'],'file':b['file'],'line':b['line']})
 return dict(d)
oh,nh=hosts(ob),hosts(nb)
results['backend_readable']={'old_blocks':len(ob),'ts_blocks':len(nb),'old_distinct_strings':len(ost),'ts_distinct_strings':len(nst),'shared_strings':len(ost&nst),'ts_only_strings':len(added),'old_only_strings':len(removed),'limits':'Approximate pseudocode strings; differences are candidates, not behavioral equivalence or exact new-function mappings.'}
results['hosts']={'old':oh,'ts':nh,'ts_only':sorted(nh.keys()-oh.keys()),'old_only':sorted(oh.keys()-nh.keys())}
for k in ['renderer','preload','dependencies']:
 if k in results:results[k].pop('rows')
(OUT/'comparison.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2)[:18000])
