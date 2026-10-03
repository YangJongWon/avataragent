param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'update', 'upgrade', 'open', 'status', 'public-on', 'public-off', 'qr')]
  [string]$Command = 'status'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 8787
$EnvFile = Join-Path $Root '.env'
if (Test-Path $EnvFile) {
  $line = Select-String -Path $EnvFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($line) { $Port = [int]$line.Matches[0].Groups[1].Value }
}
$PublicPort = 8443
$LogDir = Join-Path $Root 'logs'
$Tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
$ZipUrl = 'https://github.com/YangJongWon/avataragent/archive/refs/heads/main.zip'

function Show-Popup($text, $icon = 64) {
  $null = (New-Object -ComObject WScript.Shell).Popup($text, 0, 'AI 에이전트 오피스', $icon)
}

function Get-ServerPid {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Start-Office {
  $existing = Get-ServerPid
  if ($existing) {
    if ((Get-Process -Id $existing -ErrorAction SilentlyContinue).ProcessName -ne 'node') {
      Write-Host "포트 $Port 을(를) 다른 프로그램이 쓰고 있어요. .env 파일의 PORT를 다른 숫자(예: 8788)로 바꿔 주세요."
      return $false
    }
    Write-Host "이미 실행 중이에요 (포트 $Port)."
    return $true
  }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { Write-Host 'Node.js를 찾지 못했어요. 설치.cmd를 먼저 실행해 주세요.'; return $false }
  # Win32_Process.Create detaches the server from this terminal, so it keeps running after the window closes.
  # It may see a PATH from before Node.js was installed, so node is called by its full path (same as `npm start`).
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "cmd.exe /c `"`"$($node.Source)`" node_modules\tsx\dist\cli.mjs server\index.ts > logs\server.log 2> logs\server.err.log`""
    CurrentDirectory = $Root
    ProcessStartupInformation = $startup
  }
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-ServerPid) { Write-Host "서버를 켰어요: http://localhost:$Port"; return $true }
  }
  Write-Host "서버가 20초 안에 뜨지 않았어요. logs\server.err.log 를 확인해 주세요."
  return $false
}

function Open-Office {
  if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Show-Popup '아직 설치가 끝나지 않았어요. 프로그램 폴더의 설치.cmd를 먼저 실행해 주세요.' 48
    return
  }
  if (Start-Office) { Start-Process "http://localhost:$Port" }
  else { Show-Popup "서버를 켜지 못했어요.`n포트 $Port 을(를) 다른 프로그램이 쓰고 있다면 .env 파일의 PORT를 바꿔 주세요.`n그 밖에는 $Root\logs\server.err.log 파일 내용을 확인해 주세요." 16 }
}

function Update-Office {
  # Under `npm run office`, the outer npm passes its settings as npm_config_* variables, and the nested
  # `npm install` treats them as command-line flags (e.g. --allow-scripts, which project installs reject).
  # Names are case-insensitive on Windows and npm may pass one in two casings, so removal must tolerate a missing name.
  foreach ($name in @(Get-ChildItem Env: | Where-Object { $_.Name -like 'npm_config_*' } | ForEach-Object { $_.Name })) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  Push-Location $Root
  try {
    & npm.cmd install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw '부품을 내려받지 못했어요.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '화면을 만들지 못했어요.' }
  } finally { Pop-Location }
  Stop-Office; Start-Sleep -Seconds 1; $null = Start-Office
}

# Fetches the newest code: git pull for clones, otherwise the GitHub zip copied over this folder.
# .env, data, logs and node_modules are never touched.
function Get-LatestCode {
  if (Test-Path (Join-Path $Root '.git')) {
    Push-Location $Root
    try {
      if (git status --porcelain --untracked-files=no) { throw '이 폴더에 고친 파일이 있어서 자동으로 받지 않았어요. git으로 직접 정리해 주세요.' }
      git pull --ff-only
      if ($LASTEXITCODE -ne 0) { throw '새 버전을 받지 못했어요 (git pull).' }
    } finally { Pop-Location }
    return
  }
  $temp = Join-Path $env:TEMP "avataragent-upgrade-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  New-Item -ItemType Directory -Force -Path $temp | Out-Null
  try {
    $zip = Join-Path $temp 'main.zip'
    Write-Host '새 버전을 내려받고 있어요…'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $temp -Force
    $source = Get-ChildItem $temp -Directory | Select-Object -First 1
    robocopy $source.FullName $Root /E /NFL /NDL /NJH /NJS /NP /XD data logs node_modules dist .git /XF .env | Out-Null
    if ($LASTEXITCODE -ge 8) { throw '새 파일을 복사하지 못했어요.' }
  } finally {
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
  }
}

# The listener is the child of tsx (and of npm/cmd when started that way); killing only it leaves those running.
function Get-LauncherRoot($procId) {
  $top = $procId
  for ($i = 0; $i -lt 6; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$top"
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
    if (-not $parent -or $parent.Name -notin @('node.exe', 'cmd.exe') -or $parent.CommandLine -notmatch 'tsx|server[\\/]index|npm|server\.log') { break }
    $top = $parent.ProcessId
  }
  return $top
}

function Stop-Office {
  $serverPid = Get-ServerPid
  if (-not $serverPid) { Write-Host '실행 중인 서버가 없어요.'; return }
  $root = Get-LauncherRoot $serverPid
  & taskkill.exe /PID $root /T /F | Out-Null
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
  'start' { $null = Start-Office }
  'stop' { Stop-Office }
  'restart' { Stop-Office; Start-Sleep -Seconds 1; $null = Start-Office }
  'update' {
    try { Update-Office }
    catch { Write-Host "갱신하지 못했어요: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
  }
  'open' { Open-Office }
  'upgrade' {
    try {
      Get-LatestCode
      Update-Office
      Write-Host '업데이트를 마쳤어요.' -ForegroundColor Green
      Start-Process "http://localhost:$Port"
    } catch {
      Write-Host "업데이트하지 못했어요: $($_.Exception.Message)" -ForegroundColor Red
    }
    Read-Host '창을 닫으려면 Enter를 누르세요'
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
