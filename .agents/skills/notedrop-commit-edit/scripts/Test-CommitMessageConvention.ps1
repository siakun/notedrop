[CmdletBinding(DefaultParameterSetName = "Last")]
param(
    [Parameter(ParameterSetName = "Last")]
    [ValidateRange(1, 1000)]
    [int]$Last = 10,

    [Parameter(ParameterSetName = "Range", Mandatory = $true)]
    [string]$Range,

    [switch]$AllowEnglishSubject
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function U {
    param([int]$CodePoint)
    return [char]::ConvertFromUtf32($CodePoint)
}

$expectedTypeByEmoji = @{
    (U 0x2728) = "feat"
    (U 0x1F41B) = "fix"
    (U 0x1F4DD) = "docs"
    (U 0x1F3A8) = "style"
    ((U 0x267B) + (U 0xFE0F)) = "refactor"
    (U 0x26A1) = "perf"
    (U 0x2705) = "test"
    (U 0x1F4E6) = "build"
    (U 0x1F477) = "ci"
    (U 0x1F527) = "chore"
    (U 0x1F516) = "release"
}

$forbidden = @(
    @{ Char = (U 0x00B7); Name = "middle dot"; Replacement = "," },
    @{ Char = (U 0x2014); Name = "em dash"; Replacement = "-" },
    @{ Char = (U 0x2192); Name = "right arrow"; Replacement = "->" },
    @{ Char = (U 0x00A7); Name = "section sign"; Replacement = "#" }
)

if ($PSCmdlet.ParameterSetName -eq "Range") {
    $gitArgs = @("log", "--format=%H%x09%s", $Range)
    $label = $Range
} else {
    $gitArgs = @("log", "-$Last", "--format=%H%x09%s")
    $label = "last $Last"
}

$lines = & git @gitArgs
if ($LASTEXITCODE -ne 0) {
    throw "git $($gitArgs -join ' ') failed with exit $LASTEXITCODE"
}

$issues = New-Object System.Collections.Generic.List[string]
$checked = 0
$pattern = '^(?<emoji>\S+)\s+(?<type>[a-z]+)(?<scope>\([A-Za-z0-9._/-]+\))?:\s+(?<subject>.+)$'
$hangulPattern = "[" + [char]0xAC00 + "-" + [char]0xD7A3 + "]"

function Test-AllowedSubjectCharacter {
    param([char]$Character)
    $code = [int]$Character
    if ($code -ge 0x20 -and $code -le 0x7E) { return $true }
    if ($code -ge 0xAC00 -and $code -le 0xD7A3) { return $true }
    if ($code -ge 0x3130 -and $code -le 0x318F) { return $true }
    return $false
}

foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split "`t", 2
    if ($parts.Count -ne 2) {
        $issues.Add("Malformed git log output: $line")
        continue
    }

    $sha = $parts[0]
    $subjectLine = $parts[1]
    $checked++

    $match = [regex]::Match($subjectLine, $pattern)
    if (-not $match.Success) {
        $issues.Add("$($sha.Substring(0, 7)): invalid shape: $subjectLine")
        continue
    }

    $emoji = $match.Groups["emoji"].Value
    $type = $match.Groups["type"].Value
    $subject = $match.Groups["subject"].Value

    if (-not $expectedTypeByEmoji.ContainsKey($emoji)) {
        $issues.Add("$($sha.Substring(0, 7)): unknown gitmoji '$emoji': $subjectLine")
    } elseif ($expectedTypeByEmoji[$emoji] -ne $type) {
        $issues.Add("$($sha.Substring(0, 7)): gitmoji/type mismatch: '$emoji' expects '$($expectedTypeByEmoji[$emoji])', got '$type'")
    }

    foreach ($entry in $forbidden) {
        if ($subjectLine.Contains($entry.Char)) {
            $issues.Add("$($sha.Substring(0, 7)): forbidden $($entry.Name), use '$($entry.Replacement)': $subjectLine")
        }
    }

    for ($i = 0; $i -lt $subject.Length; $i++) {
        if (-not (Test-AllowedSubjectCharacter $subject[$i])) {
            $code = [int]$subject[$i]
            $issues.Add("$($sha.Substring(0, 7)): non-keyboard subject character U+$('{0:X4}' -f $code): $subjectLine")
            break
        }
    }

    if (-not $AllowEnglishSubject -and $subject -notmatch $hangulPattern) {
        $issues.Add("$($sha.Substring(0, 7)): subject should include Korean text unless explicitly allowed: $subjectLine")
    }
}

if ($issues.Count -gt 0) {
    Write-Host "Commit message convention FAILED for $label ($checked commits):"
    foreach ($issue in $issues) {
        Write-Host " - $issue"
    }
    exit 1
}

Write-Host "Commit message convention OK for $label ($checked commits)."
