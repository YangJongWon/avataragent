; One-click Windows installer for AvatarCast. Built by installer/build.ps1, which prepares the files in
; build/installer/app (the server, the built pages, production packages and a private Node.js).
; Installs for the current user only (no administrator), keeps settings and data in %APPDATA%\AvatarCast.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\build\installer\app"
#endif
#ifndef OutputDir
  #define OutputDir "..\build\installer"
#endif

#define AppName "AvatarCast"
#define Launcher "{app}\launcher.ps1"
#define PowerShell "{sys}\WindowsPowerShell\v1.0\powershell.exe"
; Quotes inside a quoted Inno parameter are doubled, so the path comes out as ""{app}\launcher.ps1"".
#define Run(cmd) "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """"" + Launcher + """"" " + cmd

[Setup]
AppId={{7F3C2A61-5B8E-4C1D-9A47-2E6D0B9C8F14}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=YangJongWon
AppPublisherURL=https://github.com/YangJongWon/avataragent
AppSupportURL=https://github.com/YangJongWon/avataragent/issues
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=AvatarCast-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
UninstallDisplayIcon={sys}\shell32.dll,13
LicenseFile={#SourceDir}\LICENSE
CloseApplications=no

[Languages]
Name: "ko"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ko.DesktopIcon=바탕화면에 바로가기 만들기
en.DesktopIcon=Create a desktop shortcut
ko.StopName={#AppName} 끄기
en.StopName=Stop {#AppName}
ko.OpenNow={#AppName} 지금 열기
en.OpenNow=Open {#AppName} now
ko.Tailscale=휴대폰·외부에서 쓰기: Tailscale 설치하고 로그인 (가입·로그인은 직접)
en.Tailscale=Use from a phone or outside: install Tailscale and sign in (you sign up yourself)
ko.DeleteData=설정과 데이터(업무 기록, 테마, API 키)도 지울까요?%n%n{userappdata}\{#AppName}%n%n아니요를 누르면 남겨 두고, 다시 설치하면 그대로 이어서 써요.
en.DeleteData=Also delete your settings and data (task history, themes, API keys)?%n%n{userappdata}\{#AppName}%n%nChoose No to keep them for a later install.

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; An update replaces the program completely; settings and data are elsewhere.
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\shared"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\node_modules"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{#PowerShell}"; Parameters: "{#Run('open')}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13
Name: "{autoprograms}\{cm:StopName}"; Filename: "{#PowerShell}"; Parameters: "{#Run('stop')}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 27
Name: "{autodesktop}\{#AppName}"; Filename: "{#PowerShell}"; Parameters: "{#Run('open')}"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 13; Tasks: desktopicon

[Run]
Filename: "{#PowerShell}"; Parameters: "{#Run('open')}"; WorkingDir: "{app}"; Description: "{cm:OpenNow}"; Flags: postinstall nowait skipifsilent runhidden
Filename: "{#PowerShell}"; Parameters: "{#Run('tailscale')}"; WorkingDir: "{app}"; Description: "{cm:Tailscale}"; Flags: postinstall unchecked skipifsilent runhidden

[UninstallRun]
Filename: "{#PowerShell}"; Parameters: "{#Run('stop')}"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "StopServer"

[Code]
// A running server holds node.exe open; stop it before files are replaced.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
  Launcher: String;
begin
  Result := '';
  Launcher := ExpandConstant('{app}\launcher.ps1');
  if FileExists(Launcher) then
    Exec(ExpandConstant('{#PowerShell}'), '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + Launcher + '" stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Home: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    Home := ExpandConstant('{userappdata}\{#AppName}');
    if DirExists(Home) and not UninstallSilent() then
      if MsgBox(ExpandConstant('{cm:DeleteData}'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(Home, True, True, True);
  end;
end;
