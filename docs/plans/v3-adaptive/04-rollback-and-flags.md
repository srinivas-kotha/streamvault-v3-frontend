# StreamVault — Rollback, Snapshot, Preview & Feature Flags
_Design date: 2026-04-29 | Author: DevOps/SRE lead_

---

## 1. Current Deploy Topology

```
Browser / Fire TV
       │ HTTPS 443
       ▼
┌──────────────────────────────────┐
│  nginx-proxy-manager (host :443) │  container: nginx_proxy
│  server_name streamvault.srini…  │  Let's Encrypt TLS, HSTS
└───────────────┬──────────────────┘
                │ proxy_pass http://streamvault-v3-frontend:80
                │ (Docker network ai_network)
                ▼
┌─────────────────────────────────┐
│  streamvault-v3-frontend  :3006  │  image: ai-orchestration-streamvault-v3-frontend
│  nginx:alpine, serves /dist      │  built from ~/streamvault-v3-frontend
└───────────────┬─────────────────┘
                │ XHR /api/*  → host:3001 (set at build time via VITE env)
                ▼
┌─────────────────────────────────┐
│  streamvault-api          :3001  │  image: ai-orchestration-streamvault-api
│  Node 20, Express                │  built from ~/streamvault-backend
└───────────────┬─────────────────┘
                │ pg (port 5432, Docker network)
                ▼
┌─────────────────────────────────┐
│  postgres  (ankane/pgvector)     │  data: ~/ai-orchestration/data/postgres/
│  DB: n8n   (shared)              │  sv_* tables = 13 tables, ~75 MB on-disk
│  User: crawler_admin             │  n8n DB total: 820 MB
└─────────────────────────────────┘

Deploy path (CI → VPS):
  GitHub Actions (ubuntu-latest)
    └─ SSH appleboy → VPS ~/streamvault-backend   git pull → docker compose up -d --build
    └─ SSH appleboy → VPS ~/streamvault-v3-frontend git reset --hard → docker compose up -d --build
```

Key facts:
- Both repos deploy independently via separate `deploy.yml` workflows.
- Postgres is **shared** — sv_* tables live inside the `n8n` database.
- nginx-proxy-manager manages TLS; config is in `/data/nginx/proxy_host/5.conf`.
- No preview URL exists today. No rollback mechanism exists today.

---

## 2. Snapshot Scheme

### 2a. Deploy ID

```
DEPLOY_ID = YYYYMMDD-HHmm-{7-char SHA}
Example:   20260429-1423-20b177e
```

Generated at deploy start: `date -u +%Y%m%d-%H%M`; SHA from `git rev-parse --short=7 HEAD`.

### 2b. Snapshot Contents

```
/home/crawler/snapshots/
  {deploy-id}.manifest.json       # authoritative index
  {deploy-id}.dump                # pg_dump custom-format, zlib-9
  {deploy-id}-fe/                 # FE built static dir (dist/)
  {deploy-id}-be-src.tar.gz       # BE git archive (source, not binary)
  rollback-{timestamp}.log        # written during rollback
```

**manifest.json schema:**
```json
{
  "deploy_id":   "20260429-1423-20b177e",
  "timestamp":   "2026-04-29T14:23:00Z",
  "fe_sha":      "20b177e...",
  "be_sha":      "d98193c...",
  "fe_image":    "ai-orchestration-streamvault-v3-frontend:20260429-1423-20b177e",
  "be_image":    "ai-orchestration-streamvault-api:20260429-1423-20b177e",
  "db_dump":     "20260429-1423-20b177e.dump",
  "db_dump_sha256": "<sha256>",
  "fe_dir":      "20260429-1423-20b177e-fe/",
  "feature_flags": {
    "sv_flags": [...]
  },
  "smoke_passed": true,
  "created_at":  "2026-04-29T14:26:00Z"
}
```

### 2c. Capture procedure (runs BEFORE deploying candidate)

```bash
DEPLOY_ID="$(date -u +%Y%m%d-%H%M)-$(cd ~/streamvault-v3-frontend && git rev-parse --short=7 HEAD)"
SNAP_DIR="/home/crawler/snapshots"
mkdir -p "$SNAP_DIR"

# 1. DB dump (sv_* tables only) — measured: 3s, 8.8 MB compressed
docker exec postgres pg_dump \
  -U crawler_admin -d n8n \
  --table='sv_*' \
  --format=custom -Z 9 \
  --file="/tmp/${DEPLOY_ID}.dump"
docker cp "postgres:/tmp/${DEPLOY_ID}.dump" "${SNAP_DIR}/${DEPLOY_ID}.dump"
docker exec postgres rm "/tmp/${DEPLOY_ID}.dump"

# 2. FE static snapshot (copy current running dist)
docker cp "streamvault_v3_frontend:/usr/share/nginx/html/." \
  "${SNAP_DIR}/${DEPLOY_ID}-fe/"

# 3. BE source archive
git -C ~/streamvault-backend archive --format=tar.gz \
  HEAD -o "${SNAP_DIR}/${DEPLOY_ID}-be-src.tar.gz"

# 4. Tag Docker images with deploy-id
docker tag ai-orchestration-streamvault-v3-frontend \
  "ai-orchestration-streamvault-v3-frontend:${DEPLOY_ID}"
docker tag ai-orchestration-streamvault-api \
  "ai-orchestration-streamvault-api:${DEPLOY_ID}"

# 5. Capture feature flags
FF_JSON=$(docker exec postgres psql -U crawler_admin -d n8n -Atc \
  "SELECT json_agg(row_to_json(t)) FROM sv_settings t;" 2>/dev/null || echo "null")

# 6. Write manifest
SHA=$(sha256sum "${SNAP_DIR}/${DEPLOY_ID}.dump" | awk '{print $1}')
cat > "${SNAP_DIR}/${DEPLOY_ID}.manifest.json" <<MANIFEST
{
  "deploy_id":     "${DEPLOY_ID}",
  "timestamp":     "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "fe_sha":        "$(cd ~/streamvault-v3-frontend && git rev-parse HEAD)",
  "be_sha":        "$(cd ~/streamvault-backend && git rev-parse HEAD)",
  "fe_image":      "ai-orchestration-streamvault-v3-frontend:${DEPLOY_ID}",
  "be_image":      "ai-orchestration-streamvault-api:${DEPLOY_ID}",
  "db_dump":       "${DEPLOY_ID}.dump",
  "db_dump_sha256":"${SHA}",
  "fe_dir":        "${DEPLOY_ID}-fe/",
  "feature_flags": ${FF_JSON},
  "smoke_passed":  false,
  "created_at":    "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST
```

### 2d. Retention policy

Implemented by `bin/streamvault-prune-snapshots.sh`:
- Keep all snapshots ≤ 14 days old.
- Additionally keep the 5 most recent `smoke_passed: true` manifests regardless of age.
- Delete dump + fe-dir + be-src.tar.gz for expired entries; keep manifest JSON for audit trail.

```bash
#!/usr/bin/env bash
# bin/streamvault-prune-snapshots.sh
set -euo pipefail
SNAP_DIR="/home/crawler/snapshots"
NOW=$(date +%s)
CUTOFF=$((NOW - 14*86400))

# Collect last-5 successful deploy IDs
KEEPERS=$(grep -l '"smoke_passed": true' "$SNAP_DIR"/*.manifest.json 2>/dev/null \
  | sort -t- -k1,2 | tail -5 \
  | xargs -I{} basename {} .manifest.json)

for manifest in "$SNAP_DIR"/*.manifest.json; do
  id=$(basename "$manifest" .manifest.json)
  mtime=$(stat -c %Y "$manifest")
  if [[ $mtime -lt $CUTOFF ]] && ! echo "$KEEPERS" | grep -q "$id"; then
    echo "Pruning $id"
    rm -rf "${SNAP_DIR:?}/${id}.dump" \
           "${SNAP_DIR:?}/${id}-fe" \
           "${SNAP_DIR:?}/${id}-be-src.tar.gz"
    # Keep manifest for audit
  fi
done
```

### 2e. Disk estimate

| Artifact | Typical size |
|---|---|
| DB dump (sv_* only, zlib-9) | ~8.8 MB (measured) |
| FE dist/ (gzipped assets) | ~3–5 MB |
| BE source archive | ~1–2 MB |
| **Total per snapshot** | **~13–16 MB** |
| 5 snapshots | ~75–80 MB |
| 14 days (if 1 deploy/day) | ~200 MB |

Available disk: 33 GB free. Snapshots are negligible. Prune script is a safety measure, not an emergency.

---

## 3. Atomic Rollback Script

```bash
#!/usr/bin/env bash
# bin/streamvault-rollback.sh <deploy-id>
# Usage: /home/crawler/bin/streamvault-rollback.sh 20260429-1423-20b177e
set -euo pipefail

DEPLOY_ID="${1:?Usage: $0 <deploy-id>}"
SNAP_DIR="/home/crawler/snapshots"
COMPOSE_DIR="/home/crawler/ai-orchestration"
LOGFILE="${SNAP_DIR}/rollback-$(date -u +%Y%m%dT%H%M%SZ).log"

log()  { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOGFILE"; }
fail() { log "FATAL: $*"; log ""; log "Recovery: services may be stopped. Run:"; \
         log "  cd $COMPOSE_DIR && docker compose up -d streamvault-api streamvault-v3-frontend"; \
         log "  Then investigate $LOGFILE"; exit 1; }

exec > >(tee -a "$LOGFILE") 2>&1
log "=== Rollback started — target: $DEPLOY_ID ==="

MANIFEST="${SNAP_DIR}/${DEPLOY_ID}.manifest.json"
DUMP="${SNAP_DIR}/${DEPLOY_ID}.dump"

# ── Step 1: Verify manifest exists ──────────────────────────────────────────
[[ -f "$MANIFEST" ]] || fail "Manifest not found: $MANIFEST"
[[ -f "$DUMP"     ]] || fail "Dump not found: $DUMP"
log "Manifest found: $MANIFEST"

# ── Step 2: Verify dump integrity ───────────────────────────────────────────
EXPECTED_SHA=$(python3 -c "import json,sys; d=json.load(open('$MANIFEST')); print(d['db_dump_sha256'])")
ACTUAL_SHA=$(sha256sum "$DUMP" | awk '{print $1}')
[[ "$EXPECTED_SHA" == "$ACTUAL_SHA" ]] || \
  fail "sha256 mismatch! Expected=$EXPECTED_SHA Got=$ACTUAL_SHA"
log "sha256 verified: $ACTUAL_SHA"

# ── Step 3: Stop both services (ordered — FE first, then API) ───────────────
log "Stopping streamvault_v3_frontend..."
cd "$COMPOSE_DIR"
docker compose stop streamvault-v3-frontend || fail "Could not stop frontend"
log "Stopping streamvault_api..."
docker compose stop streamvault-api         || fail "Could not stop API"
log "Both services stopped."

# ── Step 4: pg_restore sv_* tables (clean + if-exists = safe with shared DB) ─
log "Restoring database snapshot..."
docker cp "$DUMP" "postgres:/tmp/${DEPLOY_ID}.dump" \
  || fail "docker cp of dump into postgres container failed"

# Drop sv_* tables explicitly first to avoid FK constraint collisions
docker exec postgres psql -U crawler_admin -d n8n -c "
  DO \$\$
  DECLARE r RECORD;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables
              WHERE schemaname='public' AND tablename LIKE 'sv_%')
    LOOP
      EXECUTE 'DROP TABLE IF EXISTS public.' || r.tablename || ' CASCADE';
    END LOOP;
  END\$\$;
" || fail "Could not drop existing sv_* tables"

docker exec postgres pg_restore \
  -U crawler_admin -d n8n \
  --no-owner --role=crawler_admin \
  --if-exists \
  "/tmp/${DEPLOY_ID}.dump" \
  || fail "pg_restore failed — DB may be partially restored; dump is intact at $DUMP"

docker exec postgres rm "/tmp/${DEPLOY_ID}.dump"
log "Database restored."

# ── Step 5: Re-tag Docker images ─────────────────────────────────────────────
FE_IMAGE=$(python3 -c "import json,sys; d=json.load(open('$MANIFEST')); print(d['fe_image'])")
BE_IMAGE=$(python3 -c "import json,sys; d=json.load(open('$MANIFEST')); print(d['be_image'])")

log "Re-tagging FE image: $FE_IMAGE → latest"
docker tag "$FE_IMAGE" ai-orchestration-streamvault-v3-frontend:latest \
  || fail "FE image tag not found: $FE_IMAGE. Images may have been pruned. Rebuild required."

log "Re-tagging BE image: $BE_IMAGE → latest"
docker tag "$BE_IMAGE" ai-orchestration-streamvault-api:latest \
  || fail "BE image tag not found: $BE_IMAGE. Images may have been pruned. Rebuild required."

# ── Step 6: Restart services ─────────────────────────────────────────────────
log "Starting streamvault-api..."
docker compose up -d --no-build streamvault-api \
  || fail "docker compose up failed for streamvault-api"

log "Waiting for API health (30s max)..."
for i in $(seq 1 6); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    log "API healthy after $((i*5))s"; break
  fi
  [[ $i -eq 6 ]] && fail "API health check failed after 30s"
  sleep 5
done

log "Starting streamvault-v3-frontend..."
docker compose up -d --no-build streamvault-v3-frontend \
  || fail "docker compose up failed for streamvault-v3-frontend"

log "Waiting for frontend health (30s max)..."
for i in $(seq 1 6); do
  if curl -sf http://localhost:3006/ > /dev/null 2>&1; then
    log "Frontend healthy after $((i*5))s"; break
  fi
  [[ $i -eq 6 ]] && fail "Frontend health check failed after 30s"
  sleep 5
done

# ── Step 7: Smoke health endpoints ───────────────────────────────────────────
log "Running smoke checks..."
curl -sf http://localhost:3001/health  || fail "BE /health smoke failed"
curl -sf http://localhost:3006/        || fail "FE / smoke failed"
HTTP_CODE=$(curl -o /dev/null -sw '%{http_code}' https://streamvault.srinivaskotha.uk/ || true)
[[ "$HTTP_CODE" == "200" ]] || log "WARNING: prod HTTPS returned $HTTP_CODE (may be DNS/cache lag)"

log "=== Rollback complete. Deploy ID: $DEPLOY_ID ==="
log "Log: $LOGFILE"
```

**Failure guarantee:** every `|| fail "..."` call prints recovery instructions and exits before the next destructive step. The only window where state is ambiguous is between pg_restore start and pg_restore success — but the dump file is never deleted, so re-running `pg_restore` is always safe.

---

## 4. Deploy Hook

**Decision: use a VPS-side `bin/streamvault-deploy.sh` invoked from GitHub Actions.**

Rationale: The current Actions workflow SSHes into the VPS and runs inline bash. Moving logic to a versioned script on the VPS means:
- Rollback script and deploy script share helper functions (single source of truth).
- The Actions step stays minimal (one SSH call), reducing YAML sprawl.
- Rollback can be triggered manually from the VPS without re-running Actions.

### 4a. Updated GitHub Actions deploy step (BE example; FE is identical)

```yaml
# .github/workflows/deploy.yml — BE only relevant section
- name: Deploy to VPS
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.SSH_HOST }}
    username: ${{ secrets.SSH_USER }}
    key: ${{ secrets.SSH_KEY }}
    timeout: 60s
    command_timeout: 10m
    script: |
      bash /home/crawler/bin/streamvault-deploy.sh be
```

### 4b. `bin/streamvault-deploy.sh`

```bash
#!/usr/bin/env bash
# bin/streamvault-deploy.sh <fe|be|both>
# Orchestrates: snapshot current → deploy candidate → smoke → auto-rollback on fail
set -euo pipefail

COMPONENT="${1:?Usage: $0 <fe|be|both>}"
SNAP_DIR="/home/crawler/snapshots"
COMPOSE_DIR="/home/crawler/ai-orchestration"
BIN_DIR="/home/crawler/bin"

DEPLOY_ID="$(date -u +%Y%m%d-%H%M)-$(cd ~/streamvault-v3-frontend && git rev-parse --short=7 HEAD)"
LOGFILE="${SNAP_DIR}/deploy-${DEPLOY_ID}.log"
exec > >(tee -a "$LOGFILE") 2>&1

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

log "=== Deploy started: $DEPLOY_ID ($COMPONENT) ==="

# Step 1: Snapshot CURRENT state (pre-deploy)
log "Capturing snapshot of current live state..."
bash "$BIN_DIR/streamvault-snapshot.sh" "$DEPLOY_ID" \
  || { log "Snapshot failed — aborting deploy, no change made"; exit 1; }
log "Snapshot complete."

# Step 2: Pull + build candidate
if [[ "$COMPONENT" == "be" || "$COMPONENT" == "both" ]]; then
  log "Pulling BE..."
  cd ~/streamvault-backend && git pull origin main
  cd "$COMPOSE_DIR" && docker compose up -d --build streamvault-api
fi
if [[ "$COMPONENT" == "fe" || "$COMPONENT" == "both" ]]; then
  log "Pulling FE..."
  cd ~/streamvault-v3-frontend && git fetch origin main && git reset --hard origin/main
  cd "$COMPOSE_DIR" && docker compose up -d --build streamvault-v3-frontend
fi

# Step 3: Smoke health checks
log "Waiting for health..."
sleep 10
API_OK=false; FE_OK=false
for i in $(seq 1 18); do
  curl -sf http://localhost:3001/health > /dev/null 2>&1 && API_OK=true
  curl -sf http://localhost:3006/       > /dev/null 2>&1 && FE_OK=true
  ($API_OK && $FE_OK) && break
  sleep 5
done

if ! $API_OK || ! $FE_OK; then
  log "SMOKE FAILED (api=$API_OK fe=$FE_OK) — triggering auto-rollback to $DEPLOY_ID"
  bash "$BIN_DIR/streamvault-rollback.sh" "$DEPLOY_ID"
  exit 1
fi

# Step 4: Mark snapshot as successful
python3 -c "
import json, sys
p = '${SNAP_DIR}/${DEPLOY_ID}.manifest.json'
d = json.load(open(p))
d['smoke_passed'] = True
json.dump(d, open(p,'w'), indent=2)
"

log "=== Deploy succeeded: $DEPLOY_ID ==="

# Step 5: Prune old snapshots
bash "$BIN_DIR/streamvault-prune-snapshots.sh"
```

`bin/streamvault-snapshot.sh` is the capture block from §2c extracted into a standalone script, called with `$DEPLOY_ID` as argument.

---

## 5. Preview-URL Flow

**Choice: (b) Docker Compose alt port + nginx-proxy-manager subdomain `preview.streamvault.srinivaskotha.uk`**

### Why not (a) Cloudflare Pages or (c) Vercel

- The FE connects to the **live backend API** at build-time via `VITE_API_URL`. A static Pages deploy would still point at prod backend unless a separate preview backend is deployed too.
- Vercel free tier has function limits and doesn't solve the BE problem.
- Option (b) keeps preview FE + preview BE both running on the VPS, fully isolated, pointing at a **preview DB schema** (separate `sv_preview_*` tables or a separate `streamvault_preview` DB), zero cost, real TLS via Let's Encrypt through nginx-proxy-manager.

### Implementation

**docker-compose addition** (append to `~/ai-orchestration/docker-compose.yml`):

```yaml
  streamvault-preview-frontend:
    build:
      context: ../streamvault-v3-frontend
      args:
        - VITE_API_URL=http://streamvault-preview-api:3001
    container_name: streamvault_preview_frontend
    restart: "no"          # preview is ephemeral — must be started manually
    ports:
      - "127.0.0.1:3016:80"
    depends_on:
      streamvault-preview-api:
        condition: service_healthy
    networks:
      - ai_network

  streamvault-preview-api:
    build: ../streamvault-backend
    container_name: streamvault_preview_api
    restart: "no"
    ports:
      - "127.0.0.1:3011:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - SV_SCHEMA_PREFIX=sv_preview_   # custom prefix for preview tables
      - JWT_SECRET=${SV_JWT_SECRET}
      - JWT_REFRESH_SECRET=${SV_JWT_REFRESH_SECRET}
      - XTREAM_HOST=${SV_XTREAM_HOST}
      - XTREAM_PORT=${SV_XTREAM_PORT}
      - XTREAM_USERNAME=${SV_XTREAM_USERNAME}
      - XTREAM_PASSWORD=${SV_XTREAM_PASSWORD}
      - CORS_ORIGIN=https://preview.streamvault.srinivaskotha.uk
    networks:
      - ai_network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**nginx-proxy-manager**: Add proxy host `preview.streamvault.srinivaskotha.uk → 127.0.0.1:3016` with Let's Encrypt cert (same process as host 5.conf). Access control: add HTTP Basic Auth in npm UI to prevent public access.

**Preview smoke script** (`bin/streamvault-preview-smoke.sh`):

```bash
#!/usr/bin/env bash
# Start preview stack, run smoke, return pass/fail, tear down
set -euo pipefail
cd /home/crawler/ai-orchestration
docker compose up -d --build streamvault-preview-api streamvault-preview-frontend

PASS=false
for i in $(seq 1 18); do
  if curl -sf http://localhost:3011/health > /dev/null 2>&1 && \
     curl -sf http://localhost:3016/       > /dev/null 2>&1; then
    PASS=true; break
  fi
  sleep 5
done

# Basic API smokes
if $PASS; then
  curl -sf http://localhost:3011/health || PASS=false
  # Add endpoint smokes here as needed
fi

docker compose stop streamvault-preview-api streamvault-preview-frontend

$PASS && echo "Preview smoke PASSED" || { echo "Preview smoke FAILED"; exit 1; }
```

**Shadow validation in deploy flow**: GitHub Actions adds a step before the live deploy:

```yaml
- name: Shadow validate on preview stack
  uses: appleboy/ssh-action@v1
  with:
    script: bash /home/crawler/bin/streamvault-preview-smoke.sh
```

If preview smoke fails, Actions exits and the live deploy step never runs.

---

## 6. Feature Flag Kill-Switch

### Flag storage

Flags live in `sv_settings` table (already present). Schema:

```sql
-- Already exists; used for app settings.
-- Add a dedicated flags column or use existing key/value rows:
INSERT INTO sv_settings (key, value, updated_at)
VALUES ('feature_flags', '{"new_player":true,"hdr_mode":false}', NOW())
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
```

Because `sv_settings` is part of the `sv_*` snapshot, flags are **always in sync with the DB snapshot** — restoring a snapshot restores the flag state that was live at that deploy.

### Decision tree

```
Incident detected
│
├─ Is this a UI/UX regression in a single feature?
│   └─ YES → Kill-switch: flip flag to false via API or psql
│               curl -X POST /api/admin/flags -d '{"new_player":false}'
│               (instant, no code deploy, no downtime)
│
├─ Is this a BE bug affecting all users?
│   └─ YES → Flag won't help. Go to rollback.
│
├─ Is this a data corruption / security issue?
│   └─ YES → Nuclear rollback: bin/streamvault-rollback.sh <last-good-deploy-id>
│               (reverts code + DB to snapshot state)
│
└─ Gradual rollout scenario (not current need, future):
    → Add user-percent field to sv_settings flag JSON
      {"new_player": {"enabled":true,"rollout_pct":10}}
    → BE reads rollout_pct; skip if user_id % 100 >= rollout_pct
```

### Kill-switch API endpoint (add to BE)

```typescript
// src/routers/admin.router.ts  (new, protected by admin middleware)
router.post('/flags', requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  await db.query(
    `UPDATE sv_settings SET value = value::jsonb || $1::jsonb, updated_at = NOW()
     WHERE key = 'feature_flags'`,
    [JSON.stringify({ [key]: value })]
  );
  res.json({ ok: true, key, value });
});
```

---

## 7. Drill Protocol

**Drill goal**: prove rollback works end-to-end without user impact.

### Safe production drill (monthly recommended)

```
1. PREP (5 min)
   a. Note current deploy ID: ls -lt /home/crawler/snapshots/*.manifest.json | head -1
   b. Confirm smoke_passed: true in the latest manifest.
   c. Schedule during low-traffic window (weekday 03:00–04:00 UTC).

2. DEPLOY NO-OP CHANGE (10 min)
   a. Add a comment to streamvault-backend/src/index.ts:
      // drill: $(date -u)
   b. git commit -m "chore: drill no-op for rollback test"
   c. git push origin main → wait for Actions deploy to complete.
   d. Note new deploy ID (D+1).

3. VERIFY NEW STATE LIVE (2 min)
   a. curl -sf https://streamvault.srinivaskotha.uk/ | head -1
   b. Confirm D+1 manifest exists with smoke_passed: true.

4. ROLLBACK TO PRIOR DEPLOY (5 min)
   a. bash /home/crawler/bin/streamvault-rollback.sh <D-0-deploy-id>
   b. Watch log output for all 7 steps completing.
   c. Confirm services restart: docker ps | grep stream

5. SMOKE PROD AFTER ROLLBACK (3 min)
   a. curl -sf http://localhost:3001/health
   b. curl -sf http://localhost:3006/
   c. Open https://streamvault.srinivaskotha.uk in browser; confirm UI loads.
   d. Confirm DB state: docker exec postgres psql -U crawler_admin -d n8n
      -c "SELECT count(*) FROM sv_users;"
      → should match pre-drill count.

6. RE-DEPLOY HEAD (so prod is back on latest)
   a. bash /home/crawler/bin/streamvault-deploy.sh both

7. LOG RESULTS
   a. Copy rollback log to /home/crawler/snapshots/drill-YYYYMMDD.log
   b. Record: steps that failed, time to complete each step, any surprises.
```

Drill is safe because:
- The no-op commit changes no runtime behaviour.
- pg_restore only touches `sv_*` tables — n8n and other shared tables are untouched.
- Rollback log captures every step; fail-fast guarantee means no partial state.

---

## 8. Risks & Mitigations

### R1 — pg_restore mid-failure leaves sv_* tables in partial state

**Risk**: network blip or OOM kills pg_restore after some tables are dropped but before all are restored.

**Mitigation**:
- The rollback script drops all `sv_*` tables in a single transaction (`DO $$ ... CASCADE`) _before_ calling `pg_restore`. If pg_restore fails, tables are gone but the dump file is intact.
- Recovery path: operator re-runs `bin/streamvault-rollback.sh <deploy-id>` — pg_restore is idempotent since tables were already dropped.
- The API's connection pool will refuse requests while tables are missing (FK errors surface as 500s), which is visible and loud — not silent corruption.
- Future hardening: wrap the drop+restore in a Postgres function inside a transaction (requires `pg_restore --single-transaction` and a transactional dump — possible with custom format if `--single-transaction` is added).

### R2 — Snapshot disk fills (820 MB n8n DB, shared disk)

**Risk**: the full n8n DB is 820 MB; if someone accidentally dumps the whole DB instead of sv_* tables, 14 snapshots = 11 GB compressed.

**Mitigation**:
- Dump command explicitly scopes to `--table='sv_*'`; measured output is 8.8 MB.
- Prune script enforces 14-day + last-5 retention; runs after every deploy.
- Add disk guard to deploy script:
  ```bash
  FREE_GB=$(df -BG /home/crawler | awk 'NR==2{print $4}' | tr -d G)
  [[ $FREE_GB -lt 5 ]] && { log "ABORT: <5 GB free"; exit 1; }
  ```
- Current: 33 GB free. Even 100 snapshots at 16 MB each = 1.6 GB — no near-term risk.

### R3 — Preview URL leaks staging/prod data

**Risk**: `preview.streamvault.srinivaskotha.uk` is publicly reachable and exposes real user data (sv_users, sv_watch_history) via the preview API.

**Mitigations**:
- nginx-proxy-manager HTTP Basic Auth on the preview host — one layer of access control.
- Preview API uses separate env `SV_SCHEMA_PREFIX=sv_preview_` so it reads/writes different tables (requires small BE change to respect the prefix; fallback: use a separate `streamvault_preview` DB created for preview only).
- Preview containers use `restart: "no"` — they are only up while a smoke is running; torn down immediately after.
- Preview smoke is CI-only (no long-lived preview stack).

### R4 — Feature flags table inconsistent during rollback (flags must be IN snapshot)

**Risk**: pg_restore restores `sv_settings` (including flags) to the snapshot state, which may re-enable a flag that was just disabled to stop an incident.

**Mitigation**:
- Operator must: (1) note current flag state before rollback, (2) after rollback verify flags, (3) manually re-disable any flags that need to stay off.
- Add to rollback script: print current `sv_settings.feature_flags` before restore and after restore, so the operator sees the delta.
- Long-term: extract flags to a separate non-snapshot table (`sv_feature_flags`) that is NOT included in `pg_dump --table='sv_*'` (exclude it explicitly). Flags survive rollback; they are a separate control plane. This is the correct architecture once kill-switch API is implemented.

### R5 — DNS/CDN cache lag after rollback makes smoke report false positive

**Risk**: The rollback script checks `https://streamvault.srinivaskotha.uk/` and gets 200 from a cached response even though the live container is unhealthy.

**Mitigations**:
- Primary smoke always checks `http://localhost:3001/health` and `http://localhost:3006/` (direct container ports, no cache) — these are the canonical pass/fail signals.
- The HTTPS check is logged as WARNING only, not a blocking gate.
- Cloudflare free tier: if Cloudflare proxying is enabled (orange-cloud), purge cache after rollback:
  ```bash
  # If CF_ZONE_ID and CF_API_TOKEN are set:
  curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -d '{"purge_everything":true}'
  ```
  Add to rollback script as optional step (no-op if vars not set).

---

## Implementation Checklist

```
[ ] mkdir -p /home/crawler/bin /home/crawler/snapshots
[ ] Write bin/streamvault-snapshot.sh   (§2c extracted)
[ ] Write bin/streamvault-rollback.sh   (§3)
[ ] Write bin/streamvault-deploy.sh     (§4b)
[ ] Write bin/streamvault-prune-snapshots.sh  (§2d)
[ ] Write bin/streamvault-preview-smoke.sh    (§5)
[ ] Add preview services to docker-compose.yml (§5)
[ ] Add preview proxy host in npm UI
[ ] Update FE + BE deploy.yml to call bin/streamvault-deploy.sh (§4a)
[ ] Add /api/admin/flags endpoint to BE (§6)
[ ] Add disk-guard to deploy script
[ ] Run first drill (§7)
[ ] Schedule monthly drill via cron
```
