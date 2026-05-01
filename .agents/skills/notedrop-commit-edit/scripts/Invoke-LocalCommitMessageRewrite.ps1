[CmdletBinding(DefaultParameterSetName = "DefaultRange")]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$ReplacementFile,

    [Parameter(ParameterSetName = "Last")]
    [ValidateRange(1, 1000)]
    [int]$Last,

    [Parameter(ParameterSetName = "Range")]
    [string]$Range,

    [string]$BaseRef = "origin/main",
    [string]$Branch = "main",
    [string]$TempRoot = "C:\tmp",
    [switch]$ApplyToMain
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & git -C $WorkingDirectory @Arguments 2>&1
        $exit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exit -ne 0 -and -not $AllowFailure) {
        throw "git -C '$WorkingDirectory' $($Arguments -join ' ') failed with exit $exit`n$output"
    }
    return @($output)
}

function Assert-GitFilterRepo {
    $output = Invoke-Git -Arguments @("filter-repo", "--version") -AllowFailure
    if ($LASTEXITCODE -ne 0) {
        throw "git-filter-repo is required for message rewrite. Install it before retrying.`n$output"
    }
}

function Get-TrackedStatus {
    $status = Invoke-Git -Arguments @("status", "--porcelain=v1")
    return @($status | Where-Object { $_ -and $_ -notmatch '^\?\?' })
}

Assert-GitFilterRepo

$currentBranch = (Invoke-Git -Arguments @("branch", "--show-current") | Select-Object -First 1).Trim()
if ($ApplyToMain -and $currentBranch -ne $Branch) {
    throw "ApplyToMain requires current branch '$Branch', got '$currentBranch'."
}

if ($ApplyToMain) {
    $trackedStatus = @(Get-TrackedStatus)
    if ($trackedStatus.Count -gt 0) {
        throw "Tracked working tree changes exist. Refusing to reset '$Branch'.`n$($trackedStatus -join "`n")"
    }
}

$replacementText = Get-Content -Raw -Encoding UTF8 -LiteralPath $ReplacementFile
if ($replacementText -notmatch '==>') {
    throw "ReplacementFile must contain at least one 'old==>new' rule."
}
$oldSubjects = @(
    $replacementText -split "`r?`n" |
        Where-Object { $_ -match '==>' } |
        ForEach-Object { ($_ -split '==>', 2)[0] } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)
foreach ($oldSubject in $oldSubjects) {
    if ($oldSubject.StartsWith("regex:")) {
        throw "Regex replacement rules are not supported by this safety wrapper: $oldSubject"
    }
}

if ($PSCmdlet.ParameterSetName -eq "Range") {
    $targetSpec = $Range
} elseif ($PSCmdlet.ParameterSetName -eq "Last") {
    $targetSpec = "--max-count=$Last HEAD"
} else {
    $baseCheck = Invoke-Git -Arguments @("rev-parse", "--verify", $BaseRef) -AllowFailure
    if ($LASTEXITCODE -eq 0) {
        $targetSpec = "$BaseRef..HEAD"
    } else {
        throw "Default range needs '$BaseRef'. Pass -Last or -Range explicitly."
    }
}

if ($PSCmdlet.ParameterSetName -eq "Last") {
    $targetCommits = Invoke-Git -Arguments @("rev-list", "--max-count=$Last", "HEAD")
} else {
    $targetCommits = Invoke-Git -Arguments @("rev-list", $targetSpec)
}

$targetCommits = @($targetCommits | Where-Object { $_ })
if ($targetCommits.Count -eq 0) {
    throw "No target commits found for '$targetSpec'."
}

$baseSha = $null
$baseCheck = Invoke-Git -Arguments @("rev-parse", "--verify", $BaseRef) -AllowFailure
if ($LASTEXITCODE -eq 0 -and @($baseCheck).Count -gt 0) {
    $baseSha = ($baseCheck | Select-Object -First 1).Trim()
}

$targetSet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($sha in $targetCommits) {
    [void]$targetSet.Add($sha)
}

$pushed = New-Object System.Collections.Generic.List[string]
foreach ($sha in $targetCommits) {
    $contains = Invoke-Git -Arguments @("branch", "-r", "--contains", $sha) -AllowFailure
    $containsMatches = @($contains | Where-Object { $_.Trim() })
    if ($LASTEXITCODE -eq 0 -and $containsMatches.Count -gt 0) {
        $pushed.Add($sha)
    }
}
if ($pushed.Count -gt 0) {
    throw "At least one target commit is already contained in a remote branch. Stop for explicit force-push review.`n$($pushed -join "`n")"
}

$outsideMatches = New-Object System.Collections.Generic.List[string]
$allHeadCommits = @(Invoke-Git -Arguments @("rev-list", "HEAD") | Where-Object { $_ })
foreach ($sha in $allHeadCommits) {
    if ($targetSet.Contains($sha)) { continue }
    $message = (Invoke-Git -Arguments @("show", "--no-patch", "--format=%B", $sha) | Out-String)
    foreach ($oldSubject in $oldSubjects) {
        if ($message.Contains($oldSubject)) {
            $outsideMatches.Add("$($sha.Substring(0, 7)): $oldSubject")
        }
    }
}
if ($outsideMatches.Count -gt 0) {
    throw "Replacement text appears outside the target commits. Narrow the replacement map before retrying.`n$($outsideMatches -join "`n")"
}

New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundle = Join-Path $TempRoot "backup-commit-edit-$timestamp.bundle"
$work = Join-Path $TempRoot "commit-edit-workdir-$timestamp"
$normalizedReplacementFile = Join-Path $TempRoot "commit-edit-replacements-$timestamp.txt"

if (Test-Path -LiteralPath $bundle) { throw "Bundle already exists: $bundle" }
if (Test-Path -LiteralPath $work) { throw "Workdir already exists: $work" }
if (Test-Path -LiteralPath $normalizedReplacementFile) { throw "Replacement temp file already exists: $normalizedReplacementFile" }

Invoke-Git -Arguments @("bundle", "create", $bundle, "--all") | Out-Null
Invoke-Git -Arguments @("clone", "--no-hardlinks", ".", $work) | Out-Null
Invoke-Git -WorkingDirectory $work -Arguments @("remote", "remove", "origin") | Out-Null
[System.IO.File]::WriteAllText($normalizedReplacementFile, $replacementText, [System.Text.UTF8Encoding]::new($false))

Invoke-Git -WorkingDirectory $work -Arguments @("filter-repo", "--replace-message", $normalizedReplacementFile, "--refs", "HEAD", "--force") | Out-Host

$backupRef = "_backup_$Branch"
Invoke-Git -WorkingDirectory $work -Arguments @("fetch", $bundle, "refs/heads/$Branch`:refs/heads/$backupRef") | Out-Null

$newHead = (Invoke-Git -WorkingDirectory $work -Arguments @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
$oldHead = (Invoke-Git -WorkingDirectory $work -Arguments @("rev-parse", "refs/heads/$backupRef") | Select-Object -First 1).Trim()

if ($baseSha) {
    Invoke-Git -WorkingDirectory $work -Arguments @("cat-file", "-e", "$baseSha^{commit}") | Out-Null
    Invoke-Git -WorkingDirectory $work -Arguments @("merge-base", "--is-ancestor", $baseSha, "HEAD") | Out-Null
}

$oldCount = [int](Invoke-Git -WorkingDirectory $work -Arguments @("rev-list", "--count", "refs/heads/$backupRef") | Select-Object -First 1)
$newCount = [int](Invoke-Git -WorkingDirectory $work -Arguments @("rev-list", "--count", "HEAD") | Select-Object -First 1)
if ($oldCount -ne $newCount) {
    throw "Commit count mismatch: backup=$oldCount new=$newCount"
}

$oldTrees = @(Invoke-Git -WorkingDirectory $work -Arguments @("log", "--reverse", "--format=%T", "refs/heads/$backupRef"))
$newTrees = @(Invoke-Git -WorkingDirectory $work -Arguments @("log", "--reverse", "--format=%T", "HEAD"))
if ($oldTrees.Count -ne $newTrees.Count) {
    throw "Tree sequence count mismatch: backup=$($oldTrees.Count) new=$($newTrees.Count)"
}

$rewrittenSubjects = @(Invoke-Git -WorkingDirectory $work -Arguments @("log", "--format=%s", "--max-count=$($targetCommits.Count)", "HEAD"))
foreach ($oldSubject in $oldSubjects) {
    if ($rewrittenSubjects -contains $oldSubject) {
        throw "Replacement did not apply to target subject: $oldSubject"
    }
}
for ($i = 0; $i -lt $oldTrees.Count; $i++) {
    if ($oldTrees[$i] -ne $newTrees[$i]) {
        throw "Tree mismatch at index $i. backup=$($oldTrees[$i]) new=$($newTrees[$i])"
    }
}

$compareCount = $targetCommits.Count
if ($compareCount -gt 0) {
    $oldBaseCheck = Invoke-Git -WorkingDirectory $work -Arguments @("rev-parse", "refs/heads/$backupRef~$compareCount") -AllowFailure
    $oldBaseOk = ($LASTEXITCODE -eq 0)
    $newBaseCheck = Invoke-Git -WorkingDirectory $work -Arguments @("rev-parse", "HEAD~$compareCount") -AllowFailure
    $newBaseOk = ($LASTEXITCODE -eq 0)
    if ($oldBaseOk -and $newBaseOk -and @($oldBaseCheck).Count -gt 0 -and @($newBaseCheck).Count -gt 0) {
        Write-Host "--- range-diff ---"
        Invoke-Git -WorkingDirectory $work -Arguments @("range-diff", "refs/heads/$backupRef~$compareCount..refs/heads/$backupRef", "HEAD~$compareCount..HEAD") | Out-Host
    } else {
        Write-Host "range-diff skipped: target range reaches repository root."
    }
}

Invoke-Git -WorkingDirectory $work -Arguments @("branch", "-D", $backupRef) | Out-Null

Write-Host "Rewrite verification OK."
Write-Host "Bundle: $bundle"
Write-Host "Workdir: $work"
Write-Host "Old HEAD: $oldHead"
Write-Host "New HEAD: $newHead"
Write-Host "Commit count: $newCount"
Write-Host "Tree identity: OK"
if ($baseSha) {
    Write-Host "Base ancestor: OK ($BaseRef $baseSha)"
}

if ($ApplyToMain) {
    $trackedStatus = @(Get-TrackedStatus)
    if ($trackedStatus.Count -gt 0) {
        throw "Tracked working tree changes appeared after verification. Refusing to reset '$Branch'.`n$($trackedStatus -join "`n")"
    }

    Invoke-Git -Arguments @("fetch", $work, $Branch) | Out-Null
    $fetchHead = (Invoke-Git -Arguments @("rev-parse", "FETCH_HEAD") | Select-Object -First 1).Trim()
    if ($fetchHead -ne $newHead) {
        throw "FETCH_HEAD mismatch. expected=$newHead actual=$fetchHead"
    }
    Invoke-Git -Arguments @("reset", "--hard", "FETCH_HEAD") | Out-Host
    Write-Host "Applied rewritten history to '$Branch'."
}
else {
    Write-Host "Not applied to '$Branch'. Re-run with -ApplyToMain after review."
}
