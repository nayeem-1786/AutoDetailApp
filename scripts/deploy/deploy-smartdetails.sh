#!/bin/bash
#
# Smart Details VPS deploy script
# Repository: /home/media/repositories/smart-details
# Branch: main
# PM2 process: smart-details
# Port: 5003 (persisted via .env.local PORT=5003)
#
# Per memory rule #28: uses pm2 restart (not delete+start) to preserve env.
# Per session 6a: PORT=5003 must be in .env.local for the listener to bind correctly.
#
# CANONICAL SOURCE: this file is version-controlled at
#   scripts/deploy/deploy-smartdetails.sh
# /usr/local/bin/deploy-smartdetails should be a SYMLINK to it (see
# scripts/deploy/README.md) so `git pull` updates the deploy script.
#
# Exit codes:
#   0 = success
#   1 = pre-flight check failed (missing repo, missing .env.local, missing PORT, NODE_ENV in .env.local)
#   2 = git pull or npm install failed (npm ci is retried once before this is raised — see Step 3)
#   3 = build failed
#   4 = pm2 restart failed
#   5 = post-deploy verification failed (port not bound, HTTP not 200)
#
# Every run writes a timestamped log to /var/log/deploy-smartdetails/ (or
# /tmp/deploy-smartdetails/ if /var/log isn't writable); the path is printed
# at the end. npm ci output is captured to a sibling -npm-ci.log for
# post-incident review instead of re-running commands manually.
#

set -e

# ──────────────────────────────────────────────────────────────────
# GUARD 1: Strip any inherited NODE_ENV from the shell.
# `npm ci` silently omits devDependencies when NODE_ENV=production —
# which breaks `next build` because TypeScript / webpack plugins are
# devDeps. NODE_ENV inheritance from interactive sessions (e.g.
# `set -a; source .env.local; set +a` for credential rotation) was
# the cause of two outages on 2026-05-18. Unset defensively here so
# we run independent of caller-shell state.
# ──────────────────────────────────────────────────────────────────
unset NODE_ENV

# Detect color support BEFORE redirecting stdout through tee. The phase-log
# redirect below makes fd1 a pipe, which would otherwise auto-disable color
# for the operator watching the deploy live.
if [ -t 1 ]; then USE_COLOR=1; else USE_COLOR=0; fi

# ──────────────────────────────────────────────────────────────────
# H5: Timestamped phase logging. Tee everything to a log file so a
# post-incident review reads the file instead of re-running commands
# (last night's failure required manually re-running `npm ci` to see
# the real error). Falls back to /tmp if /var/log isn't writable.
# ──────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="/var/log/deploy-smartdetails"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp/deploy-smartdetails"
mkdir -p "$LOG_DIR"
LOGFILE="${LOG_DIR}/${TIMESTAMP}.log"
NPM_LOG="${LOG_DIR}/${TIMESTAMP}-npm-ci.log"
# Mirror all stdout+stderr to the timestamped log for the rest of the run.
exec > >(tee -a "$LOGFILE") 2>&1
# Best-effort prune of logs older than 30 days (never fatal).
find "$LOG_DIR" -maxdepth 1 -name '*.log' -type f -mtime +30 -delete 2>/dev/null || true

REPO_DIR="/home/media/repositories/smart-details"
APP_NAME="smart-details"
APP_PORT="5003"
HEALTH_URL="http://127.0.0.1:${APP_PORT}/"
EXPECTED_BRANCH="main"

# Color helpers (only if the operator's terminal supports it; see USE_COLOR)
if [ "$USE_COLOR" = "1" ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

step()  { echo -e "${BLUE}==> $1${NC}"; }
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
fail()  { echo -e "${RED}✗ $1${NC}" >&2; exit "${2:-1}"; }

DEPLOY_START=$(date +%s)

# ──────────────────────────────────────────────────────────────────
# Step 1: Pre-flight checks
# ──────────────────────────────────────────────────────────────────
step "Pre-flight checks"

[ -d "$REPO_DIR" ] || fail "Repo directory not found: $REPO_DIR" 1

cd "$REPO_DIR"
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

[ -f ".env.local" ] || fail ".env.local missing in $REPO_DIR — required for PORT and Supabase keys" 1
grep -q "^PORT=${APP_PORT}$" .env.local || fail ".env.local missing PORT=${APP_PORT} — listener will bind wrong port" 1
ok ".env.local has PORT=${APP_PORT}"

# GUARD 2: Reject .env.local with NODE_ENV line. Next.js manages NODE_ENV
# automatically from the command being run (next build / next start);
# manual NODE_ENV in .env.local was the cause of the 2026-05-18 morning
# build failure (NODE_ENV=production stops npm from installing devDeps).
if grep -q "^NODE_ENV=" .env.local; then
  fail ".env.local contains NODE_ENV — Next.js manages this automatically; manual NODE_ENV breaks npm ci devDep install. Remove the line and redeploy." 1
fi
ok ".env.local clean (no NODE_ENV override)"

CURRENT_BRANCH=$(git branch --show-current)
[ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ] || warn "On branch '$CURRENT_BRANCH', expected '$EXPECTED_BRANCH' — proceeding anyway"

PRE_PULL_COMMIT=$(git rev-parse --short HEAD)
ok "Pre-pull commit: $PRE_PULL_COMMIT"

# ──────────────────────────────────────────────────────────────────
# Step 2: Pull latest code
# ──────────────────────────────────────────────────────────────────
step "Pulling latest code"

git pull origin "$EXPECTED_BRANCH" || fail "git pull failed" 2

POST_PULL_COMMIT=$(git rev-parse --short HEAD)
if [ "$PRE_PULL_COMMIT" = "$POST_PULL_COMMIT" ]; then
  ok "Already up to date at $POST_PULL_COMMIT"
else
  ok "Updated $PRE_PULL_COMMIT → $POST_PULL_COMMIT"
fi

# ──────────────────────────────────────────────────────────────────
# Step 3: Install dependencies
# ──────────────────────────────────────────────────────────────────
step "Installing dependencies (npm ci --include=dev)"

# GUARD 3: --include=dev is explicit. npm ci respects NODE_ENV=production
# AND various ambient signals (CI=true, NPM_CONFIG_PRODUCTION, etc.) any
# of which can silently omit devDependencies. --include=dev overrides all
# of these. Combined with the `unset NODE_ENV` at script top, this is
# belt-and-suspenders against the morning-of-2026-05-18 outage.
#
# H1: npm output is tee'd to $NPM_LOG (no more `--silent` masking the real
# error like it did 2026-05-27). ${PIPESTATUS[0]} recovers npm's true exit
# code — `set -e` + pipe-to-tee would otherwise report tee's exit code (0).
# H3: one automatic retry with backoff. Last night's failure was the FIRST
# ever in 100+ runs and an immediate manual re-run succeeded → a transient
# registry/network blip. A genuine lockfile-drift or disk error fails BOTH
# attempts and correctly aborts the deploy; only transient blips are absorbed.
run_install_attempt() {
  local rc
  if [ -f "package-lock.json" ]; then
    npm ci --include=dev 2>&1 | tee "$NPM_LOG"
    rc=${PIPESTATUS[0]}
  else
    warn "package-lock.json missing — falling back to npm install"
    npm install --include=dev 2>&1 | tee "$NPM_LOG"
    rc=${PIPESTATUS[0]}
  fi
  return "$rc"
}

# Calling run_install_attempt as an `if` condition disables `set -e` inside
# it (bash rule for functions in test position), so the first failure does
# NOT abort the script — it falls through to the retry. `set -e` resumes
# normally after this block.
if run_install_attempt; then
  ok "Dependencies installed"
else
  NPM_RC=$?
  warn "npm ci failed (exit $NPM_RC) on attempt 1 — most likely a transient registry/network blip. Retrying once in 5s…"
  sleep 5
  if run_install_attempt; then
    ok "Dependencies installed (succeeded on retry — attempt 1 was transient)"
  else
    NPM_RC=$?
    fail "npm ci failed (exit code $NPM_RC) on both attempts. Full output: $NPM_LOG. Likely causes, in order of probability: (1) transient registry/network — re-run deploy; (2) package-lock.json drift — run 'npm install' locally and commit the updated package-lock.json; (3) disk space — check 'df -h'." 2
  fi
fi

# GUARD 4: Sanity check devDeps actually landed before attempting build.
# `next build` requires TypeScript (devDep). If `typescript` isn't in
# node_modules after install, next build fails with a confusing "Module
# not found" error pointing at an arbitrary import — masking the real
# cause. Fail fast with a clear message here.
if [ ! -d "node_modules/typescript" ]; then
  fail "node_modules missing devDependencies (typescript not found) — npm ci ran in production mode despite --include=dev. Check shell env for NODE_ENV, NPM_CONFIG_PRODUCTION, or CI variables before re-running." 2
fi
ok "devDependencies confirmed (typescript present)"

# ──────────────────────────────────────────────────────────────────
# Step 4: Build
# ──────────────────────────────────────────────────────────────────
# H4: Clear stale build artifacts before building. A leftover .next from a
# previous build can serve stale chunks / cause hard-to-diagnose hydration
# and chunk-load errors. Matches the `rm -rf .next` discipline used in dev
# sessions (memory #4) — deterministic builds start from a clean tree.
step "Clearing previous build artifacts (.next)"
rm -rf .next
ok ".next cleared"

step "Building (next build)"
BUILD_START=$(date +%s)
npm run build || fail "Build failed" 3
BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
ok "Build complete in ${BUILD_DURATION}s"

if [ "$BUILD_DURATION" -gt 600 ]; then
  warn "Build took ${BUILD_DURATION}s (>10 min) — investigate per memory #30"
fi

# ──────────────────────────────────────────────────────────────────
# Step 5: Standalone asset copy (only if standalone output enabled)
# ──────────────────────────────────────────────────────────────────
if [ -d ".next/standalone" ]; then
  step "Standalone mode detected — copying assets"
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
  cp -f .env.local .next/standalone/.env.local
  ok "Standalone assets copied"
else
  echo "  (standalone mode disabled — skipping asset copy)"
fi

# ──────────────────────────────────────────────────────────────────
# Step 6: Restart PM2 process
# ──────────────────────────────────────────────────────────────────
step "Restarting PM2 process: $APP_NAME"

if ! pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  fail "PM2 process '$APP_NAME' not found — register it first with 'pm2 start npm --name $APP_NAME -- start'" 4
fi

pm2 restart "$APP_NAME" --update-env || fail "pm2 restart failed" 4
ok "PM2 restart issued"

# ──────────────────────────────────────────────────────────────────
# Step 7: Wait for boot, then verify
# ──────────────────────────────────────────────────────────────────
step "Waiting 30s for boot"
sleep 30

step "Verifying port $APP_PORT bound"
PORT_LISTEN=$(ss -tlnp 2>/dev/null | grep ":${APP_PORT}\b" || true)
if [ -z "$PORT_LISTEN" ]; then
  fail "Port $APP_PORT is NOT bound. Check PM2 logs: pm2 logs $APP_NAME --lines 50" 5
fi
ok "Port $APP_PORT bound: $(echo "$PORT_LISTEN" | awk '{print $5, $7}')"

step "Verifying HTTP 200 from $HEALTH_URL"
HTTP_STATUS=$(curl -m 10 -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
if [ "$HTTP_STATUS" != "200" ]; then
  fail "HTTP $HTTP_STATUS from $HEALTH_URL (expected 200). Check PM2 logs: pm2 logs $APP_NAME --lines 50" 5
fi
ok "HTTP 200 from $HEALTH_URL"

# ──────────────────────────────────────────────────────────────────
# Step 8: Cron health check
# ──────────────────────────────────────────────────────────────────
step "Cron health (last 30 log lines)"

CRON_LOG=$(pm2 logs "$APP_NAME" --lines 30 --nostream 2>/dev/null | grep -E "Registered|Started|Failed" || true)
if [ -z "$CRON_LOG" ]; then
  warn "No cron log lines found yet — startup may still be in progress"
else
  CRON_FAILED=$(echo "$CRON_LOG" | grep -c "Failed" 2>/dev/null) || CRON_FAILED=0
  CRON_STARTED=$(echo "$CRON_LOG" | grep -c "Started" 2>/dev/null) || CRON_STARTED=0

  echo "$CRON_LOG"
  echo
  if [ "$CRON_FAILED" -gt 0 ]; then
    warn "$CRON_FAILED cron 'Failed' lines in recent logs — investigate"
  else
    ok "$CRON_STARTED cron jobs started, 0 failures"
  fi
fi

# ──────────────────────────────────────────────────────────────────
# Step 9: PM2 status summary
# ──────────────────────────────────────────────────────────────────
step "PM2 status"
pm2 status "$APP_NAME"

# ──────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
TOTAL_DURATION=$((DEPLOY_END - DEPLOY_START))
echo
ok "=== Deploy complete in ${TOTAL_DURATION}s — commit $POST_PULL_COMMIT ==="
echo
echo "Next steps:"
echo "  - Run production UAT against https://smartdetailsautospa.com"
echo "  - Watch logs: pm2 logs $APP_NAME"
echo "  - Tail errors: tail -f /root/.pm2/logs/${APP_NAME}-error.log"
echo "  - Full deploy log: $LOGFILE"
