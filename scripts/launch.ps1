param([int]$PreferredPort = 5188, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$gameDirectory = Split-Path -Parent $PSScriptRoot
$gameNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$gameNodePath = if ($gameNodeCommand) { $gameNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $gameNodePath)) { throw 'Node.js is required. Install Node.js 20 or newer, then launch again.' }
$gamePort = $PreferredPort
$gameAlreadyRunning = $false
try {
  $existing = Invoke-WebRequest -Uri "http://127.0.0.1:$gamePort/" -TimeoutSec 2 -UseBasicParsing
  if ($existing.Content -match '<title>Sakura Walk') { $gameAlreadyRunning = $true }
  else { $gamePort = $PreferredPort + 1 }
} catch {}
if (-not $gameAlreadyRunning) {
  $serverFile = Join-Path $PSScriptRoot 'serve.mjs'
  $env:PORT = "$gamePort"
  $gameLogDirectory = Join-Path $gameDirectory 'artifacts\launcher'
  New-Item -ItemType Directory -Force -Path $gameLogDirectory | Out-Null
  Start-Process -FilePath $gameNodePath -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $gameDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameLogDirectory 'server.log') -RedirectStandardError (Join-Path $gameLogDirectory 'server-error.log') | Out-Null
  $serverReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$gamePort/__sakura_health" -TimeoutSec 1; if ($health.app -eq 'sakura-walk') { $serverReady=$true; break } } catch {}
    Start-Sleep -Milliseconds 200
  }
  if (-not $serverReady) { throw "The local server did not start. Check artifacts\launcher\server-error.log." }
}
if (-not $NoOpen) { Start-Process "http://127.0.0.1:$gamePort/" }
Write-Output "Sakura Walk is ready: http://127.0.0.1:$gamePort/"
