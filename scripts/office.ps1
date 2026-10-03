param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'update', 'status', 'public-on', 'public-off', 'qr')]
  [string]$Command = 'status'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 8787
$PublicPort = 8443
$LogDir = Join-Path $Root 'logs'
$Tailscale = 'C:\Program Files\Tailscale\tailscale.exe'

function Get-ServerPid {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Start-Office {
  if (Get-ServerPid) { Write-Host "이미 실행 중이에요 (포트 $Port)."; return }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  # Win32_Process.Create detaches the server from this terminal, so it keeps running after the window closes.
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = 'cmd.exe /c npm start > logs\server.log 2> logs\server.err.log'
    CurrentDirectory = $Root
    ProcessStartupInformation = $startup
  }
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-ServerPid) { Write-Host "서버를 켰어요: http://localhost:$Port"; return }
  }
  Write-Host "서버가 15초 안에 뜨지 않았어요. logs\server.err.log 를 확인해 주세요."
}

function Stop-Office {
  $serverPid = Get-ServerPid
  if (-not $serverPid) { Write-Host '실행 중인 서버가 없어요.'; return }
  Stop-Process -Id $serverPid -Force
  Write-Host "서버를 껐어요 (PID $serverPid)."
}

function Show-Status {
  $serverPid = Get-ServerPid
  if ($serverPid) { Write-Host "서버: 실행 중 (PID $serverPid, http://localhost:$Port)" } else { Write-Host '서버: 꺼짐' }
  if (Test-Path $Tailscale) {
    $ip = (& $Tailscale ip -4 2>$null | Select-Object -First 1)
    if ($ip) { Write-Host "Tailscale 주소: http://${ip}:$Port" }
    $funnel = (& $Tailscale funnel status 2>$null) -join "`n"
    if ($funnel -match ":$PublicPort") { Write-Host "외부 공개: 켜짐 ($((Get-PublicUrl)))" } else { Write-Host '외부 공개: 꺼짐' }
  }
}

function Get-PublicUrl {
  $dns = ((& $Tailscale status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
  return "https://${dns}:$PublicPort"
}

switch ($Command) {
  'start' { Start-Office }
  'stop' { Stop-Office }
  'restart' { Stop-Office; Start-Sleep -Seconds 1; Start-Office }
  'update' {
    Push-Location $Root
    try {
      npm install
      npm run build
    } finally { Pop-Location }
    Stop-Office; Start-Sleep -Seconds 1; Start-Office
  }
  'status' { Show-Status }
  'public-on' {
    & $Tailscale funnel --bg --https=$PublicPort "http://127.0.0.1:$Port"
    Write-Host "외부 주소: $(Get-PublicUrl)"
  }
  'public-off' {
    & $Tailscale funnel --https=$PublicPort off
    Write-Host '외부 공개를 껐어요.'
  }
  'qr' {
    $url = Get-PublicUrl
    $out = Join-Path $env:TEMP 'avataragent-qr-public.png'
    Push-Location $Root
    try { npx --yes qrcode -w 360 -o $out $url | Out-Null } finally { Pop-Location }
    Write-Host "QR 저장: $out ($url)"
    Start-Process $out
  }
}
