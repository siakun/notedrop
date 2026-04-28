[CmdletBinding()]
param(
  [int]$Port = 3100,
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

$job = Start-Job -ScriptBlock {
  param($viewerPath, $serverPort)
  Set-Location $viewerPath
  npm run dev -- -p $serverPort
} -ArgumentList $ViewerDir, $Port

try {
  $ready = $false
  for ($i = 0; $i -lt 80; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $ready) {
    throw "Next dev server did not become ready: $targetUrl"
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
}
