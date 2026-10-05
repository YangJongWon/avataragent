# Starts, stops and opens the installed AI Agent Office. The program lives in this folder (with its own Node.js);
# settings, data and logs live in %APPDATA%\AI Agent Office so updates and uninstalls never touch them.
param(
  [Parameter(Position = 0)]
  [ValidateSet('open', 'start', 'stop', 'status', 'tailscale')]
  [string]$Command = 'open'
)

$ErrorActionPreference = 'Stop'
$AppName = 'AI Agent Office'
$Root = $PSScriptRoot
$Node = Join-Path $Root 'node\node.exe'
$UserDir = Join-Path $env:APPDATA $AppName
$EnvFile = Join-Path $UserDir '.env'
$DataDir = Join-Path $UserDir 'data'
$LogDir = Join-Path $UserDir 'logs'
$Tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'

function Show-Popup($text, $icon = 64) {
  $null = (New-Object -ComObject WScript.Shell).Popup($text, 0, $AppName, $icon)
}

# First run: a settings file from the template, with no access password (this PC only until one is set).
function Initialize-Home {
  New-Item -ItemType Directory -Force -Path $UserDir, $DataDir, $LogDir | Out-Null
  if (-not (Test-Path $EnvFile)) {
    $template = Get-Content (Join-Path $Root '.env.example') -Raw -Encoding UTF8
    [IO.File]::WriteAllText($EnvFile, $template, (New-Object Text.UTF8Encoding $false))
  }
}

function Get-Port {
  $line = Select-String -Path $EnvFile -Pattern '^\s*PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) { return [int]$line.Matches[0].Groups[1].Value }
  return 8787
}

function Get-ServerPid($port) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Test-Ours($procId) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  return $proc -and $proc.ExecutablePath -eq $Node
}

function Start-Office {
  Initialize-Home
  $port = Get-Port
  $existing = Get-ServerPid $port
  if ($existing) {
    if (Test-Ours $existing) { return $port }
    throw "포트 $port 을(를) 다른 프로그램이 쓰고 있어요. $EnvFile 의 PORT를 다른 숫자(예: 8788)로 바꿔 주세요."
  }
  # Detached from this window so the server keeps running; settings and data come from the user's AppData.
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $command = "cmd.exe /c `"set `"ENV_FILE=$EnvFile`"&& set `"DATA_DIR=$DataDir`"&& `"$Node`" server\index.ts > `"$LogDir\server.log`" 2> `"$LogDir\server.err.log`"`""
  $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $command
    CurrentDirectory = $Root
    ProcessStartupInformation = $startup
  }
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-ServerPid $port) { return $port }
  }
  throw "서버가 30초 안에 켜지지 않았어요. $LogDir\server.err.log 를 확인해 주세요."
}

function Stop-Office {
  $port = Get-Port
  $serverPid = Get-ServerPid $port
  if ($serverPid -and (Test-Ours $serverPid)) {
    # The listener runs under cmd.exe; ending the tree ends both.
    $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid").ParentProcessId
    & taskkill.exe /PID $serverPid /T /F | Out-Null
    if ($parent) { & taskkill.exe /PID $parent /T /F 2>$null | Out-Null }
    return $true
  }
  return $false
}

# Optional remote access: Tailscale's own installer (it asks for permission), then its sign-in.
function Install-Tailscale {
  if (-not (Test-Path $Tailscale)) {
    $setup = Join-Path $env:TEMP 'tailscale-setup-latest.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe' -OutFile $setup -UseBasicParsing
    Start-Process -FilePath $setup -Wait
  }
  if (-not (Test-Path $Tailscale)) { throw 'Tailscale 설치가 끝나지 않았어요. 나중에 https://tailscale.com/download 에서 설치할 수 있어요.' }
  $state = (& $Tailscale status --json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue).BackendState
  if ($state -ne 'Running') {
    Show-Popup "Tailscale에 로그인(처음이면 가입)해 주세요.`n로그인하면 같은 Tailscale 계정의 휴대폰에서 이 PC의 사무실을 열 수 있어요." 64
    $gui = Join-Path $env:ProgramFiles 'Tailscale\tailscale-ipn.exe'
    if (Test-Path $gui) { Start-Process $gui }
    & $Tailscale login 2>$null | Out-Null
  }
}

try {
  switch ($Command) {
    'open' {
      $port = Start-Office
      Start-Process "http://localhost:$port"
    }
    'start' { $null = Start-Office }
    'stop' { $null = Stop-Office }
    'status' {
      $port = Get-Port
      if (Get-ServerPid $port) { "running on http://localhost:$port" } else { 'stopped' }
    }
    'tailscale' { Install-Tailscale }
  }
} catch {
  if ($Command -in 'open', 'tailscale') { Show-Popup $_.Exception.Message 16 } else { Write-Error $_.Exception.Message }
  exit 1
}
