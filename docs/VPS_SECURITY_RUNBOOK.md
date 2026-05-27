# Runbook: VPS Security Setup, Deploy, Backup, and Verification

**Owner:** Engineering + Operations | **Frequency:** Initial VPS setup, every deploy, and monthly security review
**Last Updated:** 2026-05-26 | **Last Run:** Not yet run in production

## Purpose

Use this runbook to prepare a new TEMBUS VPS, deploy the production Docker Compose stack, keep production secrets outside Git, rotate secrets, back up and restore PostgreSQL, and verify the final security checklist. The target is a practical startup-grade VPS setup that can later move to managed KMS, object storage, and cloud private networking without changing application code.

This runbook assumes:

- Ubuntu 22.04 or 24.04 LTS.
- Public traffic terminates at a reverse proxy on the VPS.
- Docker Compose production stack uses `docker-compose.prod.yml`.
- Production secrets live only on the VPS at `/opt/tembus/secrets/.env.production`.
- GitHub Actions secrets are used for CI/CD credentials, registry access, and SSH deploy access.

## Severity

| Severity | Criteria | Response |
|---|---|---|
| SEV1 | VPS compromised, private key leaked, production `.env.production` exposed, or database backup publicly accessible. | Stop deploys, revoke keys, rotate all secrets, restore from known-good backup if needed. |
| SEV2 | Firewall or fail2ban disabled, unexpected public database/cache port, or backup failing for more than 24 hours. | Fix immediately before next deploy. |
| SEV3 | Missing package updates, expired TLS certificate warning, or documentation drift. | Fix in the next maintenance window. |

## Prerequisites

- [ ] DNS records for `api`, customer app, and admin app.
- [ ] SSH public key for the deployment user.
- [ ] GitHub repository admin access for Actions Secrets.
- [ ] VPS provider console access for emergency recovery.
- [ ] Domain TLS plan, for example Caddy automatic TLS or Nginx plus Certbot.
- [ ] Local copy of this repo on the VPS under `/opt/tembus/app`.

## Standard Paths

| Purpose | Path |
|---|---|
| Application checkout | `/opt/tembus/app` |
| Production secrets | `/opt/tembus/secrets/.env.production` |
| PostgreSQL backups | `/opt/tembus/backups/postgres` |
| Deployment releases | `/opt/tembus/releases` |
| Runtime logs | `docker logs` and Docker json logs |
| Compose file | `/opt/tembus/app/docker-compose.prod.yml` |
| Security verification script | `/opt/tembus/app/scripts/ops/verify-vps-security.sh` |

## Procedure

### Step 1: Create Non-Root Deploy User

Run as root from a fresh VPS session.

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' 'PASTE_DEPLOY_PUBLIC_KEY_HERE' > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

**Expected result:** Login with `ssh deploy@SERVER_IP` succeeds.
**If it fails:** Use the provider console, confirm the public key is one line, and check `/var/log/auth.log`.

### Step 2: Harden SSH

Create a drop-in SSH config.

```bash
cat >/etc/ssh/sshd_config.d/99-tembus-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowUsers deploy
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

sshd -t
systemctl reload ssh
```

Keep the current root shell open until a second terminal confirms `deploy` can log in.

**Expected result:** Password login and root SSH login are disabled.
**If it fails:** Revert the drop-in from the provider console and run `sshd -t` again.

### Step 3: Configure Firewall

Allow only SSH, HTTP, and HTTPS at the host boundary.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

**Expected result:** Only ports `22`, `80`, and `443` are open publicly.
**If it fails:** Check provider firewall/security-group rules too. The provider firewall must not expose PostgreSQL, Redis, RabbitMQ, or internal service ports.

### Step 4: Install Fail2ban

```bash
apt-get update
apt-get install -y fail2ban

cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
findtime = 10m
bantime = 1h
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
```

**Expected result:** `sshd` jail is enabled.
**If it fails:** Confirm `/var/log/auth.log` exists. On systems using journald-only logging, configure fail2ban backend to `systemd`.

### Step 5: Install Docker Engine and Compose Plugin

```bash
apt-get install -y ca-certificates curl gnupg openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" >/etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
systemctl enable --now docker
docker version
docker compose version
```

Log out and back in as `deploy` so the Docker group membership applies.

**Expected result:** `deploy` can run `docker ps` without `sudo`.
**If it fails:** Check `groups deploy`, then restart the SSH session.

### Step 6: Create TEMBUS Directories

```bash
install -d -m 755 -o deploy -g deploy /opt/tembus/app
install -d -m 700 -o deploy -g deploy /opt/tembus/secrets
install -d -m 700 -o deploy -g deploy /opt/tembus/backups/postgres
install -d -m 755 -o deploy -g deploy /opt/tembus/releases
```

**Expected result:** Only `deploy` and root can read `/opt/tembus/secrets` and backups.
**If it fails:** Fix ownership with `chown -R deploy:deploy /opt/tembus`.

### Step 7: Place Production Secrets on the VPS

As `deploy`, copy the template and fill real values on the server only.

```bash
cd /opt/tembus/app
cp .env.production.example /opt/tembus/secrets/.env.production
chmod 600 /opt/tembus/secrets/.env.production
nano /opt/tembus/secrets/.env.production
```

Generate strong secrets:

```bash
openssl rand -base64 48
openssl rand -hex 32
```

Minimum values that must be real and non-default:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `READ_DATABASE_URL`
- `MIGRATION_DATABASE_DSN`
- `REDIS_PASSWORD`
- `REDIS_URL`
- `RABBITMQ_DEFAULT_PASS`
- `RABBITMQ_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `INTERNAL_GATEWAY_SECRET`
- `METRICS_BEARER_TOKEN`
- `ALLOWED_ORIGINS`
- `FRONTEND_URL`
- `PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `VITE_API_URL`
- Provider keys that are enabled in production: Midtrans, Firebase, Maps, Verihubs, S3.

**Expected result:** Real secret file exists at `/opt/tembus/secrets/.env.production` and is never copied into the repo.
**If it fails:** Do not deploy. Missing required variables should make Compose or runtime startup fail-fast.

### Step 8: Configure GitHub Actions Secrets

Set these in GitHub repository settings, not in source files:

| Secret | Use |
|---|---|
| `VPS_HOST` | Target VPS hostname or IP |
| `VPS_USER` | Usually `deploy` |
| `VPS_SSH_KEY` | Private key for deploy automation |
| `GHCR_TOKEN` | Optional registry token if `GITHUB_TOKEN` is not enough |
| `ANDROID_COURIER_GOOGLE_SERVICES_JSON_B64` | Optional base64 encoded courier `google-services.json` for Android release builds |
| `ANDROID_CUSTOMER_GOOGLE_SERVICES_JSON_B64` | Optional base64 encoded customer `google-services.json` for Android release builds |
| `TEST_USER_EMAIL` | E2E staging test user |
| `TEST_USER_PASSWORD` | E2E staging test password |

Use GitHub Variables for non-secret values:

| Variable | Use |
|---|---|
| `STAGING_URL` | Browser E2E base URL |
| `PRODUCTION_URL` | Production smoke-test base URL |

**Expected result:** CI can build images and deployment can SSH without embedding credentials in workflow YAML.
**If it fails:** Recreate the deploy key and remove old keys from `/home/deploy/.ssh/authorized_keys`.

Android Firebase config rule:

- Real `google-services.json` files must not be committed.
- Use `android-app/app/google-services.example.json` and `android-app-customer/app/google-services.example.json` as templates only.
- Mobile CI recreates real `google-services.json` from `ANDROID_COURIER_GOOGLE_SERVICES_JSON_B64` and `ANDROID_CUSTOMER_GOOGLE_SERVICES_JSON_B64` when those GitHub Secrets are present.
- Before production, rotate or restrict any Firebase Android API key that ever appeared in Git history.
- Restrict Firebase/Google API keys by Android package name and SHA-1/SHA-256 signing certificate fingerprint.

### Step 9: Validate Production Compose Before First Start

```bash
cd /opt/tembus/app
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml config >/tmp/tembus-compose-rendered.yml
grep -Ei 'changeme|guest:guest|tembus_secret_key_change_me|PASSWORD_RAW|PASSWORD_URL_ENCODED|REDIS_PASSWORD_URL_ENCODED|RABBITMQ_PASSWORD_URL_ENCODED' /tmp/tembus-compose-rendered.yml && exit 1
rm -f /tmp/tembus-compose-rendered.yml
```

**Expected result:** Config renders and grep finds nothing.
**If it fails:** Fix `/opt/tembus/secrets/.env.production` before continuing.

### Step 10: Run Database Migrations

```bash
cd /opt/tembus/app
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml --profile migrate run --rm migrate
```

**Expected result:** Goose migration exits with status `0`.
**If it fails:** Stop. Read the migration error, fix migration or env DSN, and rerun. Do not start app containers against a partially migrated schema.

### Step 11: Start or Update Production Stack

For first deploy:

```bash
cd /opt/tembus/app
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml ps
```

For image-based deploy from CI/GHCR:

```bash
cd /opt/tembus/app
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml pull
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml up -d
docker image prune -f
```

**Expected result:** All service healthchecks become healthy.
**If it fails:** Check the failing container only:

```bash
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml logs --tail 200 SERVICE_NAME
```

### Step 12: Configure Reverse Proxy and TLS

The Compose file binds public-facing app ports to `127.0.0.1` by default. Terminate TLS at the reverse proxy and proxy to local ports.

Example Caddy layout:

```caddyfile
api.example.com {
  reverse_proxy 127.0.0.1:8080
}

app.example.com {
  reverse_proxy 127.0.0.1:3000
}

admin.example.com {
  reverse_proxy 127.0.0.1:3002
}
```

**Expected result:** Only HTTPS is used by browsers and provider webhooks.
**If it fails:** Confirm `PUBLIC_BIND=127.0.0.1`, local ports are listening, and DNS points to the VPS.

### Step 13: Create PostgreSQL Backup Script

Create `/opt/tembus/backups/postgres/backup-postgres.sh`:

```bash
cat >/opt/tembus/backups/postgres/backup-postgres.sh <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="/opt/tembus/backups/postgres"
ENV_FILE="/opt/tembus/secrets/.env.production"
COMPOSE_FILE="/opt/tembus/app/docker-compose.prod.yml"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/tembus-postgres-$TIMESTAMP.dump"

cd /opt/tembus/app
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUTPUT"

chmod 600 "$OUTPUT"
find "$BACKUP_DIR" -type f -name 'tembus-postgres-*.dump' -mtime +14 -delete
printf 'backup created: %s\n' "$OUTPUT"
EOF

chmod 700 /opt/tembus/backups/postgres/backup-postgres.sh
```

Create a systemd timer:

```bash
cat >/etc/systemd/system/tembus-postgres-backup.service <<'EOF'
[Unit]
Description=TEMBUS PostgreSQL backup

[Service]
Type=oneshot
User=deploy
Group=deploy
ExecStart=/opt/tembus/backups/postgres/backup-postgres.sh
EOF

cat >/etc/systemd/system/tembus-postgres-backup.timer <<'EOF'
[Unit]
Description=Run TEMBUS PostgreSQL backup every night

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now tembus-postgres-backup.timer
systemctl list-timers tembus-postgres-backup.timer
```

**Expected result:** A compressed custom-format dump appears nightly in `/opt/tembus/backups/postgres`.
**If it fails:** Run `systemctl status tembus-postgres-backup.service` and check Docker/DB health.

### Step 14: Restore PostgreSQL From Backup

Only restore into a fresh or intentionally reset database.

```bash
cd /opt/tembus/app
BACKUP_FILE=/opt/tembus/backups/postgres/tembus-postgres-YYYYMMDDTHHMMSSZ.dump

docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml stop api-gateway admin-service auth-service order-service routing-service payment-service frontend admin-dashboard

docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml exec -T db \
  sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"'

docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml exec -T db \
  sh -c 'createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$BACKUP_FILE"

docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml up -d
```

**Expected result:** Services start and critical smoke tests pass.
**If it fails:** Keep services stopped, preserve the failed restore logs, and restore the previous known-good dump.

### Step 15: Rotate Secrets

Use this procedure for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_GATEWAY_SECRET`, `METRICS_BEARER_TOKEN`, Redis/RabbitMQ passwords, provider keys, or any exposed key.

1. Generate the new secret:

```bash
openssl rand -base64 48
```

2. Edit `/opt/tembus/secrets/.env.production`.

3. Restart only services that consume the rotated secret:

```bash
cd /opt/tembus/app
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml up -d --force-recreate api-gateway admin-service auth-service order-service payment-service
```

4. For provider keys, revoke the old key in the provider dashboard after traffic is healthy.

5. For JWT signing key rotation, expect existing sessions to be invalidated unless a dual-key validation window is implemented later.

**Expected result:** New requests work with the new secret and old exposed credentials no longer work.
**If it fails:** Roll back the env file from the root-only backup copy, restart affected services, then diagnose in staging.

### Step 16: Deploy Rollback

If the newest image release fails:

```bash
cd /opt/tembus/app
cp /opt/tembus/secrets/.env.production /opt/tembus/secrets/.env.production.rollback.$(date -u +%Y%m%dT%H%M%SZ)
nano /opt/tembus/secrets/.env.production
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml pull
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml up -d
```

Set image variables back to the previous known-good tag, for example:

```env
API_GATEWAY_IMAGE=ghcr.io/owner/repo/api-gateway:staging-PREVIOUS_SHA
ADMIN_SERVICE_IMAGE=ghcr.io/owner/repo/admin-service:staging-PREVIOUS_SHA
AUTH_SERVICE_IMAGE=ghcr.io/owner/repo/auth-service:staging-PREVIOUS_SHA
ORDER_SERVICE_IMAGE=ghcr.io/owner/repo/order-service:staging-PREVIOUS_SHA
ROUTING_SERVICE_IMAGE=ghcr.io/owner/repo/routing-service:staging-PREVIOUS_SHA
PAYMENT_SERVICE_IMAGE=ghcr.io/owner/repo/payment-service:staging-PREVIOUS_SHA
FRONTEND_IMAGE=ghcr.io/owner/repo/frontend:staging-PREVIOUS_SHA
ADMIN_DASHBOARD_IMAGE=ghcr.io/owner/repo/admin-dashboard:staging-PREVIOUS_SHA
```

**Expected result:** Healthchecks recover on the previous image set.
**If it fails:** Restore the previous database backup only if the failed release ran irreversible data changes and engineering approves the restore.

## Verification

Run the automated VPS gate:

```bash
cd /opt/tembus/app
chmod +x scripts/ops/verify-vps-security.sh
ENV_FILE=/opt/tembus/secrets/.env.production API_BASE_URL=https://api.example.com ./scripts/ops/verify-vps-security.sh
```

Manual checklist:

- [ ] `git log --all --full-history -- .env` returns no commits.
- [ ] `gitleaks detect --source . --redact` passes.
- [ ] `trivy fs --severity HIGH,CRITICAL --exit-code 1 .` passes or every finding has an accepted remediation ticket.
- [ ] `docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml config` renders without weak/default secret markers.
- [ ] `docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml ps` shows healthy services.
- [ ] `ufw status verbose` only exposes SSH, HTTP, and HTTPS.
- [ ] Provider firewall does not expose PostgreSQL, Redis, RabbitMQ, or internal service ports.
- [ ] `/opt/tembus/secrets/.env.production` has permission `600` or `640`.
- [ ] `/opt/tembus/backups/postgres` has permission `700`.
- [ ] Latest backup restore has been tested in staging or a disposable VPS.
- [ ] `https://api.example.com/health` returns success.
- [ ] Browser preflight cannot send `x-user-id`, `x-user-role`, `x-totp-verified`, or `x-internal-auth`.
- [ ] Direct public access to internal service ports is blocked.
- [ ] CI staging is green after the deployed commit.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| SSH login denied after hardening | Bad public key, wrong user, or `sshd_config` syntax issue | Use provider console, run `sshd -t`, fix `/home/deploy/.ssh/authorized_keys` |
| `docker compose config` shows placeholders | `.env.production` copied but not filled | Replace placeholder values and rerun verification |
| Service starts then exits | Runtime secret validation failed | Inspect `docker compose logs --tail 200 SERVICE_NAME` and fill required env |
| Gateway healthy but app domain fails | Reverse proxy/DNS/TLS issue | Check proxy config, DNS A record, and local `curl http://127.0.0.1:PORT` |
| DB backup file is empty | `pg_dump` failed or env not loaded | Run backup script manually and inspect systemd service logs |
| Restore fails on ownership | Dump owner does not match current DB user | Restore with the configured `POSTGRES_USER`, or use `--no-owner` for compatible dumps |
| CI can build but cannot deploy | Missing SSH deploy secrets | Recreate `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, and authorized key |

## Rollback

Rollback order:

1. Revert only image tags in `/opt/tembus/secrets/.env.production` to previous known-good tags.
2. Run `docker compose pull` and `docker compose up -d`.
3. If schema migration caused the outage, restore database only after confirming the migration cannot be fixed forward.
4. If secret rotation caused the outage, restore the previous env file copy and immediately schedule a safer rotation window.

Never roll back by copying a `.env.production` file into the Git repo.

## Escalation

| Situation | Contact | Method |
|---|---|---|
| Secret exposure or VPS compromise | Engineering lead + founder | Incident channel and phone |
| Failed production database restore | Backend lead | Incident channel |
| Payment webhook or Midtrans outage | Backend lead + finance ops | Incident channel |
| TLS certificate failure | DevOps/on-call | Incident channel |
| Suspected data loss | Engineering lead + operations lead | Incident channel, freeze deploys |

## History

| Date | Run By | Notes |
|---|---|---|
| 2026-05-26 | Codex | Initial production VPS security runbook and verification script. |
