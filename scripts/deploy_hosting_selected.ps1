[CmdletBinding()]
param(
    [string[]]$Files = @('resources-used.html'),
    [string]$Project = '',
    [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

function Get-DefaultFirebaseProject {
    param([string]$RepoRoot)

    $firebaserc = Join-Path $RepoRoot '.firebaserc'
    if (-not (Test-Path $firebaserc)) {
        return ''
    }

    try {
        $raw = Get-Content $firebaserc -Raw -Encoding UTF8 | ConvertFrom-Json
        return [string]($raw.projects.default)
    }
    catch {
        return ''
    }
}

function Assert-RelativePath {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        throw 'File paths cannot be empty.'
    }

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        throw "Use repo-relative paths only: $PathValue"
    }

    if ($PathValue.Contains('..')) {
        throw "Parent directory traversal is not allowed: $PathValue"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$gitRoot = (& git -C $repoRoot rev-parse --show-toplevel).Trim()
if (-not $gitRoot) {
    throw 'Could not resolve git repo root.'
}

if (-not (Test-Path (Join-Path $gitRoot 'firebase.json'))) {
    throw 'firebase.json was not found at the repo root.'
}

if ([string]::IsNullOrWhiteSpace($Project)) {
    $Project = Get-DefaultFirebaseProject -RepoRoot $gitRoot
}
if ([string]::IsNullOrWhiteSpace($Project)) {
    $Project = 'myquranquest786'
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mqquest-hosting-" + [System.Guid]::NewGuid().ToString('N'))
Write-Host "[deploy] Creating clean temp repo at $tempDir"
& git -C $gitRoot clone --quiet . $tempDir
if ($LASTEXITCODE -ne 0) {
    throw 'git clone failed.'
}

try {
    foreach ($file in $Files) {
        Assert-RelativePath -PathValue $file

        $src = Join-Path $gitRoot $file
        if (-not (Test-Path $src)) {
            throw "Source file not found: $file"
        }

        $dest = Join-Path $tempDir $file
        $destDir = Split-Path -Parent $dest
        if ($destDir -and -not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        Copy-Item -Path $src -Destination $dest -Force
        Write-Host "[deploy] Included $file"
    }

    Write-Host "[deploy] Deploying Hosting for project $Project"
    Push-Location $tempDir
    try {
        & firebase deploy --only hosting --project $Project
        if ($LASTEXITCODE -ne 0) {
            throw 'Firebase deploy failed.'
        }
    }
    finally {
        Pop-Location
    }

    Write-Host '[deploy] Hosting deploy finished.'
    if ($KeepTemp) {
        Write-Host "[deploy] Temp repo kept at: $tempDir"
    }
}
finally {
    if ((Test-Path $tempDir) -and -not $KeepTemp) {
        Remove-Item -Path $tempDir -Recurse -Force
    }
}
