# Bootstrap for a fresh PC, run from PowerShell:
#   irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
# Downloads the app into %USERPROFILE%\avataragent (no git needed) and runs the installer.
# Kept ASCII-only without a BOM: `iex` fails on a leading BOM, and Windows PowerShell reads BOM-less files as ANSI.
& {
  $ErrorActionPreference = 'Stop'
  $dest = Join-Path $HOME 'avataragent'
  $zipUrl = 'https://github.com/YangJongWon/avataragent/archive/refs/heads/main.zip'

  if (Test-Path (Join-Path $dest 'package.json')) {
    Write-Host "Already downloaded to $dest. Checking the installation again..."
  } else {
    Write-Host "Downloading AI Agent Office to $dest ..."
    $temp = Join-Path $env:TEMP "avataragent-get-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $zip = Join-Path $temp 'main.zip'
      Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
      Expand-Archive -Path $zip -DestinationPath $temp -Force
      $source = Get-ChildItem $temp -Directory | Select-Object -First 1
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Copy-Item -Path (Join-Path $source.FullName '*') -Destination $dest -Recurse -Force
    } finally {
      Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
    }
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'scripts\install.ps1')
}
