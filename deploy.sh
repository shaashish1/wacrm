#!/bin/bash
set -euo pipefail

# ============================================================
# wacrm VPS Deployment Script
# Deploys: Supabase (Docker), Redis, Next.js app, Baileys worker
# ============================================================

DOMAIN="wacrm.itgyani.com"
APP_DIR="/opt/wacrm"
SUPABASE_DIR="/opt/supabase"
REPO_URL="https://github.com/shaashish1/wacrm.git"

echo "=========================================="
echo " wacrm Deployment Script"
echo " Domain: $DOMAIN"
echo "=========================================="

# ---------------------------------------------------------
# 1. Detect OS and install system packages
# ---------------------------------------------------------
echo ""
echo "[1/10] Installing system packages..."

if command -v apt-get &>/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl wget git build-essential ca-certificates gnupg lsb-release
elif command -v yum &>/dev/null; then
    yum install -y curl wget git gcc-c++ make ca-certificates
else
    echo "ERROR: Unsupported package manager. Need apt or yum."
    exit 1
fi

# ---------------------------------------------------------
# 2. Install Docker
# ---------------------------------------------------------
echo ""
echo "[2/10] Installing Docker..."

if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "Docker already installed: $(docker --version)"
fi

if ! command -v docker compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    echo "Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin 2>/dev/null || true
fi

# ---------------------------------------------------------
# 3. Install Node.js 20
# ---------------------------------------------------------
echo ""
echo "[3/10] Installing Node.js 20..."

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
fi

npm install -g pm2

# ---------------------------------------------------------
# 4. Install Redis
# ---------------------------------------------------------
echo ""
echo "[4/10] Installing Redis..."

if ! command -v redis-server &>/dev/null; then
    apt-get install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
else
    echo "Redis already installed"
    systemctl start redis-server 2>/dev/null || true
fi

# ---------------------------------------------------------
# 5. Install Nginx + Certbot
# ---------------------------------------------------------
echo ""
echo "[5/10] Installing Nginx and Certbot..."

apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx

# ---------------------------------------------------------
# 6. Set up Supabase (self-hosted via Docker)
# ---------------------------------------------------------
echo ""
echo "[6/10] Setting up self-hosted Supabase..."

# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({role:'anon',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+315360000})).toString('base64url');
const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
console.log(header+'.'+payload+'.'+sig);
")
SERVICE_ROLE_KEY=$(node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({role:'service_role',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+315360000})).toString('base64url');
const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
console.log(header+'.'+payload+'.'+sig);
")
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DASHBOARD_PASSWORD=$(openssl rand -hex 16)

if [ ! -d "$SUPABASE_DIR" ]; then
    git clone --depth 1 https://github.com/supabase/supabase.git "$SUPABASE_DIR"
fi

cd "$SUPABASE_DIR/docker"

# Create .env from example
cp -n .env.example .env 2>/dev/null || true

# Update .env with our values
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
sed -i "s|SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" .env
sed -i "s|DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=admin|" .env
sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD|" .env
sed -i "s|SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$DOMAIN|" .env

# Pull and start Supabase
docker compose pull
docker compose up -d

echo "Waiting for Supabase to be ready..."
sleep 15

# Verify Supabase is running
for i in {1..30}; do
    if curl -s http://localhost:8000/rest/v1/ -H "apikey: $ANON_KEY" | grep -q ""; then
        echo "Supabase is ready!"
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 5
done

# ---------------------------------------------------------
# 7. Clone and build the app
# ---------------------------------------------------------
echo ""
echo "[7/10] Cloning and building wacrm..."

if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Build shared package first
cd packages/shared
npm install
npm run build
cd "$APP_DIR"

# Install and build web app
cd apps/web
npm install --install-links
npm run build
cd "$APP_DIR"

# Install and build worker
cd apps/worker
npm install --install-links
npm run build
cd "$APP_DIR"

# ---------------------------------------------------------
# 8. Generate environment files
# ---------------------------------------------------------
echo ""
echo "[8/10] Generating environment files..."

ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
META_APP_SECRET=$(openssl rand -hex 32)

# Web app .env.local
cat > "$APP_DIR/apps/web/.env.local" << ENVEOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
META_APP_SECRET=$META_APP_SECRET
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_APP_LOCALE=en
ENVEOF

# Worker .env
cat > "$APP_DIR/apps/worker/.env" << ENVEOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
REDIS_URL=redis://localhost:6379
WEBHOOK_URL=http://127.0.0.1:3000/api/whatsapp/webhook
META_APP_SECRET=$META_APP_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENVEOF

# ---------------------------------------------------------
# 9. Run database migrations
# ---------------------------------------------------------
echo ""
echo "[9/10] Running database migrations..."

# Get the Postgres container name
PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i 'supabase.*db' | head -1)

if [ -z "$PG_CONTAINER" ]; then
    PG_CONTAINER="supabase-db"
fi

# Apply all migrations in order
for migration in "$APP_DIR"/supabase/migrations/*.sql; do
    echo "  Applying $(basename "$migration")..."
    docker exec -i "$PG_CONTAINER" psql -U postgres -d postgres < "$migration" 2>&1 || {
        echo "  Warning: $(basename "$migration") had errors (may be idempotent, continuing)"
    }
done

echo "Migrations complete."

# ---------------------------------------------------------
# 10. Start services with PM2
# ---------------------------------------------------------
echo ""
echo "[10/10] Starting services with PM2..."

# Stop existing if any
pm2 delete wacrm-web 2>/dev/null || true
pm2 delete wacrm-worker 2>/dev/null || true

# Start web app (production mode)
cd "$APP_DIR/apps/web"
pm2 start npm --name wacrm-web -- run start

# Start worker
cd "$APP_DIR/apps/worker"
pm2 start npm --name wacrm-worker -- run start

# Save PM2 config and set up startup
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

cd "$APP_DIR"

# ---------------------------------------------------------
# Configure Nginx
# ---------------------------------------------------------
echo ""
echo "Configuring Nginx..."

cat > /etc/nginx/sites-available/wacrm << 'NGINXEOF'
server {
    listen 80;
    server_name wacrm.itgyani.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/wacrm /etc/nginx/sites-enabled/wacrm
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# ---------------------------------------------------------
# SSL with Let's Encrypt
# ---------------------------------------------------------
echo ""
echo "Setting up SSL..."
echo "NOTE: DNS A record for $DOMAIN must point to this server's IP."
echo ""

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" --redirect || {
    echo ""
    echo "WARNING: SSL setup failed. This usually means DNS is not pointing to this server yet."
    echo "After updating DNS, run: certbot --nginx -d $DOMAIN"
}

# ---------------------------------------------------------
# Done!
# ---------------------------------------------------------
echo ""
echo "=========================================="
echo " Deployment Complete!"
echo "=========================================="
echo ""
echo " App URL:          https://$DOMAIN"
echo " Supabase Studio:  http://127.0.0.1:8443 (local only)"
echo " Supabase API:     http://127.0.0.1:8000"
echo ""
echo " Dashboard login:  admin / $DASHBOARD_PASSWORD"
echo ""
echo " PM2 commands:"
echo "   pm2 status          - check services"
echo "   pm2 logs wacrm-web  - view web logs"
echo "   pm2 logs wacrm-worker - view worker logs"
echo "   pm2 restart all     - restart everything"
echo ""
echo " Credentials saved to: $APP_DIR/.deploy-credentials"
echo "=========================================="

# Save credentials
cat > "$APP_DIR/.deploy-credentials" << CREDEOF
Domain: https://$DOMAIN
Supabase Studio: http://127.0.0.1:8443
Dashboard: admin / $DASHBOARD_PASSWORD
Postgres Password: $POSTGRES_PASSWORD
JWT Secret: $JWT_SECRET
Anon Key: $ANON_KEY
Service Role Key: $SERVICE_ROLE_KEY
Encryption Key: $ENCRYPTION_KEY
Meta App Secret: $META_APP_SECRET
CREDEOF
chmod 600 "$APP_DIR/.deploy-credentials"

echo ""
echo "IMPORTANT: Delete vps.md from your local repo!"
echo ""
