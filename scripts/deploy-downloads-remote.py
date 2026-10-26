"""Deploy only the Windows-only downloads page and its existing public script."""
from pathlib import Path
import getpass,paramiko
root=Path(__file__).resolve().parent.parent
c=paramiko.SSHClient();c.load_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=c.exec_command(cmd,timeout=40);out=o.read().decode();err=e.read().decode()
 if out:print(out)
 if err:print(err)
 if o.channel.recv_exit_status():raise RuntimeError('Deployment step failed')
run('mkdir -p /tmp/matrix-windows-downloads; docker exec matrix-service tar -czf - -C /app/admin downloads.html public.js > /srv/matrix-downloads-backup-$(date -u +%Y%m%dT%H%M%SZ).tar.gz')
s=c.open_sftp()
for name in ['downloads.html','public.js']:s.put(str(root/'services/control-plane/admin'/name),'/tmp/matrix-windows-downloads/'+name)
s.close()
run('for f in downloads.html public.js; do docker cp /tmp/matrix-windows-downloads/$f matrix-service:/app/admin/$f; if test -d /srv/matrix/admin; then cp /tmp/matrix-windows-downloads/$f /srv/matrix/admin/$f; fi; done')
c.close();print('Windows installer/updater page deployed. No release files or account data changed.')
