import paramiko
import hashlib
import time
from pathlib import Path

LOCAL_DIR = Path(r'C:\Users\lexus\Documents\nexus\nexus\nexus\services\control-plane')
HOST = '103.184.184.6'
USER = 'root'
PASS = r'qUu&Y48Rw)(H@4k1'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

def exec_cmd(cmd, check=True):
    print(f">> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(out.strip())
    if err.strip():
        print("STDERR:", err.strip())
    status = stdout.channel.recv_exit_status()
    if check and status != 0:
        raise RuntimeError(f"Command failed with exit status {status}: {cmd}")
    return out

# Step 1: Backup current /opt/matrix
timestamp = int(time.time())
backup_tar = f"/root/matrix-backup-before-logo-{timestamp}.tar.gz"
exec_cmd(f"tar -czf {backup_tar} /opt/matrix")
print(f"Created backup: {backup_tar}")

# Step 2: Upload updated files via SFTP
sftp = ssh.open_sftp()

def ensure_remote_dir(remote_dir):
    parts = remote_dir.strip('/').split('/')
    cur = ''
    for p in parts:
        cur += '/' + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)

uploaded = []
for p in LOCAL_DIR.rglob('*'):
    if p.is_file() and 'node_modules' not in p.parts and not p.name.endswith('.test.cjs'):
        rel = p.relative_to(LOCAL_DIR).as_posix()
        remote_file = f"/opt/matrix/{rel}"
        remote_dir = '/'.join(remote_file.split('/')[:-1])
        ensure_remote_dir(remote_dir)
        
        sftp.put(str(p), remote_file)
        uploaded.append(rel)
        print(f"Uploaded: {rel} ({p.stat().st_size:,} bytes)")

sftp.close()
print(f"Total uploaded files: {len(uploaded)}")

# Step 3: Copy updated assets and admin files directly into running container
exec_cmd("docker cp /opt/matrix/assets/. matrix-service:/app/assets/")
exec_cmd("docker cp /opt/matrix/admin/. matrix-service:/app/admin/")
exec_cmd("docker cp /opt/matrix/hierarchy.cjs matrix-service:/app/hierarchy.cjs")
exec_cmd("docker cp /opt/matrix/licensing.cjs matrix-service:/app/licensing.cjs")
exec_cmd("docker cp /opt/matrix/server.cjs matrix-service:/app/server.cjs")

# Step 4: Rebuild docker image so future container recreation retains changes
exec_cmd("cd /opt/matrix && docker build -t matrix-control-plane:local .")

# Step 5: Restart matrix-service
exec_cmd("docker restart matrix-service")
time.sleep(3)

# Step 6: Verify healthcheck inside container
exec_cmd("docker exec matrix-service node -e \"fetch('http://127.0.0.1:8082/health').then(r=>r.json()).then(console.log)\"")

# Step 7: Check asset sizes inside container
exec_cmd("docker exec matrix-service ls -la /app/assets")

ssh.close()
print("Deployment completed successfully!")
