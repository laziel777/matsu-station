param(
  [int]$FrontendPort = 3000,
  [int]$RangerPort = 4321
)

$ErrorActionPreference = "Stop"

function Test-PortOpen {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return [bool]$connection
}

function Wait-HttpOk {
  param(
    [string]$Uri,
    [int]$Seconds = 20
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 700
    }
  }

  return $false
}

function Start-LoggedProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$PidPath,
    [string]$OutPath,
    [string]$ErrPath
  )

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutPath `
    -RedirectStandardError $ErrPath `
    -PassThru

  Set-Content -LiteralPath $PidPath -Value $process.Id -Encoding ASCII
  Write-Host "$Name started. PID: $($process.Id)"
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDir = Join-Path $ProjectRoot ".local-runtime"
$LogDir = Join-Path $ProjectRoot ".local-logs"
$TsxCli = Join-Path $ProjectRoot "node_modules\tsx\dist\cli.mjs"
$ViteCli = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js first."
}

if (-not (Test-Path $TsxCli)) {
  throw "tsx was not found. Run npm install in $ProjectRoot first."
}

if (-not (Test-Path $ViteCli)) {
  throw "vite was not found. Run npm install in $ProjectRoot first."
}

$env:PORT = "$FrontendPort"
$env:RANGER_LAB_PORT = "$RangerPort"

$FrontendLog = Join-Path $LogDir "frontend.out.log"
$FrontendErr = Join-Path $LogDir "frontend.err.log"
$RangerLog = Join-Path $LogDir "ranger-lab.out.log"
$RangerErr = Join-Path $LogDir "ranger-lab.err.log"

Write-Host "External SSD project: $ProjectRoot"

if (Test-PortOpen $FrontendPort) {
  Write-Host "Port $FrontendPort is already in use. Skipping frontend start."
} else {
  Start-LoggedProcess `
    -Name "Matsu Station local frontend" `
    -FilePath "node.exe" `
    -Arguments @($TsxCli, "dev-server.ts") `
    -PidPath (Join-Path $RuntimeDir "frontend.pid") `
    -OutPath $FrontendLog `
    -ErrPath $FrontendErr
}

if (Test-PortOpen $RangerPort) {
  Write-Host "Port $RangerPort is already in use. Skipping ranger lab start."
} else {
  Start-LoggedProcess `
    -Name "AI Ranger local dashboard" `
    -FilePath "node.exe" `
    -Arguments @($ViteCli, "--config", "ranger-lab/vite.config.ts", "--host=127.0.0.1", "--port=$RangerPort", "--strictPort") `
    -PidPath (Join-Path $RuntimeDir "ranger-lab.pid") `
    -OutPath $RangerLog `
    -ErrPath $RangerErr
}

$siteUrl = "http://127.0.0.1:$FrontendPort"
$healthUrl = "$siteUrl/api/local-health"
$rangerUrl = "http://127.0.0.1:$RangerPort"
$siteCheckUrl = "http://127.0.0.1:$FrontendPort"
$healthCheckUrl = "$siteCheckUrl/api/local-health"
$rangerCheckUrl = "http://127.0.0.1:$RangerPort"

Write-Host ""
Write-Host "Waiting for services..."
$siteReady = Wait-HttpOk -Uri $siteCheckUrl -Seconds 25
$healthReady = Wait-HttpOk -Uri $healthCheckUrl -Seconds 10
$rangerReady = Wait-HttpOk -Uri $rangerCheckUrl -Seconds 25

Write-Host ""
Write-Host "Local frontend: $siteUrl"
Write-Host "AI Ranger dashboard: $rangerUrl"
Write-Host "Local health: $healthUrl"
Write-Host ""
Write-Host "Frontend: $(if ($siteReady) { 'ready' } else { 'not ready; check logs' })"
Write-Host "Health: $(if ($healthReady) { 'ready' } else { 'not ready; if port 3000 is occupied by an old server, stop it first' })"
Write-Host "Dashboard: $(if ($rangerReady) { 'ready' } else { 'not ready; check logs' })"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $FrontendLog"
Write-Host "  $FrontendErr"
Write-Host "  $RangerLog"
Write-Host "  $RangerErr"
