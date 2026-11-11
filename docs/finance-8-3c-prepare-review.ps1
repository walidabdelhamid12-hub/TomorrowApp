# Run from PowerShell; preserves the existing working tree and all untracked files.
# Review every command before running. This creates a separate worktree.
$ErrorActionPreference = 'Stop'
$project = 'D:\Mobile Apps\TomorrowApp'
$review = 'D:\Mobile Apps\TomorrowApp-8-3C-Review'
$branch = 'codex/finance-8-3c-opening-date-review'
$log = [System.Collections.Generic.List[string]]::new()
try {
  if (-not (Test-Path -LiteralPath $project -PathType Container)) {
    throw "Project directory not found: $project"
  }
  if (Test-Path -LiteralPath $review) {
    throw "Review directory already exists; nothing was overwritten: $review"
  }
  Push-Location -LiteralPath $project
  try {
    $log.Add("Current branch: $(git branch --show-current)")
    $log.Add("Current working tree status:")
    $log.Add((git status --short | Out-String))
    git fetch origin $branch 2>&1 | Out-String | ForEach-Object { $log.Add($_) }
    if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
    git worktree add --detach $review "origin/$branch" 2>&1 | Out-String | ForEach-Object { $log.Add($_) }
    if ($LASTEXITCODE -ne 0) { throw 'Worktree creation failed' }
  } finally { Pop-Location }
  Push-Location -LiteralPath $review
  try {
    $log.Add("Review HEAD: $(git rev-parse --short HEAD)")
    $log.Add("Review status:")
    $log.Add((git status --short | Out-String))
    $log.Add('Review worktree prepared. No npm install or device launch was performed.')
  } finally { Pop-Location }
} catch {
  $log.Add("ERROR: $($_.Exception.Message)")
}
$log -join [Environment]::NewLine | Set-Clipboard
$log -join [Environment]::NewLine
