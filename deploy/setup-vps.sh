#!/usr/bin/env bash
# One-time provisioning script for a fresh OVH VPS-1 (Ubuntu LTS assumed).
# Run once as root/sudo over SSH. Read it before running — in particular,
# the "deploy" user's authorized_keys step below needs your GitHub Actions
# deploy keypair's PUBLIC key pasted in before (or right after) running this.
#
# Usage: scp this file to the VPS, then: sudo bash setup-vps.sh
#
# NOTE: the deploy user is named "deploy" and the app lives in
# /home/deploy/bedzieigla — these are hardcoded in deploy/ecosystem.config.js
# (cwd) and assumed by deploy/nginx.conf.template (root). The GitHub Actions
# secret VPS_USER MUST therefore be set to exactly "deploy", or those paths
# and the rsync target will disagree.
set -euo pipefail

APP_USER=deploy
APP_DIR=/home/$APP_USER/bedzieigla

echo "==> 1. System update"
apt-get update && apt-get upgrade -y

echo "==> 2. Firewall (ufw)"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> 3. Deploy user (non-root, runs PM2 and receives CI deploys)"
# Deliberately NOT added to the sudo group: this account's private key lives in
# GitHub Actions secrets, so it should have no path to root if that key leaks.
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi
mkdir -p "/home/$APP_USER/.ssh"
touch "/home/$APP_USER/.ssh/authorized_keys"
echo "    >>> Paste your GitHub Actions deploy keypair's PUBLIC key into"
echo "    >>> /home/$APP_USER/.ssh/authorized_keys before the first CI deploy runs."
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
chmod 700 "/home/$APP_USER/.ssh"
chmod 600 "/home/$APP_USER/.ssh/authorized_keys"

# rsync creates only the LAST path component, so the app dir must exist up front
# or the very first CI deploy fails with "mkdir ... No such file or directory".
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/build"

echo "==> 4. SSH hardening (key-only auth, no root login)"
install -d /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
ChallengeResponseAuthentication no
EOF
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

echo "==> 5. Node.js LTS via NodeSource"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git rsync

echo "==> 6. pnpm via corepack (bundled with Node 22)"
corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "==> 7. PM2 (global, so the deploy user + systemd can both invoke pm2)"
npm install -g pm2

echo "==> 8. Nginx + certbot + automatic security updates + fail2ban"
apt-get install -y nginx certbot python3-certbot-nginx unattended-upgrades fail2ban
systemctl enable --now fail2ban

echo "==> 9. Nginx security-headers snippet (see nginx.conf.template)"
install -d /etc/nginx/snippets
cat > /etc/nginx/snippets/bedzieigla-security.conf <<'EOF'
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy "geolocation=(self), microphone=(), camera=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org https://*.s3.*.perf.cloud.ovh.net https://picsum.photos https://*.picsum.photos https://www.google-analytics.com; connect-src 'self' https://router.project-osrm.org https://*.s3.*.perf.cloud.ovh.net https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net; frame-ancestors 'none';" always;
EOF

echo "==> 10. PM2 startup on boot (registers a systemd service for the deploy user)"
su - "$APP_USER" -c "pm2 startup systemd -u $APP_USER --hp /home/$APP_USER" | tail -n1 > /tmp/pm2-startup-cmd.sh
bash /tmp/pm2-startup-cmd.sh

echo ""
echo "Provisioning done. Remaining manual steps:"
echo "  1. Add the CI deploy public key to /home/$APP_USER/.ssh/authorized_keys (see step 3)"
echo "  2. Copy deploy/ecosystem.config.js into $APP_DIR/"
echo "  3. Create $APP_DIR/.env from deploy/.env.example with real SMTP_*/CONTACT_TO_EMAIL values"
echo "     chmod 600 $APP_DIR/.env  # contains the Gmail App Password"
echo "  4. Bootstrap Nginx on port 80 only, then run:"
echo "       certbot --nginx -d bedzieigla.pl -d www.bedzieigla.pl"
echo "     (see the BOOTSTRAP ORDER note at the top of deploy/nginx.conf.template —"
echo "      installing the TLS block before certs exist will fail 'nginx -t')"
echo "  5. Install the full deploy/nginx.conf.template, then: nginx -t && systemctl reload nginx"
echo "  6. Push to main (or run the first CI deploy), then as $APP_USER:"
echo "       cd $APP_DIR && pnpm install --prod && pm2 start ecosystem.config.js && pm2 save"
