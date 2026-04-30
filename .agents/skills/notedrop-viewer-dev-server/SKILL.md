---
name: notedrop-viewer-dev-server
description: Use when notedrop viewer source must be served locally for browser inspection without Obsidian, publish, release, version bump, BRAT, or GitHub Pages.
---

# Notedrop Viewer Dev Server

Start `viewer/` as a standalone Next dev server **and** the live-reload preview sidecar so browser checks use current workspace source. `npm run dev` starts both via `concurrently`:

- **Next dev** on `localhost:3100` — viewer source + HMR
- **Preview sidecar** on `localhost:4321` — `viewer/samples/` watched by chokidar; the same `PreviewServer` class the Obsidian plugin uses, exposing `/manifest.json`, `/content/<hash>/index.md`, `/content/<hash>/_assets/*`, `/events` (SSE)
- Next dev `beforeFiles` rewrites proxy those four paths to the sidecar so the browser sees a single origin (`http://localhost:3100`).

`viewer/samples/**` edits → ~200ms debounce → sidecar full rebuild (seeded, stable hashes) → SSE `event: changed` → viewer auto-invalidates manifest + content cache. No manual reload, no `npm run gen:sample`.

## Canonical Procedure (do not deviate)

This procedure is fixed. Do not invent alternative shapes. Always two PowerShell tool calls in this exact order, then a third readiness poll.

### Step 1 — Free both ports (idempotent)

```powershell
$ports = @(3100, 4321)
foreach ($port in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq Listen
  if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
}
```

Skip Step 1 only when you are certain no prior dev process is bound to either port in this session.

### Step 2 — Launch dev (background)

Single PowerShell tool call with `run_in_background: true`. **No `-p` flag** — the port is baked into the `dev:next` script and concurrently swallows extra args anyway.

```powershell
Set-Location 'C:\Users\User\Documents\github_siakun\notedrop\viewer'
npm run dev
```

The tool returns a background task id (e.g. `bt6wd0uv6`) and an output log path under
`C:\Users\User\AppData\Local\Temp\claude\...\tasks\<id>.output`. **Record both** in the user-facing response. The log is multiplexed (`[sidecar]` and `[next]` prefixes from concurrently).

### Step 3 — Poll both services for readiness (foreground)

Separate PowerShell tool call (no `run_in_background`). Both must be up before declaring ready — Next without sidecar will silently 502/empty on `/manifest.json` even though `localhost:3100` itself returns 200.

```powershell
$nextReady = $false
$sidecarReady = $false
for ($i = 0; $i -lt 120; $i++) {
  if (-not $sidecarReady) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:4321/manifest.json" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { Write-Output "Sidecar ready ($i)"; $sidecarReady = $true }
    } catch {}
  }
  if (-not $nextReady) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:3100" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Write-Output "Next ready ($i)"; $nextReady = $true }
    } catch {}
  }
  if ($sidecarReady -and $nextReady) { break }
  Start-Sleep -Milliseconds 500
}
if (-not ($sidecarReady -and $nextReady)) {
  Write-Output "TIMEOUT — sidecar=$sidecarReady next=$nextReady"
}
```

### Step 4 — Report

Tell the user:
- URL: `http://localhost:3100`
- Background task id + log path
- That `viewer/src/**` edits trigger HMR, and `viewer/samples/**` edits trigger sidecar SSE auto-reload (no `npm run gen:sample` needed).

### Stop

Kill both listeners (sidecar will follow when its parent dies, but always free both ports defensively):

```powershell
$ports = @(3100, 4321)
foreach ($port in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq Listen
  if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
}
```

## Forbidden Variants

These are explicitly prohibited because they have produced inconsistent behavior across runs:

- ❌ `npm run dev -- -p 3100` (legacy form). `concurrently` swallows the extra args; the `-p` flag never reaches `next dev`. Port is now hardcoded in the `dev:next` script.
- ❌ `npm run dev:next` alone. Without the sidecar, `/manifest.json` and `/content/**` return either stale `viewer/public/` (if Next somehow serves them) or 502 (if the rewrite proxy 502s). Either way the viewer's manifest fetch is broken.
- ❌ `npm run gen:sample` before `npm run dev`. The sidecar serves `viewer/samples/` dynamically — there is no need to pre-generate `viewer/public/`. Pre-generation is `prebuild` only (production export).
- ❌ `Start-Job` / `$job = Start-Job ...` — log streaming is awkward and the job survives session boundaries unexpectedly.
- ❌ `Start-Process npm ...` — orphaned process trees, no log capture.
- ❌ Bash `run_in_background: true` for this skill — Windows-pinned paths and the rest of the toolchain assume PowerShell.
- ❌ Combining launch + poll in a single PowerShell call — the launch must use `run_in_background: true`, the poll must not.
- ❌ Adding `Write-Host` instrumentation, `try/finally` wrappers, or auto-stop logic to Step 2 — the background task already manages lifecycle; extra wrappers obscure the task id.
- ❌ Polling only `localhost:3100` (Next) without separately confirming `127.0.0.1:4321/manifest.json` (sidecar). Next being up does not mean the sidecar is ready, and a fast user clicking through will see broken fetches.
- ❌ Picking a different port without reason. Defaults are `3100` (Next) + `4321` (sidecar). Override the sidecar port via `NOTEDROP_SIDECAR_PORT` env (read by both the sidecar and Next's `rewrites()`); the Next port is hardcoded in the `dev:next` script and not env-configurable.

If a future situation seems to require a forbidden variant, stop and ask the user before deviating.

## Boundary

Use `notedrop-dogfood-automation` instead for Obsidian plugin commands, publish output, release assets, cache behavior, GH Pages, or BRAT. This skill only proves current `viewer/` source + `viewer/samples/` content served via Next dev + preview sidecar.

The sidecar reuses the plugin's `PreviewServer` class verbatim — same SSE event format (`event: added|changed|removed`, `data: { hash }`), same path conventions, same `basePath` strip logic. So this dev workflow exercises the actual transport the plugin uses; behavioral drift between dev and plugin preview is now mostly impossible.

## Relation to Sibling Skills

- `notedrop-viewer-dev-preview` Automated Verification mode runs the helper script which manages its own lifecycle — do **not** use this skill's Step 2 launch in that mode.
- `notedrop-viewer-dev-preview` Manual Launch mode and standalone "open the viewer for me" requests use this skill's Canonical Procedure.
- `notedrop-viewer-playwright-check` and `notedrop-viewer-screenshot-check` consume the URL produced here.
