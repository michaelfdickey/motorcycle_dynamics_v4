<#
.SYNOPSIS
  Grok worktree -> D:\repositories\motorcycle_dynamics_v4 -> GitHub

.DESCRIPTION
  Copies source from this worktree into the local clone, keeps the newest
  vehicles/*.json (by savedAt, then file time), commits, and pushes origin/main.

.EXAMPLE
  .\publish-from-grok.ps1
  .\publish-from-grok.ps1 -Message "trace more of the mule frame"
  .\publish-from-grok.ps1 -DryRun
#>
[CmdletBinding()]
param(
	[string]$LocalRepo = "D:\repositories\motorcycle_dynamics_v4",
	[string]$Worktree = "",
	[string]$Message = "Sync from Grok worktree",
	[switch]$DryRun,
	[switch]$NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-Worktree {
	if ($Worktree) { return (Resolve-Path $Worktree).Path }
	if ($env:GROK_WORKTREE) { return (Resolve-Path $env:GROK_WORKTREE).Path }
	$here = (Resolve-Path $PSScriptRoot).Path
	$local = [IO.Path]::GetFullPath($LocalRepo)
	if ($here -ne $local) { return $here }
	throw "Run this from the Grok worktree, or pass -Worktree / set GROK_WORKTREE."
}

function Get-JsonSavedAt([string]$path) {
	if (-not (Test-Path $path)) { return [datetime]::MinValue }
	try {
		$j = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
		if ($j.savedAt) { return [datetime]::Parse($j.savedAt).ToUniversalTime() }
	} catch { }
	return (Get-Item -LiteralPath $path).LastWriteTimeUtc
}

$src = Resolve-Worktree
$dst = [IO.Path]::GetFullPath($LocalRepo)
if (-not (Test-Path (Join-Path $dst ".git"))) {
	throw "Local repo not found or not a git repo: $dst"
}
if ($src -eq $dst) { throw "Worktree and local repo are the same path: $src" }

Write-Host "Worktree: $src"
Write-Host "Local:    $dst"

$jsonBackup = @{}
$vehiclesDst = Join-Path $dst "vehicles"
if (Test-Path $vehiclesDst) {
	Get-ChildItem -LiteralPath $vehiclesDst -Filter *.json -File | ForEach-Object {
		$jsonBackup[$_.Name] = @{
			t     = Get-JsonSavedAt $_.FullName
			bytes = [IO.File]::ReadAllBytes($_.FullName)
		}
	}
}

$xd = @("node_modules", ".venv", ".git", ".svelte-kit", "__pycache__", "playwright", "playwright-core")
$xf = @(".backend.pid", ".frontend.pid", "shop-photo-mule.jpg")
$roboArgs = @(
	$src, $dst, "/E", "/XD"
) + $xd + @("/XF") + $xf + @("/NFL", "/NDL", "/NJH", "/NJS", "/NP")
if ($DryRun) { $roboArgs += "/L" }

& robocopy @roboArgs | Out-Host
$roboCode = $LASTEXITCODE
# robocopy: 0-7 = copied/extra/mismatched (success), >=8 = fail
if ($roboCode -ge 8) { throw "robocopy failed with exit $roboCode" }

$vehiclesSrc = Join-Path $src "vehicles"
if (Test-Path $vehiclesSrc) {
	Get-ChildItem -LiteralPath $vehiclesSrc -Filter *.json -File | ForEach-Object {
		$name = $_.Name
		$tGrok = Get-JsonSavedAt $_.FullName
		$tLocal = if ($jsonBackup.ContainsKey($name)) { $jsonBackup[$name].t } else { [datetime]::MinValue }
		$out = Join-Path $vehiclesDst $name
		if ($jsonBackup.ContainsKey($name) -and $tLocal -gt $tGrok) {
			if (-not $DryRun) { [IO.File]::WriteAllBytes($out, $jsonBackup[$name].bytes) }
			Write-Host "JSON keep local  $name  savedAt=$tLocal"
		} else {
			Write-Host "JSON keep grok   $name  savedAt=$tGrok"
		}
	}
}

if ($DryRun) {
	Write-Host "Dry run: no commit or push."
	exit 0
}

Push-Location $dst
try {
	git add -A
	$porcelain = git status --porcelain
	if (-not $porcelain) {
		Write-Host "No file changes in local clone."
	} else {
		git status --short
		git commit -m $Message
		Write-Host "Committed in local clone."
	}
	if (-not $NoPush) {
		git push origin main
		Write-Host "Pushed to GitHub."
	}
} finally {
	Pop-Location
}

# Point the worktree git at the same commit as GitHub so the two copies do not diverge.
git -C $src fetch origin
$trackedDirty = git -C $src status --porcelain --untracked-files=no
if ($trackedDirty) {
	# Published copy is source of truth for tracked files after a successful push.
	git -C $src checkout -- .
}
# Untracked files that already exist on origin/main would block the pull.
$untracked = git -C $src ls-files --others --exclude-standard
foreach ($f in $untracked) {
	git -C $src cat-file -e "origin/main:$f" 2>$null
	if ($LASTEXITCODE -eq 0) {
		Remove-Item -LiteralPath (Join-Path $src $f) -Force
		Write-Host "Removed untracked $f (already on origin/main)"
	}
}
git -C $src pull --ff-only origin main
Write-Host "Worktree fast-forwarded to origin/main."
Write-Host "Done: Grok worktree -> $dst -> GitHub"
