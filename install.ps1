Write-Host "Installing API Meter..." -ForegroundColor Cyan

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/kookie2626/api-meter/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "API-Meter-Setup-*.exe" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "Failed to find the latest release. Please download manually from GitHub." -ForegroundColor Red
    exit 1
}

$tmpFile = "$env:TEMP\API-Meter-Setup.exe"

Write-Host "Downloading $($asset.name)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmpFile

Write-Host "Installing..."
Start-Process -FilePath $tmpFile -Wait

Remove-Item $tmpFile -Force
Write-Host "API Meter installed!" -ForegroundColor Green
