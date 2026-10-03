# One-step setup for people new to programming: Node.js, packages, .env, build, desktop shortcuts, first start.
param([switch]$NoShortcuts)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$MinNode = 24
$AppName = 'AI 에이전트 오피스'

function Step($n, $text) { Write-Host ''; Write-Host "[$n/6] $text" -ForegroundColor Cyan }
function Fail($text) {
  Write-Host ''
  Write-Host "설치를 마치지 못했어요: $text" -ForegroundColor Red
  Write-Host '이 창의 내용을 캡처해서 알려 주시면 도와드릴게요.'
  exit 1
}

function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { return 0 }
  $version = (& $node.Source -v) -replace '^v', ''
  return [int]($version.Split('.')[0])
}

Write-Host "=== $AppName 설치 ===" -ForegroundColor Yellow
Write-Host "설치 폴더: $Root"
Write-Host '처음 설치는 인터넷 속도에 따라 5~10분쯤 걸려요. 창을 닫지 말고 기다려 주세요.'

Step 1 'Node.js 확인'
if ((Get-NodeMajor) -lt $MinNode) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    Start-Process 'https://nodejs.org/ko/download'
    Fail "Node.js $MinNode 이상이 필요해요. 열린 웹페이지에서 'Windows 설치 프로그램(.msi)'을 받아 설치한 뒤, 설치.cmd를 다시 실행해 주세요."
  }
  Write-Host 'Node.js를 설치할게요. 권한 확인 창이 뜨면 [예]를 눌러 주세요.'
  foreach ($id in @('OpenJS.NodeJS.LTS', 'OpenJS.NodeJS')) {
    & $winget.Source install -e --id $id --accept-source-agreements --accept-package-agreements --silent
    Update-PathFromRegistry
    if ((Get-NodeMajor) -ge $MinNode) { break }
  }
  if ((Get-NodeMajor) -lt $MinNode) { Fail "Node.js $MinNode 이상을 설치하지 못했어요. https://nodejs.org 에서 직접 설치한 뒤 다시 실행해 주세요." }
}
Write-Host "Node.js $(node -v) 준비됨" -ForegroundColor Green

Push-Location $Root
try {
  Step 2 '필요한 부품 내려받기 (npm install)'
  & npm.cmd install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Fail '부품을 내려받지 못했어요. 인터넷 연결을 확인하고 다시 실행해 주세요.' }

  Step 3 '설정 파일 만들기 (.env)'
  $envFile = Join-Path $Root '.env'
  if (Test-Path $envFile) {
    Write-Host '이미 설정 파일이 있어서 그대로 둘게요.'
  } else {
    $content = Get-Content (Join-Path $Root '.env.example') -Raw -Encoding UTF8
    Write-Host '접속 비밀번호를 정해 주세요. 같은 와이파이의 다른 기기나 휴대폰에서 열 때 이 비밀번호를 물어봐요.'
    Write-Host '이 PC에서만 쓸 거라면 그냥 Enter를 눌러도 돼요. (나중에 .env 파일의 ACCESS_PASSWORD에서 바꿀 수 있어요)'
    $password = Read-Host '비밀번호'
    $content = $content -replace '(?m)^ACCESS_PASSWORD=.*$', "ACCESS_PASSWORD=$($password.Trim())"
    [IO.File]::WriteAllText($envFile, $content, (New-Object Text.UTF8Encoding $false))
    Write-Host '설정 파일을 만들었어요. 처음에는 API 키 없이 "시뮬레이션"으로 돌아가요.' -ForegroundColor Green
  }

  Step 4 '화면 만들기 (빌드)'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Fail '화면을 만들지 못했어요.' }
} finally {
  Pop-Location
}

Step 5 '바탕화면 바로가기 만들기'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$office = Join-Path $Root 'scripts\office.ps1'
$shortcuts = @(
  @{ Name = $AppName; Command = 'open'; Icon = 'shell32.dll,13'; Note = '서버를 켜고 브라우저로 열어요' },
  @{ Name = "$AppName 끄기"; Command = 'stop'; Icon = 'shell32.dll,27'; Note = '서버를 꺼요' },
  @{ Name = "$AppName 업데이트"; Command = 'upgrade'; Icon = 'shell32.dll,238'; Note = '새 버전을 받아 다시 켜요' }
)
foreach ($s in $(if ($NoShortcuts) { @() } else { $shortcuts })) {
  $link = $shell.CreateShortcut((Join-Path $desktop "$($s.Name).lnk"))
  $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $hidden = if ($s.Command -eq 'upgrade') { '' } else { '-WindowStyle Hidden ' }
  $link.Arguments = "-NoProfile -ExecutionPolicy Bypass $hidden-File `"$office`" $($s.Command)"
  $link.WorkingDirectory = $Root
  $link.IconLocation = Join-Path $env:SystemRoot "System32\$($s.Icon)"
  $link.Description = $s.Note
  $link.Save()
  Write-Host "바탕화면에 '$($s.Name)' 바로가기를 만들었어요."
}

Step 6 '처음 켜기'
Write-Host 'Windows 방화벽 창이 뜨면 [허용]을 눌러 주세요. (휴대폰 등 다른 기기에서 열 때 필요해요)'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $office open

Write-Host ''
Write-Host '설치가 끝났어요!' -ForegroundColor Green
Write-Host "- 다음부터는 바탕화면의 '$AppName' 아이콘을 더블클릭하면 돼요."
$portLine = Select-String -Path (Join-Path $Root '.env') -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
$port = if ($portLine) { $portLine.Matches[0].Groups[1].Value } else { '8787' }
Write-Host "- 주소: http://localhost:$port"
Write-Host "- 실제 AI를 쓰려면 화면 위쪽의 [모델 관리] 탭에서 API 키를 넣어 주세요."
