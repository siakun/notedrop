[CmdletBinding()]
param(
  # Next dev port. Baked into the viewer's `dev:next` script as 3100. Override
  # only when 3100 is genuinely held; the sidecar still listens on
  # SidecarPort regardless, and the rewrites read NOTEDROP_SIDECAR_PORT.
  [int]$Port = 3100,
  [int]$SidecarPort = 4321,
  [string]$ViewerDir,
  [string]$PlaywrightSkillDir,
  [Parameter(Mandatory = $true)]
  [string]$PlaywrightScript
)

$ErrorActionPreference = 'Stop'

if (-not $ViewerDir) {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')
  $ViewerDir = Join-Path $repoRoot.Path 'viewer'
}

if (-not (Test-Path -LiteralPath (Join-Path $ViewerDir 'package.json'))) {
  throw "ViewerDir does not look like the notedrop viewer package: $ViewerDir"
}

if (-not $PlaywrightSkillDir) {
  $PlaywrightSkillDir = Join-Path $env:USERPROFILE '.agents\skills\playwright-skill'
}

if (-not (Test-Path -LiteralPath (Join-Path $PlaywrightSkillDir 'run.js'))) {
  throw "playwright-skill run.js not found: $PlaywrightSkillDir"
}

$scriptPath = Resolve-Path $PlaywrightScript
$targetUrl = "http://localhost:$Port"
$sidecarUrl = "http://127.0.0.1:$SidecarPort/manifest.json"

# `npm run dev` now starts `concurrently sidecar + next` from a single job.
# The Next port is hardcoded in `dev:next` (passing -- -p X is swallowed by
# concurrently). The sidecar reads NOTEDROP_SIDECAR_PORT, which Next's
# rewrites also read — change one env var, both follow.
$job = Start-Job -ScriptBlock {
  param($viewerPath, $sidecarPortValue)
  Set-Location $viewerPath
  $env:NOTEDROP_SIDECAR_PORT = "$sidecarPortValue"
  npm run dev
} -ArgumentList $ViewerDir, $SidecarPort

try {
  $nextReady = $false
  $sidecarReady = $false
  for ($i = 0; $i -lt 120; $i++) {
    if (-not $sidecarReady) {
      try {
        $r = Invoke-WebRequest -Uri $sidecarUrl -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $sidecarReady = $true }
      } catch {}
    }
    if (-not $nextReady) {
      try {
        $r = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $nextReady = $true }
      } catch {}
    }
    if ($sidecarReady -and $nextReady) { break }
    Start-Sleep -Milliseconds 500
  }

  if (-not ($sidecarReady -and $nextReady)) {
    throw "dev did not become ready: next=$nextReady sidecar=$sidecarReady (urls: $targetUrl, $sidecarUrl)"
  }

  Push-Location $PlaywrightSkillDir
  try {
    $env:TARGET_URL = $targetUrl
    node run.js $scriptPath.Path
  } finally {
    Remove-Item Env:\TARGET_URL -ErrorAction SilentlyContinue
    Pop-Location
  }
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Receive-Job $job -ErrorAction SilentlyContinue | Select-Object -Last 40
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  # concurrently spawns child processes that may outlive the PowerShell job.
  # Free both ports explicitly.
  foreach ($p in @($Port, $SidecarPort)) {
    $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Where-Object State -eq Listen
    if ($conn) { $conn | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
  }
}
