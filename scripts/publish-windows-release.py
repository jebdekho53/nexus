"""Publish the prepared Windows release, verifying hashes before manifest switch."""
from pathlib import Path
import getpass,paramiko,json,hashlib,zipfile,posixpath,sys
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text())['version'];build=root.parent/'matrix-build'
manifest={'version':version,'name':'Matrix','setup':None,'distribution':'windows','notes':'Windows installer and updater with server-managed trials, admin booking attribution, and desktop startup fixes.'}
kinds=[('offlineSetup','Setup')] if '--setup-only' in sys.argv else [('offlineSetup','Setup'),('updaterExe','Updater')]
manifest['notes']='Windows production release with safe cleanup of hash-matched obsolete installation files.'
for kind,label in kinds:
 p=build/f'Matrix-{label}-{version}.exe'
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  assert json.loads(z.read('package.json'))['version']==version
 manifest[kind]={'url':'/downloads/'+p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=20)
def run(cmd):
 _,o,e=c.exec_command(cmd,timeout=120);text=o.read().decode();err=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(err or 'Remote command failed')
 return text.strip()
container=json.loads(run('docker inspect matrix-service'))[0]
env=dict(x.split('=',1) for x in container['Config']['Env'] if '=' in x)
release=env.get('MATRIX_RELEASES_DIR','/app/releases')
mount=next((x for x in container['Mounts'] if x['Destination']==release),None)
remote=mount['Source'] if mount else '/srv/matrix-releases'
assert remote.startswith('/srv/') or remote.startswith('/var/lib/docker/volumes/')
run('mkdir -p '+remote)
s=c.open_sftp()
if '--setup-only' in sys.argv:
 previous=json.loads(run('cat '+remote+'/manifest.json'))
 manifest={**previous,**manifest}
for kind,label in kinds:
 item=manifest[kind];name=posixpath.basename(item['url']);target=remote+'/'+name
 print('Uploading '+name,flush=True)
 s.put(str(build/name),target+'.part')
 actual=run('sha256sum '+target+'.part').split()[0]
 assert actual==item['sha256'],'Remote digest mismatch'
 run('chmod 644 '+target+'.part && mv '+target+'.part '+target)
 if not mount:run('docker exec -u 0 matrix-service mkdir -p '+release+' && docker cp '+target+' matrix-service:'+release+'/'+name)
 print('Verified '+name,flush=True)
with s.open(remote+'/manifest.json.next','w') as f:f.write(json.dumps(manifest,indent=2))
run('if test -f '+remote+'/manifest.json; then cp '+remote+'/manifest.json '+remote+'/manifest.json.before-'+version+'; fi; chmod 644 '+remote+'/manifest.json.next; mv '+remote+'/manifest.json.next '+remote+'/manifest.json')
if not mount:run('docker cp '+remote+'/manifest.json matrix-service:'+release+'/manifest.json')
s.close();c.close();(build/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Published Windows '+version+'; installer/updater hashes verified.',flush=True)
