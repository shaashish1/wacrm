import paramiko
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

hostname = "187.127.165.117"
username = "root"
password = "BlockTrade5#"

print(f"Connecting to VPS at {hostname}...")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(hostname=hostname, username=username, password=password, timeout=15)
    print("SSH connection successful!")

    commands = [
        "cd /opt/wacrm && git fetch origin main && git reset --hard origin/main",
        "PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i 'supabase.*db' | head -1) && docker exec -i $PG_CONTAINER psql -U postgres -d postgres < /opt/wacrm/supabase/migrations/050_seed_admin_user.sql",
        "cd /opt/wacrm/apps/web && npm run build && pm2 restart wacrm-web"
    ]

    for cmd in commands:
        print(f"\n==========================================")
        print(f" Executing: {cmd}")
        print(f"==========================================")
        stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
        
        while True:
            try:
                line = stdout.readline()
                if not line:
                    break
                print(line, end="", flush=True)
            except UnicodeDecodeError:
                continue
            except Exception as e:
                print(f"[Log Error] {e}")

        exit_code = stdout.channel.recv_exit_status()
        print(f"\nCommand exit code: {exit_code}")

except Exception as e:
    print(f"SSH Error: {e}")
finally:
    client.close()
