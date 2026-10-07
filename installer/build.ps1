# Builds the Windows installer: build/installer/AvatarCast-Setup-<version>.exe
#   powershell -NoProfile -ExecutionPolicy Bypass -File installer/build.ps1 [-Version 0.2.0] [-NodeVersion 24.19.0]
# Needs Inno Setup 6 (winget install JRSoftware.InnoSetup) and the repository's own npm packages installed.
param(
  [string]$Version = '',
  [string]$NodeVersion = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root 'build\installer'
$App = Join-Path $Out 'app'
$Cache = Join-Path $Root 'build\cache'

if (-not $Version) { $Version = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version }
if (-not $NodeVersion) { $NodeVersion = (node -v).TrimStart('v') }
$iscc = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 is needed: winget install JRSoftware.InnoSetup' }

function Step($text) { Write-Host "== $text" -ForegroundColor Cyan }

Push-Location $Root
try {
  Step "pages (npm run build)"
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }

  Step "staging $App"
  if (Test-Path $App) { Remove-Item -Recurse -Force $App }
  New-Item -ItemType Directory -Force -Path $App, $Cache, (Join-Path $App 'docs'), (Join-Path $App 'dist') | Out-Null
  foreach ($dir in 'server', 'shared') { Copy-Item -Recurse (Join-Path $Root $dir) (Join-Path $App $dir) }
  Copy-Item -Recurse (Join-Path $Root 'dist\web') (Join-Path $App 'dist\web')
  foreach ($file in 'package.json', 'package-lock.json', '.env.example', 'LICENSE', 'LICENSING.md', 'README.md', 'OPERATIONS.md') {
    Copy-Item (Join-Path $Root $file) (Join-Path $App $file)
  }
  Copy-Item (Join-Path $Root 'docs\HELP.md') (Join-Path $App 'docs\HELP.md')
  Copy-Item (Join-Path $PSScriptRoot 'launcher.ps1') (Join-Path $App 'launcher.ps1')
  Copy-Item (Join-Path $PSScriptRoot 'avatarcast.ico') (Join-Path $App 'avatarcast.ico')

  Step "server packages (npm install --omit=dev, versions from the lock file)"
  # The pages are already built into dist/web, the site is not part of the app, and Temporal loads only with
  # WORKFLOW_RUNTIME=temporal: the desktop install leaves those packages out (several hundred MB).
  $notForDesktop = @('pixi.js', 'react', 'react-dom', '@xyflow/react', 'dompurify', 'qrcode', '@electric-sql/pglite',
    '@temporalio/activity', '@temporalio/client', '@temporalio/common', '@temporalio/worker', '@temporalio/workflow')
  $pkgFile = Join-Path $App 'package.json'
  $pkg = Get-Content $pkgFile -Raw | ConvertFrom-Json
  foreach ($name in $notForDesktop) { $pkg.dependencies.PSObject.Properties.Remove($name) }
  $pkg.PSObject.Properties.Remove('devDependencies')
  $pkg.PSObject.Properties.Remove('scripts')
  [IO.File]::WriteAllText($pkgFile, ($pkg | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
  Push-Location $App
  try {
    # The outer npm (when run as an npm script) passes its settings down; a nested install must not inherit them.
    foreach ($name in @(Get-ChildItem Env: | Where-Object { $_.Name -like 'npm_config_*' } | ForEach-Object { $_.Name })) {
      [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    & npm.cmd install --omit=dev --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    Remove-Item (Join-Path $App 'package-lock.json') -ErrorAction SilentlyContinue
  } finally { Pop-Location }

  Step "Node.js $NodeVersion (win-x64)"
  $zipName = "node-v$NodeVersion-win-x64.zip"
  $zip = Join-Path $Cache $zipName
  if (-not (Test-Path $zip)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/$zipName" -OutFile $zip -UseBasicParsing
    # Check the download against the published checksums.
    $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($zipName) } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if (-not $expected -or $actual -ne $expected.ToLower()) { Remove-Item $zip; throw "Node.js download checksum mismatch ($actual vs $expected)" }
  }
  $unpacked = Join-Path $Cache "node-v$NodeVersion-win-x64"
  if (-not (Test-Path $unpacked)) { Expand-Archive -Path $zip -DestinationPath $Cache -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $App 'node') | Out-Null
  Copy-Item (Join-Path $unpacked 'node.exe') (Join-Path $App 'node\node.exe')
  Copy-Item (Join-Path $unpacked 'LICENSE') (Join-Path $App 'node\LICENSE')

  $size = (Get-ChildItem $App -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
  Write-Host ("staged {0:N0} MB" -f $size)

  Step "installer (Inno Setup)"
  & $iscc "/DAppVersion=$Version" "/DSourceDir=$App" "/DOutputDir=$Out" (Join-Path $PSScriptRoot 'AvatarCast.iss')
  if ($LASTEXITCODE -ne 0) { throw 'ISCC failed' }
  $exe = Join-Path $Out "AvatarCast-Setup-$Version.exe"
  Write-Host ("built {0} ({1:N0} MB)" -f $exe, ((Get-Item $exe).Length / 1MB)) -ForegroundColor Green
} finally {
  Pop-Location
}
