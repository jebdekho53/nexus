"""Publish only the tested browser runtime. Main application release is unchanged."""
from pathlib import Path
import getpass,paramiko,json,hashlib,shlex,time,urllib.request
root=Path(__file__).resolve().parent.parent
package=root.parent/'matrix-browser-build/Matrix-Browser-156.0.8078.48-win-x64.zip'
digest=hashlib.sha256(package.read_bytes()).hexdigest()
assert digest=='d115c321aabb9c0c97ce1885139af0a717501d9d97acc7629f4cf4056c8e3f61'
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=25)
def run(cmd):
 _,out,err=c.exec_command(cmd,timeout=120);value=out.read().decode();error=err.read().decode()
 if out.channel.recv_exit_status():raise RuntimeError(error or 'Remote step failed')
 return value.strip()
try:
 app=json.loads(run('docker inspect matrix-service'))[0]
 env=dict(x.split('=',1) for x in app['Config']['Env'] if '=' in x)
 releases=env.get('MATRIX_RELEASES_DIR','/app/releases');mount=next((x for x in app['Mounts'] if x['Destination']==releases),None)
 remote=mount['Source'] if mount else '/srv/matrix-releases'
 assert remote.startswith(('/srv/','/var/lib/docker/volumes/'))
 run('mkdir -p '+shlex.quote(remote))
 backup='/srv/matrix-server-before-browser-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'.cjs'
 run('docker cp matrix-service:/app/server.cjs '+backup)
 target=remote+'/'+package.name
 s=c.open_sftp()
 if run('test -f '+target+' && sha256sum '+target+' || true').split(' ')[0]!=digest:
  print('Uploading fixed Matrix Browser ZIP…',flush=True);s.put(str(package),target+'.part');assert run('sha256sum '+target+'.part').split()[0]==digest
  run('chmod 644 '+target+'.part && mv '+target+'.part '+target)
 manifest={'version':'156.0.8078.48','url':'/downloads/'+package.name,'bytes':package.stat().st_size,'sha256':digest}
 with s.open(remote+'/browser-manifest.json.next','w') as f:f.write(json.dumps(manifest))
 run('chmod 644 '+remote+'/browser-manifest.json.next && mv '+remote+'/browser-manifest.json.next '+remote+'/browser-manifest.json')
 s.put(str(root/'services/control-plane/server.cjs'),'/tmp/matrix-browser-server.cjs');s.close()
 if not mount:
  run('docker cp '+target+' matrix-service:'+releases+'/'+package.name)
  run('docker cp '+remote+'/browser-manifest.json matrix-service:'+releases+'/browser-manifest.json')
 run('chmod 644 /tmp/matrix-browser-server.cjs && docker cp /tmp/matrix-browser-server.cjs matrix-service:/app/server.cjs')
 run('docker exec matrix-service node --check /app/server.cjs && docker restart matrix-service')
 for i in range(20):
  try:
   with urllib.request.urlopen(urllib.request.Request('https://matrix.vaidya-gpt.com'+manifest['url'],method='HEAD'),timeout=15) as r:assert int(r.headers['Content-Length'])==manifest['bytes']
   break
  except Exception:
   if i==19:raise
   time.sleep(1)
 directory=(app['Config'].get('Labels') or {}).get('com.docker.compose.project.working_dir','')
 if directory.startswith('/srv/') and run('test -f '+shlex.quote(directory+'/server.cjs')+' && echo yes || true')=='yes':run('cp /tmp/matrix-browser-server.cjs '+shlex.quote(directory+'/server.cjs'))
 print('Browser ZIP hosted and HEAD verified. Main application release manifest unchanged.',flush=True)
finally:c.close()
