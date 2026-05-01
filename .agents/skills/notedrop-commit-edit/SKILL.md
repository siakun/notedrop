---
name: notedrop-commit-edit
description: Use when working in notedrop and a user asks to inspect, validate, amend, or rewrite git commit messages, especially recent local-only commits, Conventional Commits + Gitmoji, Korean subjects, or cleanup after accidental English or missing-gitmoji commits.
---

# Notedrop Commit Edit

## Overview

Use this skill for commit-message validation and message-only rewrites in this repo. Keep judgment in the skill and put repeatable mechanics in the bundled PowerShell scripts.

## Decision Rules

- First read the repo commit convention from project memory or `AGENTS.md`: `<gitmoji> <type>(scope): Korean subject`.
- Prefer script-assisted work for local-only commits. Use manual analysis for pushed commits, release/tag history, conflicts, or non-message changes.
- Never rewrite without a bundle backup.
- Never apply rewritten history to `main` until `range-diff`, tree identity, and commit count checks pass.
- Never force-push without explicit user approval. This skill does not automate force-push.
- Ignore untracked files unless the user asks about them. Refuse `main` reset when tracked worktree changes exist.

## Quick Commands

Check recent commits:

```powershell
.\.agents\skills\notedrop-commit-edit\scripts\Test-CommitMessageConvention.ps1 -Last 3
```

Check local-only commits:

```powershell
.\.agents\skills\notedrop-commit-edit\scripts\Test-CommitMessageConvention.ps1 -Range origin/main..HEAD
```

Rewrite local-only messages from a replacement map and apply to `main`:

```powershell
.\.agents\skills\notedrop-commit-edit\scripts\Invoke-LocalCommitMessageRewrite.ps1 `
  -ReplacementFile C:\tmp\commit-message-map.txt `
  -ApplyToMain
```

Replacement map format:

```text
old subject==>new subject
```

Example:

```powershell
$chore = [char]::ConvertFromUtf32(0x1F527)
"chore: update agent sync==>$chore chore(agents): agent 동기화 갱신" |
  Set-Content -Encoding UTF8 C:\tmp\commit-message-map.txt
```

## Script Responsibilities

`Test-CommitMessageConvention.ps1` checks subject format, type/gitmoji pairing, forbidden characters, and Korean subject presence. The scripts intentionally avoid non-ASCII source literals so they run under Windows PowerShell 5.1.

`Invoke-LocalCommitMessageRewrite.ps1` creates a bundle backup, clones an isolated workdir, rejects replacement matches outside the target commits, runs `git filter-repo --replace-message --refs HEAD`, prints `range-diff` for review, verifies identical tree hashes, verifies commit count, verifies the base ref remains an ancestor when available, and applies to `main` only when `-ApplyToMain` is present.

## Manual Stops

Stop and report instead of continuing automatically when:

- Any target commit is already contained in a remote branch.
- The user asks to change commit contents, not just messages.
- `git filter-repo` is missing.
- `range-diff`, tree identity, or commit count validation fails.
- The replacement map can match more commits than intended.
- The rewrite touches a release commit, tag recovery, or GitHub Actions release workflow.

## Common Mistakes

- Do not use interactive rebase.
- Do not run message rewrite directly in the working repo when an isolated clone is enough.
- Do not treat a passing format check as proof that the chosen type/scope is semantically right.
- Do not push after rewrite unless the user explicitly asks for push.
