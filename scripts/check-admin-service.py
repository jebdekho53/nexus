from pathlib import Path
import getpass,paramiko,json
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=20)
_,o,_=c.exec_command('docker inspect matrix-service');obj=json.loads(o.read())[0]
print('State:',obj['State']['Status'],'User:',obj['Config']['User'])
mount=next(x for x in obj['Mounts'] if x['Destination']=='/data')
s=c.open_sftp();p=mount['Source']+'/registry.json';st=s.stat(p);print('Registry owner:',st.st_uid,st.st_gid)
if obj['Config']['User']=='node' and st.st_uid==0:
 s.chown(p,1000,1000);print('Restored registry ownership to service user.')
s.close()
_,o,e=c.exec_command('docker restart matrix-service');o.read();print('Restart status:',o.channel.recv_exit_status());c.close()
