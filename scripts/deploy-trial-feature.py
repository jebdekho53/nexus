"""Deploy tested trial/IP modules without replacing persistent customer data."""
from pathlib import Path
import getpass,paramiko,json,hashlib,posixpath
root=Path(__file__).resolve().parent.parent;source=root/'services/control-plane'
files=['server.cjs','licensing.cjs','hierarchy.cjs','trials.cjs','client-address.cjs','admin/index.html','admin/portal.js','admin/trials.js']
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=20)
def run(command):
 _,o,e=c.exec_command(command,timeout=60);text=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error or 'Remote step failed')
 return text.strip()
app=json.loads(run('docker inspect matrix-service'))[0]
names=run("docker ps --format '{{.Names}}'").splitlines()
proxy=next((n for n in names if 'caddy' in n.lower()),None)
if not proxy:raise RuntimeError('Reverse proxy container not found; running containers: '+', '.join(names))
caddy=json.loads(run('docker inspect '+proxy))[0]
common=set(app['NetworkSettings']['Networks'])&set(caddy['NetworkSettings']['Networks'])
trusted=[caddy['NetworkSettings']['Networks'][n]['IPAddress'] for n in common if caddy['NetworkSettings']['Networks'][n]['IPAddress']]
if not trusted:raise RuntimeError('No shared reverse-proxy network found; no changes made')
run('docker exec matrix-service tar -czf - -C /app server.cjs licensing.cjs hierarchy.cjs admin > /srv/matrix-before-trial-$(date -u +%Y%m%dT%H%M%SZ).tar.gz; mkdir -p /tmp/matrix-trial-upload/admin')
s=c.open_sftp()
for name in files:s.put(str(source/name),'/tmp/matrix-trial-upload/'+name)
with s.open('/tmp/matrix-trial-upload/trusted-proxies.json','w') as f:f.write(json.dumps(trusted))
s.close()
for name in files+['trusted-proxies.json']:
 run('chmod 644 /tmp/matrix-trial-upload/'+name+'; docker cp /tmp/matrix-trial-upload/'+name+' matrix-service:/app/'+name)
 expected=hashlib.sha256((source/name).read_bytes()).hexdigest() if name!='trusted-proxies.json' else None
 if expected:assert run('docker exec matrix-service sha256sum /app/'+name).split()[0]==expected
# Preserve the selected code changes in the compose source when it exists.
directory=(app['Config'].get('Labels') or {}).get('com.docker.compose.project.working_dir','')
if directory.startswith('/srv/') and run('test -f '+directory+'/server.cjs && echo yes || true')=='yes':
 for name in files+['trusted-proxies.json']:run('cp /tmp/matrix-trial-upload/'+name+' '+directory+'/'+name)
run('docker exec matrix-service node --check /app/server.cjs; docker exec matrix-service node --check /app/trials.cjs; docker exec matrix-service node --check /app/licensing.cjs; docker restart matrix-service')
c.close();print('Trial/IP modules deployed; trusted proxy allowlist installed; persistent registry/trial records preserved.')
