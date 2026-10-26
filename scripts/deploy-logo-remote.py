"""Logo-only deployment; password read interactively and never written to disk."""
from pathlib import Path
import getpass, paramiko

root=Path(__file__).resolve().parent.parent
client=paramiko.SSHClient()
client.load_host_keys(str(Path.home()/'.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect('103.184.184.6',username='root',password=getpass.getpass('Server password: '),look_for_keys=False,allow_agent=False,timeout=15)
def run(command):
    _,out,err=client.exec_command(command,timeout=60)
    result=out.read().decode();error=err.read().decode()
    if result:print(result)
    if error:print(error)
    if out.channel.recv_exit_status():raise RuntimeError('Remote command failed')
run("test -f /srv/matrix/server.cjs || docker inspect matrix-service >/dev/null")
sftp=client.open_sftp()
sftp.put(str(root/'diagnostics/matrix-logo-update.tar.gz'),'/tmp/matrix-logo-update.tar.gz')
sftp.close()
run('mkdir -p /tmp/matrix-logo-deploy && tar -xzf /tmp/matrix-logo-update.tar.gz -C /tmp/matrix-logo-deploy && sh /tmp/matrix-logo-deploy/matrix-logo-update/apply-logo.sh')
run('curl -fsS https://matrix.vaidya-gpt.com/health')
client.close()
