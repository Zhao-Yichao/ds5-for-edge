$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousNpmCache = $env:npm_config_cache
Push-Location (Join-Path $projectRoot 'src/extension')
try {
  $env:npm_config_cache = Join-Path $projectRoot 'artifacts/temp/npm-cache'
  if (-not (Test-Path -LiteralPath 'node_modules/wxt')) {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  }
  foreach ($task in @('prepare', 'check', 'test', 'build')) {
    & npm.cmd run $task
    if ($LASTEXITCODE -ne 0) { throw "$task failed." }
  }
  $releaseDir = Join-Path $projectRoot 'artifacts/releases'
  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  $packageVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
  $zipPath = Join-Path $releaseDir "ds5-for-edge-demo-$packageVersion.zip"
  Compress-Archive -Path (Join-Path $projectRoot 'artifacts/build/extension/edge-mv3/*') -DestinationPath $zipPath -Force
  Write-Output "Demo package: $zipPath"
} finally { $env:npm_config_cache = $previousNpmCache; Pop-Location }
