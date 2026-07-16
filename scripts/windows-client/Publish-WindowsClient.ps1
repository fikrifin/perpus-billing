param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [bool]$SelfContained = $true,
    [string]$Output = "dist/windows-client",
    [string]$ServerUrl = "http://192.168.1.10:3478",
    [string]$ComputerCode = "PC-01",
    [string]$AdminExitCode = "perpus-admin",
    [bool]$AutoStartOnLogin = $true
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$projectPath = Join-Path $repoRoot "apps/windows-client/PerpusBilling.WindowsClient.csproj"
$outputPath = Join-Path $repoRoot $Output

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "dotnet CLI tidak ditemukan. Install .NET SDK 8.x dulu."
}

Write-Host "Publishing Windows client..." -ForegroundColor Cyan
Write-Host "Project      : $projectPath"
Write-Host "Output       : $outputPath"
Write-Host "Runtime      : $Runtime"
Write-Host "SelfContained: $SelfContained"

$publishArgs = @(
    "publish",
    $projectPath,
    "-c", $Configuration,
    "-r", $Runtime,
    "--self-contained", $SelfContained.ToString().ToLowerInvariant(),
    "-o", $outputPath
)

& dotnet @publishArgs

$config = [ordered]@{
    serverUrl = $ServerUrl
    computerCode = $ComputerCode
    clientVersion = "windows-client-0.1.0"
    heartbeatFallbackSeconds = 5
    autoStartOnLogin = $AutoStartOnLogin
    adminExitCode = $AdminExitCode
}

$configPath = Join-Path $outputPath "appsettings.json"
$config | ConvertTo-Json -Depth 4 | Set-Content -Path $configPath -Encoding UTF8

$installScript = Join-Path $PSScriptRoot "Install-WindowsClient.ps1"
if (Test-Path $installScript) {
    Copy-Item -Path $installScript -Destination (Join-Path $outputPath "Install-WindowsClient.ps1") -Force
}

Write-Host "`nPublish selesai." -ForegroundColor Green
Write-Host "Config ditulis: $configPath"
Write-Host "Copy folder ini ke PC client, contoh: C:\PerpusBilling\Client"
