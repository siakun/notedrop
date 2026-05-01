param()

$ErrorActionPreference = "Stop"

$repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw "Not in a git repository (run from a clone)." }

$scriptUnderTest = Join-Path $repoRoot "scripts\link-agent-files.ps1"

function New-TestRepo {
    $name = "notedrop-link-agent-files-test-$([guid]::NewGuid().ToString('N'))"
    $path = Join-Path ([System.IO.Path]::GetTempPath()) $name
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Push-Location $path
    try {
        git init -q
        New-Item -ItemType Directory -Path "scripts" -Force | Out-Null
        Copy-Item -LiteralPath $scriptUnderTest -Destination "scripts\link-agent-files.ps1"
    } finally {
        Pop-Location
    }
    return $path
}

function Get-FileId {
    param([string]$Path)
    return (fsutil file queryfileid $Path)
}

function Invoke-InRepo {
    param(
        [string]$Repo,
        [scriptblock]$Script
    )
    Push-Location $Repo
    try {
        & $Script
    } finally {
        Pop-Location
    }
}

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )
    if ($Actual -ne $Expected) {
        throw "$Message`nExpected: $Expected`nActual:   $Actual"
    }
}

$repo = New-TestRepo
try {
    Invoke-InRepo $repo {
        Set-Content -LiteralPath "AGENTS.md" -Value "agents canonical" -NoNewline -Encoding UTF8
        Start-Sleep -Milliseconds 1200
        Set-Content -LiteralPath "CLAUDE.md" -Value "claude newer accidental edit" -NoNewline -Encoding UTF8

        .\scripts\link-agent-files.ps1 | Out-Null

        Assert-Equal (Get-Content -Raw -Encoding UTF8 "AGENTS.md") "agents canonical" "AGENTS.md must remain canonical when CLAUDE.md diverges"
        Assert-Equal (Get-Content -Raw -Encoding UTF8 "CLAUDE.md") "agents canonical" "CLAUDE.md must be recreated from AGENTS.md"
        Assert-Equal (Get-FileId "CLAUDE.md") (Get-FileId "AGENTS.md") "CLAUDE.md must be a hard link to AGENTS.md"

        $backup = Get-ChildItem -LiteralPath "." -Filter "CLAUDE.md.bak.*" | Select-Object -First 1
        if (-not $backup) { throw "Diverged CLAUDE.md was not backed up" }
        Assert-Equal (Get-Content -Raw -Encoding UTF8 $backup.FullName) "claude newer accidental edit" "CLAUDE.md backup must preserve discarded content"
    }
}
finally {
    Remove-Item -LiteralPath $repo -Recurse -Force
}

$repo = New-TestRepo
try {
    Invoke-InRepo $repo {
        Set-Content -LiteralPath "AGENTS.md" -Value "agents old canonical" -NoNewline -Encoding UTF8
        Start-Sleep -Milliseconds 1200
        Set-Content -LiteralPath "CLAUDE.md" -Value "claude intentionally promoted" -NoNewline -Encoding UTF8

        .\scripts\link-agent-files.ps1 -AdoptClaude | Out-Null

        Assert-Equal (Get-Content -Raw -Encoding UTF8 "AGENTS.md") "claude intentionally promoted" "AdoptClaude must promote CLAUDE.md content into AGENTS.md"
        Assert-Equal (Get-Content -Raw -Encoding UTF8 "CLAUDE.md") "claude intentionally promoted" "CLAUDE.md must match AGENTS.md after AdoptClaude"
        Assert-Equal (Get-FileId "CLAUDE.md") (Get-FileId "AGENTS.md") "CLAUDE.md must be a hard link to AGENTS.md after AdoptClaude"

        $backup = Get-ChildItem -LiteralPath "." -Filter "AGENTS.md.bak.*" | Select-Object -First 1
        if (-not $backup) { throw "Old AGENTS.md was not backed up during AdoptClaude" }
        Assert-Equal (Get-Content -Raw -Encoding UTF8 $backup.FullName) "agents old canonical" "AGENTS.md backup must preserve previous canonical content"
    }
}
finally {
    Remove-Item -LiteralPath $repo -Recurse -Force
}

Write-Host "link-agent-files tests passed"
