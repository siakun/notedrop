---
name: notedrop-viewer-dev-server
description: Use when notedrop viewer source must be served locally for browser inspection without Obsidian, publish, release, version bump, BRAT, or GitHub Pages.
---

# Notedrop Viewer Dev Server

Start `viewer/` as a standalone Next dev server so browser checks use current workspace source.

## Canonical Procedure (do not deviate)

This procedure is fixed. Do not invent alternative shapes. Always two PowerShell tool calls in this exact order:

### Step 1 — Free the port (idempotent)

```powershell
$port = 3100
Stop-Job -Name notedrop-viewer-dev -ErrorAction SilentlyContinue
Remove-Job -Name notedrop-viewer-dev -Force -ErrorAction SilentlyContinue
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq Listen
if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
```

Skip Step 1 only when you are certain no prior dev server / leftover `Start-Job` is bound to the port in this session.

### Step 2 — Launch the dev server (background)

Single PowerShell tool call with `run_in_background: true`:

```powershell
Set-Location 'C:\Users\User\Documents\github_siakun\notedrop\viewer'
npm run dev -- -p 3100
```

The tool returns a background task id (e.g. `bisrpsfz4`) and an output log path under
`C:\Users\User\AppData\Local\Temp\claude\...\tasks\<id>.output`. **Record both** in the user-facing response.

### Step 3 — Poll readiness (foreground)

Separate PowerShell tool call (no `run_in_background`):

```powershell
$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3100" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      Write-Output "Ready after $i polls. Status=$($r.StatusCode)"
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
if (-not $ready) { Write-Output "Did not respond within budget." }
```

### Step 4 — Report

Tell the user the URL, the background task id, and the log path. HMR is automatic; the user can edit `viewer/src/**` and the browser refreshes.

### Stop

When the user signals done — or before claiming the task complete in the *automated* mode of `notedrop-viewer-dev-preview` — kill the listener:

```powershell
$conn = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Where-Object State -eq Listen
if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
```

## Forbidden Variants

These are explicitly prohibited because they have produced inconsistent behavior across runs:

- ❌ `Start-Job` / `$job = Start-Job ...` — log streaming is awkward and the job survives session boundaries unexpectedly.
- ❌ `Start-Process npm ...` — orphaned process trees, no log capture.
- ❌ Bash `run_in_background: true` for this skill — Windows-pinned paths and the rest of the toolchain assume PowerShell.
- ❌ Combining launch + poll in a single PowerShell call — the launch must use `run_in_background: true`, the poll must not.
- ❌ Adding `Write-Host` instrumentation, `try/finally` wrappers, or auto-stop logic to Step 2 — the background task already manages lifecycle; extra wrappers obscure the task id.
- ❌ Picking a different port without reason. Default is `3100`. Use `3101` only if `3100` is genuinely held by another process you cannot stop.

If a future situation seems to require a forbidden variant, stop and ask the user before deviating.

## Boundary

Use `notedrop-dogfood-automation` instead for Obsidian plugin commands, publish output, release assets, cache behavior, GH Pages, or BRAT. This skill only proves current `viewer/` source served by Next dev.

## Relation to Sibling Skills

- `notedrop-viewer-dev-preview` Automated Verification mode runs the helper script which manages its own lifecycle — do **not** use this skill's Step 2 launch in that mode.
- `notedrop-viewer-dev-preview` Manual Launch mode and standalone "open the viewer for me" requests use this skill's Canonical Procedure.
- `notedrop-viewer-playwright-check` and `notedrop-viewer-screenshot-check` consume the URL produced here.
