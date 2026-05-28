# Deploy — `deploy-smartdetails.sh`

Production deploy script for the Smart Details app on the VPS. This is the
**canonical, version-controlled source**. The VPS command
`/usr/local/bin/deploy-smartdetails` should be a **symlink** to this file so a
plain `git pull` ships future hardening — no more hand-editing an unversioned
script on the server.

- **Repo path (VPS):** `/home/media/repositories/smart-details`
- **PM2 process:** `smart-details`
- **Port:** `5003` (must be `PORT=5003` in `.env.local`)
- **Branch deployed:** `main`

## What it does (9 steps)

1. **Pre-flight** — repo dir exists; `.env.local` exists and has `PORT=5003`; `.env.local` has **no** `NODE_ENV` line (GUARD 2); records the pre-pull commit. Warns (does not abort) if the checkout isn't on `main`.
2. **Pull** `origin/main`.
3. **Install** `npm ci --include=dev` (GUARD 3) — output captured to a log, with one automatic retry (see *Hardening*). GUARD 4 then asserts `node_modules/typescript` exists so a missing-devDep install fails fast with a clear message instead of a confusing build error.
4. **Build** — clears `.next` first (deterministic build), then `next build`; warns if the build exceeds 10 min.
5. **Standalone asset copy** — only if `.next/standalone` exists (it doesn't today; `output: 'standalone'` is commented out in `next.config.ts`).
6. **PM2 restart** — `pm2 restart smart-details --update-env` (GUARD/rule #28: restart, **not** delete+start, to preserve env).
7. **Verify** — waits 30 s, confirms port 5003 is bound and `http://127.0.0.1:5003/` returns HTTP 200.
8. **Cron health** — scans recent PM2 logs for `Registered/Started/Failed`.
9. **PM2 status** summary.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | success |
| 1 | pre-flight failed (missing repo / `.env.local` / `PORT`, or `NODE_ENV` present in `.env.local`) |
| 2 | git pull or npm install failed (**npm ci is retried once** before this is raised) |
| 3 | build failed |
| 4 | pm2 restart failed |
| 5 | post-deploy verification failed (port not bound, or HTTP ≠ 200) |

### Guards (do not remove)

- **GUARD 1** — `unset NODE_ENV` at the top. `npm ci` silently drops devDependencies when `NODE_ENV=production`, breaking `next build` (TypeScript/webpack plugins are devDeps). Caused two outages on 2026-05-18.
- **GUARD 2** — reject `.env.local` containing a `NODE_ENV` line (same failure mode, persisted).
- **GUARD 3** — `--include=dev` is explicit, overriding `NODE_ENV` / `CI` / `NPM_CONFIG_PRODUCTION` ambient signals.
- **GUARD 4** — assert `node_modules/typescript` after install; fail fast if devDeps didn't land.

## Hardening (2026-05-28)

Added after a 2026-05-27 incident where `npm ci --include=dev --silent` failed for the first time in 100+ runs — a transient registry blip — but `--silent` hid the real error and the old failure message wrongly blamed `package-lock.json` drift, sending the operator on a ~10-minute phantom chase.

- **H1 — diagnosable `npm ci`.** Removed `--silent`; npm output is tee'd to a timestamped `…-npm-ci.log`. `${PIPESTATUS[0]}` recovers npm's true exit code (piping to `tee` would otherwise report tee's `0`).
- **H2 — honest failure message.** Replaced the hardcoded "check package-lock.json drift" with the captured log path + likely causes **in probability order**: (1) transient network → re-run; (2) lockfile drift → `npm install` locally + commit; (3) disk space → `df -h`.
- **H3 — retry once.** A failed `npm ci` waits 5 s and retries a single time. A transient blip is absorbed; a genuine drift/disk error fails **both** attempts and correctly aborts (exit 2).
- **H4 — clean build.** `rm -rf .next` before `next build` to avoid stale-chunk hazards.
- **H5 — phase logging.** All output is tee'd to `/var/log/deploy-smartdetails/<timestamp>.log` (falls back to `/tmp/deploy-smartdetails/` if `/var/log` isn't writable). The path is printed at the end; logs older than 30 days are pruned. Post-incident review reads the file instead of re-running commands.

## Install on the VPS (one-time migration)

The script currently lives only at `/usr/local/bin/deploy-smartdetails` (unversioned). Replace it with a symlink to this repo copy:

```bash
# 1. Get the repo copy onto the VPS
cd /home/media/repositories/smart-details
git pull origin main

# 2. Back up the existing unversioned script
cp /usr/local/bin/deploy-smartdetails /usr/local/bin/deploy-smartdetails.bak-20260528

# 3. Point the command at the version-controlled copy (idempotent — safe to re-run)
ln -sf /home/media/repositories/smart-details/scripts/deploy/deploy-smartdetails.sh /usr/local/bin/deploy-smartdetails

# 4. Verify it resolves to the repo copy and is executable
ls -l /usr/local/bin/deploy-smartdetails
deploy-smartdetails   # next real deploy should behave identically
```

The script's executable bit (`100755`) is tracked in git, so the symlink target is already runnable after `git pull`.

## Updating the script later

Edit `scripts/deploy/deploy-smartdetails.sh` in the repo, commit, push, then on the VPS:

```bash
cd /home/media/repositories/smart-details && git pull origin main
```

The symlink picks up the new version automatically — no server-side edits.

## Local validation (no VPS needed)

```bash
bash -n scripts/deploy/deploy-smartdetails.sh    # syntax check
shellcheck scripts/deploy/deploy-smartdetails.sh # if installed
```

The retry / `${PIPESTATUS[0]}` logic was validated against an isolated stub
harness covering clean-success, one-transient-failure (absorbed on retry), and
double-failure (aborts exit 2) before this script shipped.
