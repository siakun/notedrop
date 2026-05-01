# link-agent-files.ps1
#
# Unify Codex (.agents/skills, AGENTS.md) and Claude Code (.claude/skills, CLAUDE.md)
# so both tools read from a single canonical source.
#
#   .agents/skills/  = canonical (real directory)   <-- .claude/skills/  is a Junction
#   AGENTS.md        = canonical (real file)        <-- CLAUDE.md        is a HardLink
#
# Migration rules (when run on a machine with the "wrong" side present):
#   * Only .claude/skills exists (real)        -> moved to .agents/skills
#   * Only CLAUDE.md exists (real)             -> renamed to AGENTS.md
#   * Both AGENTS.md and CLAUDE.md exist real  -> AGENTS.md wins by default.
#                                                 CLAUDE.md is backed up and
#                                                 recreated as a hard link.
#                                                 Pass -AdoptClaude only when
#                                                 you intentionally want the
#                                                 CLAUDE.md copy to replace
#                                                 AGENTS.md.
# After migration the script (re)creates the junction and hard link.
#
# Idempotent: safe to run repeatedly. Windows-only (uses NTFS junction + hard link).
# Hard links and junctions don't need elevated privileges (same volume).
#
# Usage:
#   pwsh scripts/link-agent-files.ps1
#   .\scripts\link-agent-files.ps1     (Windows PowerShell 5.1)
#   .\scripts\link-agent-files.ps1 -AdoptClaude

[CmdletBinding()]
param(
    [switch]$AdoptClaude
)

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

function Test-SameFileIdentity {
    # NTFS hard links share size + LastWriteTime. PS5.1 doesn't expose Target for
    # hard links, so size + mtime is the practical identity check.
    param([string]$A, [string]$B)
    $a = Get-Item -LiteralPath $A -Force
    $b = Get-Item -LiteralPath $B -Force
    return ($a.Length -eq $b.Length) -and ($a.LastWriteTimeUtc -eq $b.LastWriteTimeUtc)
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

# -------- Part 2: AGENTS.md <-> CLAUDE.md --------------------------------

$canonicalMd = Join-Path $repoRoot "AGENTS.md"
$linkMd      = Join-Path $repoRoot "CLAUDE.md"

$canMdKind  = Get-EntryKind $canonicalMd
$linkMdKind = Get-EntryKind $linkMd
Write-Host "[md] canonical=$canMdKind link=$linkMdKind"

# (a) Only CLAUDE.md exists as real -> rename
if ($canMdKind -eq "missing" -and $linkMdKind -eq "real") {
    Write-Host "[md] renaming CLAUDE.md -> AGENTS.md"
    Move-Item -LiteralPath $linkMd -Destination $canonicalMd
    $canMdKind = "real"; $linkMdKind = "missing"
}

# (b) Both real -> AGENTS.md wins by default. CLAUDE.md can be promoted
# intentionally with -AdoptClaude.
if ($canMdKind -eq "real" -and $linkMdKind -eq "real") {
    $cM = (Get-Item -LiteralPath $canonicalMd -Force).LastWriteTimeUtc
    $lM = (Get-Item -LiteralPath $linkMd       -Force).LastWriteTimeUtc
    if ($AdoptClaude) {
        $bak = Move-OverWithBackup -From $linkMd -To $canonicalMd
        Write-Host "[md] -AdoptClaude set - replaced AGENTS.md with CLAUDE.md (old kept at $($bak | Split-Path -Leaf))"
    } else {
        if ($lM -gt $cM) {
            Write-Warning "[md] CLAUDE.md is newer/diverged, but AGENTS.md is canonical. Keeping AGENTS.md. Use -AdoptClaude to promote the Claude copy."
        }
        $bak = "$linkMd.bak.$(Get-BackupStamp)"
        Move-Item -LiteralPath $linkMd -Destination $bak
        Write-Host "[md] AGENTS.md canonical - kept; CLAUDE.md -> $($bak | Split-Path -Leaf)"
    }
    $linkMdKind = "missing"
}

if ($canMdKind -eq "missing") {
    Write-Host "[md] no AGENTS.md found - skipping hard link"
} else {
    # (c) Create / verify hard link
    $needCreate = $true
    if ($linkMdKind -eq "HardLink") {
        if (Test-SameFileIdentity $canonicalMd $linkMd) {
            Write-Host "[md] hard link already correct"
            $needCreate = $false
        } else {
            Write-Host "[md] hard link out of sync - recreating"
            Remove-Item -LiteralPath $linkMd -Force
        }
    } elseif ($linkMdKind -ne "missing") {
        throw "[md] CLAUDE.md is unexpected kind '$linkMdKind' - resolve manually"
    }
    if ($needCreate) {
        New-Item -ItemType HardLink -Path $linkMd -Value $canonicalMd | Out-Null
        Write-Host "[md] hard link created: CLAUDE.md -> AGENTS.md"
    }
}

Write-Host ""
Write-Host "Done."
