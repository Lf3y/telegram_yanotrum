Write-Host "Starting Vape Shop..." -ForegroundColor Red

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Backend: http://localhost:3001" -ForegroundColor DarkGray
Write-Host "Frontend: http://localhost:5173" -ForegroundColor DarkGray

Start-Process -WorkingDirectory (Join-Path $root "backend") -FilePath "node" -ArgumentList "server.js"
Start-Process -WorkingDirectory (Join-Path $root "frontend") -FilePath "npm" -ArgumentList "run","dev"

Write-Host ""
Write-Host "If you need Telegram Mini App HTTPS URL:" -ForegroundColor DarkGray
Write-Host "  ngrok http 5173" -ForegroundColor DarkGray
Write-Host ""
