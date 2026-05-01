# link-agent-files.ps1
#
# Unify Codex (.agents/skills, AGENTS.md) and Claude Code (.claude/skills, CLAUDE.md)
# so both tools converge on the Codex-native canonical source.
#
#   .agents/skills/  = canonical (real directory)   <-- .claude/skills/  is a Junction
#   AGENTS.md        = canonical (real file)        <-- CLAUDE.md        is a tracked shim
#
# Migration rules (when run on a machine with the "wrong" side present):
#   * Only .claude/skills exists (real)        -> moved to .agents/skills
#   * Only CLAUDE.md exists (real)             -> renamed to AGENTS.md
#   * CLAUDE.md is missing / diverged / legacy
#     hard link                              -> backed up when needed and
#                                                recreated as the shim
# After migration the script (re)creates the skills junction and CLAUDE.md shim.
#
# Idempotent: safe to run repeatedly. Windows-only for the skills junction.
# Junctions don't need elevated privileges (same volume).
#
# Usage:
#   pwsh scripts/link-agent-files.ps1
#   .\scripts\link-agent-files.ps1     (Windows PowerShell 5.1)

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not in a git repository (run from a clone)." }
$repoRoot = $repoRoot.Trim()

# -------- helpers --------------------------------------------------------

function Get-EntryKind {
    # Returns: "missing" | "Junction" | "HardLink" | "SymbolicLink" | "real"
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return "missing" }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType) { return $item.LinkType }
    return "real"
}

function Get-JunctionTarget {
    param([string]$Path)
    return @((Get-Item -LiteralPath $Path -Force).Target)[0]
}

function Get-BackupStamp { Get-Date -Format "yyyyMMddHHmmss" }

function Move-OverWithBackup {
    # Move $From over $To, backing up $To first. Returns the backup path.
    param([string]$From, [string]$To)
    $backup = "$To.bak.$(Get-BackupStamp)"
    Move-Item -LiteralPath $To -Destination $backup
    Move-Item -LiteralPath $From -Destination $To
    return $backup
}

function Backup-And-Remove {
    param([string]$Path)
    $backup = "$Path.bak.$(Get-BackupStamp)"
    Copy-Item -LiteralPath $Path -Destination $backup
    Remove-Item -LiteralPath $Path -Force
    return $backup
}

function Test-TextFileEquals {
    param([string]$Path, [string]$Expected)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $actualText = (Get-Content -Raw -Encoding UTF8 -LiteralPath $Path).TrimEnd("`r", "`n")
    $expectedText = $Expected.TrimEnd("`r", "`n")
    return ($actualText -eq $expectedText)
}

# -------- Part 1: skills folder (.agents/skills <-> .claude/skills) ------

$canonicalSkills = Join-Path $repoRoot ".agents\skills"
$linkSkills      = Join-Path $repoRoot ".claude\skills"

foreach ($p in @((Split-Path $canonicalSkills -Parent), (Split-Path $linkSkills -Parent))) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

$canKind  = Get-EntryKind $canonicalSkills
$linkKind = Get-EntryKind $linkSkills
Write-Host "[skills] canonical=$canKind link=$linkKind"

# (a) Only .claude/skills exists as real -> move it
if ($canKind -eq "missing" -and $linkKind -eq "real") {
    Write-Host "[skills] moving .claude/skills/ -> .agents/skills/"
    Move-Item -LiteralPath $linkSkills -Destination $canonicalSkills
    $canKind = "real"; $linkKind = "missing"
}

# (b) Both real -> per-entry merge (newer mtime wins)
if ($canKind -eq "real" -and $linkKind -eq "real") {
    Write-Host "[skills] both real - merging by newest mtime"
    foreach ($child in Get-ChildItem -LiteralPath $linkSkills -Force) {
        $src = $child.FullName
        $dst = Join-Path $canonicalSkills $child.Name
        if (-not (Test-Path -LiteralPath $dst)) {
            Move-Item -LiteralPath $src -Destination $dst
            Write-Host "  + moved $($child.Name)"
            continue
        }
        $srcMtime = (Get-Item -LiteralPath $src -Force).LastWriteTimeUtc
        $dstMtime = (Get-Item -LiteralPath $dst -Force).LastWriteTimeUtc
        if ($srcMtime -gt $dstMtime) {
            $bak = Move-OverWithBackup -From $src -To $dst
            Write-Host "  ! claude newer - replaced $($child.Name) (old kept at $($bak | Split-Path -Leaf))"
        } else {
            $bak = "$src.bak.$(Get-BackupStamp)"
            Move-Item -LiteralPath $src -Destination $bak
            Write-Host "  - agents newer - kept $($child.Name); claude copy -> $($bak | Split-Path -Leaf)"
        }
    }
    if ((Get-ChildItem -LiteralPath $linkSkills -Force | Measure-Object).Count -eq 0) {
        Remove-Item -LiteralPath $linkSkills -Force
        $linkKind = "missing"
    }
}

# (c) Ensure canonical exists
if ($canKind -eq "missing") {
    New-Item -ItemType Directory -Path $canonicalSkills -Force | Out-Null
    Write-Host "[skills] created empty .agents/skills/"
}

# (d) Create / fix the junction
if ($linkKind -eq "Junction") {
    if ((Get-JunctionTarget $linkSkills) -ne $canonicalSkills) {
        Write-Host "[skills] junction target mismatch - recreating"
        [System.IO.Directory]::Delete($linkSkills, $false)
        $linkKind = "missing"
    } else {
        Write-Host "[skills] junction already correct"
    }
}
if ($linkKind -eq "missing") {
    New-Item -ItemType Junction -Path $linkSkills -Target $canonicalSkills | Out-Null
    Write-Host "[skills] junction created -> $canonicalSkills"
} elseif ($linkKind -ne "Junction") {
    throw "[skills] .claude/skills is unexpected kind '$linkKind' - resolve manually"
}

# -------- Part 2: AGENTS.md -> CLAUDE.md compatibility shim ---------------

$canonicalMd = Join-Path $repoRoot "AGENTS.md"
$linkMd      = Join-Path $repoRoot "CLAUDE.md"
$claudeShim = @'
# Claude Code Compatibility Shim

This repo uses `AGENTS.md` as the canonical shared instruction file.

Before doing any work in this repo, read and follow `AGENTS.md`.

Do not edit this file. To change shared project instructions, edit `AGENTS.md`.
'@

$canMdKind  = Get-EntryKind $canonicalMd
$linkMdKind = Get-EntryKind $linkMd
Write-Host "[md] canonical=$canMdKind link=$linkMdKind"

# (a) Only CLAUDE.md exists as real project instructions -> rename it once.
if ($canMdKind -eq "missing" -and $linkMdKind -eq "real" -and -not (Test-TextFileEquals $linkMd $claudeShim)) {
    Write-Host "[md] renaming CLAUDE.md -> AGENTS.md"
    Move-Item -LiteralPath $linkMd -Destination $canonicalMd
    $canMdKind = "real"; $linkMdKind = "missing"
}

# (b) Keep AGENTS.md canonical and make CLAUDE.md a small tracked shim.
if ($canMdKind -eq "missing") {
    Write-Host "[md] no AGENTS.md found - skipping CLAUDE.md shim"
} else {
    if ($linkMdKind -eq "missing") {
        Set-Content -LiteralPath $linkMd -Value $claudeShim -NoNewline -Encoding UTF8
        Write-Host "[md] CLAUDE.md shim created"
    } elseif (Test-TextFileEquals $linkMd $claudeShim) {
        Write-Host "[md] CLAUDE.md shim already correct"
    } else {
        if ($linkMdKind -eq "HardLink") {
            Remove-Item -LiteralPath $linkMd -Force
            Write-Host "[md] removed legacy CLAUDE.md hard link"
        } else {
            $bak = Backup-And-Remove $linkMd
            Write-Host "[md] CLAUDE.md diverged - backed up to $($bak | Split-Path -Leaf)"
        }
        Set-Content -LiteralPath $linkMd -Value $claudeShim -NoNewline -Encoding UTF8
        Write-Host "[md] CLAUDE.md shim created"
    }
}

Write-Host ""
Write-Host "Done."
