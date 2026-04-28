---
name: notedrop-viewer-dev-server
description: Use when notedrop viewer source must be served locally for browser inspection without Obsidian, publish, release, version bump, BRAT, or GitHub Pages.
---

# Notedrop Viewer Dev Server

Start `viewer/` as a standalone Next dev server so browser checks use current workspace source.

## Workflow

1. Pick an unused port, usually `3100` or `3101`.
2. Prefer the helper script at `.agents/skills/notedrop-viewer-dev-preview/scripts/run-viewer-dev-preview.ps1` when a Playwright script will run.
3. If starting manually, use PowerShell `Start-Job`, poll `http://localhost:<port>` with `Invoke-WebRequest`, run the browser check, then stop/remove the job in `finally`.
4. Do not use this as proof for plugin/publish behavior.

## Manual Pattern

```powershell
$viewer = 'C:\Users\User\Documents\github_siakun\notedrop\viewer'
$port = 3100
$job = Start-Job -ScriptBlock {
  param($viewerPath, $serverPort)
  Set-Location $viewerPath
  npm run dev -- -p $serverPort
} -ArgumentList $viewer, $port

try {
  for ($i = 0; $i -lt 80; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { break }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  # Browser verification goes here.
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Receive-Job $job -ErrorAction SilentlyContinue | Select-Object -Last 40
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}
```

## Boundary

Use `notedrop-dogfood-automation` instead for Obsidian plugin commands, publish output, release assets, cache behavior, GH Pages, or BRAT.
