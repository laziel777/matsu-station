param(
  [int]$Port = 4321
)

$ErrorActionPreference = "Stop"

function Test-PortOpen {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return [bool]$connection
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ViteCli = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"
$Url = "http://127.0.0.1:$Port"

Set-Location $ProjectRoot

if (Test-PortOpen $Port) {
  Write-Host "AI Ranger dashboard is already running on $Url"
  Write-Host "Open this URL instead of starting another copy."
  exit 0
}

if (-not (Test-Path $ViteCli)) {
  throw "vite was not found. Run npm install in $ProjectRoot first."
}

Write-Host "Starting AI Ranger dashboard on $Url"
& node.exe $ViteCli --config ranger-lab/vite.config.ts --host=127.0.0.1 --port=$Port --strictPort
exit $LASTEXITCODE
