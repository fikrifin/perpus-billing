param(
    [string]$InstallDir = "C:\PerpusBilling\Client",
    [string]$ServerUrl = "http://192.168.1.10:3478",
    [string]$ComputerCode = "PC-01",
    [string]$AdminExitCode = "perpus-admin",
    [bool]$AutoStartOnLogin = $true,
    [switch]$RegisterStartup,
    [switch]$LaunchAfterInstall
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeName = "PerpusBilling.WindowsClient.exe"
$sourceExe = Join-Path $sourceDir $exeName

if (-not (Test-Path $sourceExe)) {
    throw "File $exeName tidak ditemukan di folder script ini. Jalankan script ini dari folder hasil publish."
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

Write-Host "Copy client files..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $InstallDir -Recurse -Force

$config = [ordered]@{
    serverUrl = $ServerUrl
    computerCode = $ComputerCode
    clientVersion = "windows-client-0.1.0"
    heartbeatFallbackSeconds = 5
    autoStartOnLogin = $AutoStartOnLogin
    adminExitCode = $AdminExitCode
}

$configPath = Join-Path $InstallDir "appsettings.json"
$config | ConvertTo-Json -Depth 4 | Set-Content -Path $configPath -Encoding UTF8

$targetExe = Join-Path $InstallDir $exeName

if ($RegisterStartup) {
    $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    New-Item -Path $runKey -Force | Out-Null
    Set-ItemProperty -Path $runKey -Name "PerpusBillingWindowsClient" -Value "`"$targetExe`""
    Write-Host "Startup HKCU registered for current Windows user." -ForegroundColor Green
}

Write-Host "`nInstall selesai." -ForegroundColor Green
Write-Host "InstallDir : $InstallDir"
Write-Host "Config     : $configPath"
Write-Host "Executable : $targetExe"
Write-Host "Log folder : %LOCALAPPDATA%\PerpusBilling\WindowsClient\logs"

if ($LaunchAfterInstall) {
    Start-Process -FilePath $targetExe
}
