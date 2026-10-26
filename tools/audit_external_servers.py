"""Offline host-reference inventory. Never prints URL paths, tokens or payloads."""
import csv, json, re, os, sys
from pathlib import Path
from collections import defaultdict, Counter

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'diagnostics/server-audit'
OUT.mkdir(parents=True,exist_ok=True)
URL=re.compile(r'(?:https?|wss?|ftp)://(?:[^/\s@]+@)?(\[[0-9a-fA-F:]+\]|[A-Za-z0-9_.-]+)',re.I)
BARE=re.compile(r'(?<![A-Za-z0-9_-])(?:[a-z0-9][a-z0-9-]{0,62}\.)+(?:com|net|org|io|uk|in|dev|ai|gov|app|cloud|online|tech|site|xyz|me|info|co|edu|invalid|test|local)(?![A-Za-z0-9_.-])',re.I)
TEXT={'.js','.cjs','.mjs','.ts','.tsx','.jsx','.json','.html','.css','.xml','.yaml','.yml','.toml','.py','.ps1','.cmd','.bat','.sh','.java','.kt','.gradle','.properties','.txt','.md','.csv','.svg'}
BINARY={'.exe','.dll','.node','.dylib','.so'}
EXCLUDE={'.git','diagnostics','validation-artifacts','__pycache__','data'}
rows=set();counts=Counter();skipped=[]
def scope(file):
 p=file.replace('\\','/')
 if '/node_modules/' in p:return 'dependency-runtime'
 if p.startswith('src/'):return 'application'
 if p.startswith('services/'):return 'backend-tests' if '.test.' in p else 'backend'
 if p.startswith('android/'):return 'android'
 if p.startswith('nexus2.0/'):return 'alternate-engine'
 if p.startswith('recovery/'):return 'archive'
 if p.startswith(('vendor/','.runtime/')):return 'dependency-runtime'
 if p.startswith('resources/'):return 'resources'
 if p.startswith('test/'):return 'tests'
 if p.startswith('tools/'):return 'tools'
 return 'documentation-metadata'
def extract(text,file,line,kind,fn=''):
 text=text.replace('\\/','/').replace('\\x2f','/').replace('\\x2e','.')
 found={m.group(1).lower().strip('.[]') for m in URL.finditer(text)}
 for host in found:
  if host and '.' in host or host in {'localhost','127.0.0.1','0.0.0.0','::1'}:rows.add((host,scope(file),kind,file,line,fn))
 if kind!='binary-string':
  for m in BARE.finditer(text):
   host=m.group(0).lower().rstrip('.')
   if host not in found:rows.add((host,scope(file),'bare-domain' if kind=='literal' else kind,file,line,fn))
if '--classify-only' in sys.argv:
 previous=json.loads((OUT/'inventory.json').read_text(encoding='utf-8'));counts.update(previous['counts'])
 with (OUT/'all-host-references.csv').open(encoding='utf-8-sig',newline='') as stream:
  for r in csv.DictReader(stream):rows.add((r['host'],scope(r['file']),r['kind'],r['file'],int(r['line']),r['function']))
for parent,dirs,files in ([] if '--classify-only' in sys.argv else os.walk(ROOT)):
 dirs[:]=[d for d in dirs if d not in EXCLUDE]
 for name in files:
  f=Path(parent)/name;rel=f.relative_to(ROOT).as_posix();ext=f.suffix.lower()
  try:
   if ext in TEXT:
    if f.stat().st_size>60_000_000:skipped.append({'file':rel,'reason':'text file >60 MB'});continue
    counts['textFiles']+=1;fn=''
    for line,text in enumerate(f.read_text(encoding='utf-8',errors='replace').splitlines(),1):
     m=re.match(r'exports\.(f\d+)\s*=',text)
     if m:fn=m.group(1)
     extract(text,rel,line,'literal',fn)
   elif ext in BINARY:
    counts['nativeFiles']+=1
    with f.open('rb') as stream:
     tail=b''
     while True:
      chunk=stream.read(2_000_000)
      if not chunk:break
      block=tail+chunk
      extract(block.decode('ascii',errors='ignore'),rel,0,'binary-string')
      extract(block.decode('utf-16le',errors='ignore'),rel,0,'binary-string')
      tail=block[-4096:]
   else:counts['otherFilesNotParsed']+=1
  except (OSError,ValueError) as e:skipped.append({'file':rel,'reason':type(e).__name__})
decoded=OUT/'runtime-decoded-hosts.json'
if decoded.exists():
 d=json.loads(decoded.read_text());counts['decodedFunctions']=d['functions'];counts['decoderLookups']=d['lookups'];counts['decoderErrors']=d['errors']
 for r in d['references']:extract('https://'+r['host'],r['file'],r['line'],'runtime-decoded',r['function'])
fields=['host','scope','kind','file','line','function']
with (OUT/'all-host-references.csv').open('w',newline='',encoding='utf-8-sig') as stream:
 writer=csv.writer(stream);writer.writerow(fields);writer.writerows(sorted(rows))
hosts=defaultdict(lambda:{'scopes':set(),'kinds':set(),'references':0,'evidence':[]})
for host,sc,kind,file,line,fn in sorted(rows):
 h=hosts[host];h['scopes'].add(sc);h['kinds'].add(kind);h['references']+=1
 if len(h['evidence'])<30:h['evidence'].append({'file':file,'line':line,'function':fn,'kind':kind})
result={'counts':dict(counts),'uniqueCandidateHosts':len(hosts),'references':len(rows),'excludedDirectories':sorted(EXCLUDE),'skipped':skipped,'hosts':{k:{**v,'scopes':sorted(v['scopes']),'kinds':sorted(v['kinds'])} for k,v in sorted(hosts.items())},'limits':['Reference presence does not prove an active connection.','Bare domains may be filenames, examples or package identifiers.','Constructed/encrypted/remote-supplied endpoints and native socket behavior are not exhaustively resolved.','Private profiles, logs, Git history, server data and compressed archives are excluded.']}
(OUT/'inventory.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'counts':dict(counts),'uniqueCandidateHosts':len(hosts),'references':len(rows),'skipped':len(skipped)}))
