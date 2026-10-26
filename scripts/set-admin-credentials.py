"""Set admin credentials over verified SSH; no plaintext password written locally."""
from pathlib import Path
import getpass,paramiko,json,hashlib,secrets,shlex,time,urllib.request,urllib.error
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=20)
username=input('New admin username: ').strip();password=getpass.getpass('New admin password: ')
salt=secrets.token_hex(16);digest=hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex()
source=r"""
const fs=require('fs'),path=require('path');
let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{
const cfg=JSON.parse(input),base=process.env.MATRIX_DATA||'/data',file=path.join(base,'registry.json');
const original=fs.readFileSync(file,'utf8'),registry=JSON.parse(original),owner=fs.statSync(file);
const code=fs.readFileSync('/app/licensing.cjs','utf8');
if(!code.includes('registry.adminUsername'))throw Error('Backend username support missing; no credentials changed');
fs.writeFileSync(file+'.before-admin-change-'+Date.now(),original,{mode:0o600});
registry.adminUsername=cfg.username;registry.salt=cfg.salt;registry.passwordHash=cfg.hash;
fs.writeFileSync(file+'.tmp',JSON.stringify(registry,null,2),{mode:0o600});fs.chownSync(file+'.tmp',owner.uid,owner.gid);fs.renameSync(file+'.tmp',file);
const access=path.join(base,'admin-access.txt');if(fs.existsSync(access))fs.writeFileSync(access,'MATRIX administrator\nCredentials updated by owner; plaintext password is not stored here.\n',{mode:0o600});
console.log('Admin credentials updated; signing key and customer/license records preserved.');
});
"""
i,o,e=c.exec_command('docker exec -i -u 0 matrix-service node -e '+shlex.quote(source));i.write(json.dumps({'username':username,'salt':salt,'hash':digest}));i.channel.shutdown_write()
out=o.read().decode();err=e.read().decode()
if o.channel.recv_exit_status():raise RuntimeError(err)
print(out.strip())
_,o,e=c.exec_command('docker restart matrix-service');o.read()
if o.channel.recv_exit_status():raise RuntimeError('Restart failed')
c.close()
payload=json.dumps({'username':username,'password':password}).encode()
for attempt in range(15):
 try:
  req=urllib.request.Request('https://matrix.vaidya-gpt.com/api/admin/login',data=payload,headers={'Content-Type':'application/json','Origin':'https://matrix.vaidya-gpt.com'})
  with urllib.request.urlopen(req,timeout=15) as response:cookie=response.headers.get('Set-Cookie','').split(';')[0];assert response.status==200
  logout=urllib.request.Request('https://matrix.vaidya-gpt.com/api/admin/logout',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://matrix.vaidya-gpt.com','Cookie':cookie})
  urllib.request.urlopen(logout,timeout=15).close();print('New admin login verified; test session logged out.');break
 except urllib.error.HTTPError as error:
  if error.code not in [502,503]:raise RuntimeError('Login verification failed: '+str(error.code))
 except urllib.error.URLError:pass
 time.sleep(2)
else:raise RuntimeError('Service did not recover in verification window')
