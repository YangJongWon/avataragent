# Tray icon for a running AvatarCast Office: open, restart, update and stop live in its menu, so the desktop only needs
# the one start shortcut. Started by office.ps1 / launcher.ps1 after the server is up; one icon per user session.
# -Script is the controller to call (office.ps1 from a source install, launcher.ps1 from the installer).
# -Upgrade is that controller's in-place update command; without one, "Update" opens the Releases page instead.
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [int]$Port = 8787,
  [string]$Icon = '',
  [string]$Upgrade = ''
)

$ErrorActionPreference = 'Stop'
$AppName = 'AvatarCast Office'
$ReleasesUrl = 'https://github.com/YangJongWon/avataragent/releases/latest'

$mutex = New-Object Threading.Mutex($false, 'Local\AvatarCastOfficeTray')
if (-not $mutex.WaitOne(0)) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$Texts = @{
  ko = @{ Open = '사무실 열기'; Restart = '다시 시작'; Update = '업데이트'; Stop = '서버 끄기'; Running = '실행 중'; Stopped = '꺼짐'; StopAsk = '서버를 끌까요? 진행 중인 업무는 다음에 켤 때 이어서 해요.' }
  en = @{ Open = 'Open office'; Restart = 'Restart'; Update = 'Update'; Stop = 'Stop server'; Running = 'running'; Stopped = 'stopped'; StopAsk = 'Stop the server? Tasks in progress resume the next time you start it.' }
  ja = @{ Open = 'オフィスを開く'; Restart = '再起動'; Update = 'アップデート'; Stop = 'サーバーを停止'; Running = '実行中'; Stopped = '停止中'; StopAsk = 'サーバーを停止しますか？進行中のタスクは次に起動したときに再開します。' }
  zh = @{ Open = '打开办公室'; Restart = '重新启动'; Update = '更新'; Stop = '停止服务器'; Running = '运行中'; Stopped = '已停止'; StopAsk = '要停止服务器吗？进行中的任务会在下次启动时继续。' }
}
$lang = [Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName
$T = if ($Texts.ContainsKey($lang)) { $Texts[$lang] } else { $Texts.en }

$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Invoke-Controller($command, [switch]$Visible, [switch]$Wait) {
  $style = if ($Visible) { '' } else { '-WindowStyle Hidden ' }
  $argLine = "-NoProfile -ExecutionPolicy Bypass $style-File `"$Script`" $command"
  $window = if ($Visible) { 'Normal' } else { 'Hidden' }
  Start-Process -FilePath $PowerShell -ArgumentList $argLine -WindowStyle $window -Wait:$Wait
}

function Test-Running {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = if ($Icon -and (Test-Path $Icon)) { New-Object Drawing.Icon $Icon } else { [Drawing.Icon]::ExtractAssociatedIcon($PowerShell) }
$tray.Text = "$AppName ($($T.Running))"
$tray.Visible = $true

$menu = New-Object Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add($T.Open)
$open.Font = New-Object Drawing.Font($open.Font, [Drawing.FontStyle]::Bold)
$restart = $menu.Items.Add($T.Restart)
$update = $menu.Items.Add($T.Update)
$null = $menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
$stop = $menu.Items.Add($T.Stop)
$tray.ContextMenuStrip = $menu

function Close-Tray {
  $tray.Visible = $false
  $tray.Dispose()
  [Windows.Forms.Application]::Exit()
}

$open.add_Click({ Invoke-Controller 'open' })
$tray.add_DoubleClick({ Invoke-Controller 'open' })
$restart.add_Click({
  Invoke-Controller 'stop' -Wait
  Invoke-Controller 'start'
})
$update.add_Click({
  if ($Upgrade) { Invoke-Controller $Upgrade -Visible } else { Start-Process $ReleasesUrl }
})
$stop.add_Click({
  $answer = [Windows.Forms.MessageBox]::Show($T.StopAsk, $AppName, 'OKCancel', 'Question')
  if ($answer -ne 'OK') { return }
  Invoke-Controller 'stop' -Wait
  Close-Tray
})

# Restarts and updates take the server down for a while, so the icon only leaves after it has stayed down for 2 minutes
# (stopped from a terminal, or crashed). Until then it shows the state and "Open office" starts it again.
$script:downSince = $null
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  if (Test-Running) {
    $script:downSince = $null
    $tray.Text = "$AppName ($($T.Running))"
    return
  }
  $tray.Text = "$AppName ($($T.Stopped))"
  if (-not $script:downSince) { $script:downSince = Get-Date }
  elseif (((Get-Date) - $script:downSince).TotalSeconds -ge 120) { Close-Tray }
})
$timer.Start()

try { [Windows.Forms.Application]::Run() }
finally {
  $timer.Dispose()
  $mutex.ReleaseMutex()
}
