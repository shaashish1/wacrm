# Starts a local Supabase stack and rewires the web + worker env files to use it.
# Run from the wacrm directory after Docker Desktop is running.
#
# Usage (from wacrm/):
#   powershell -ExecutionPolicy Bypass -File scripts/start-local-supabase.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot   # .../wacrm
Set-Location $repoRoot

Write-Host '==> Checking Docker daemon...' -ForegroundColor Cyan
$dockerReady = $false
for ($i = 0; $i -lt 24; $i++) {
    docker ps -q 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    Start-Sleep -Seconds 5
}
if (-not $dockerReady) {
    Write-Host 'Docker daemon is not running. Start Docker Desktop first (wait for the whale icon to turn green), then re-run this script.' -ForegroundColor Red
    exit 1
}
Write-Host 'Docker daemon is up.' -ForegroundColor Green

Write-Host '==> Starting local Supabase (first run pulls images, ~3-10 min)...' -ForegroundColor Cyan
supabase start 2>&1 | Tee-Object -Variable startOut
if ($LASTEXITCODE -ne 0) {
    Write-Host 'supabase start failed. See output above.' -ForegroundColor Red
    exit 1
}

Write-Host '==> Reading Supabase status / keys...' -ForegroundColor Cyan
$statusJson = supabase status -o json 2>$null
if (-not $statusJson) {
    Write-Host 'Could not get supabase status JSON. Falling back to env file.' -ForegroundColor Yellow
}
$apiUrl = 'http://127.0.0.1:54321'
$anonKey = ''
$serviceKey = ''
if ($statusJson) {
    try {
        $status = $statusJson | ConvertFrom-Json
        $apiUrl = $status.API_URL
        $anonKey = $status.ANON_KEY
        $serviceKey = $status.SERVICE_ROLE_KEY
    } catch {
        Write-Host "Failed to parse status JSON: $_" -ForegroundColor Yellow
    }
}

if (-not $anonKey -or -not $serviceKey) {
    # Fallback: read from supabase/.env which `supabase start` writes
    $envFile = Join-Path $repoRoot 'supabase\.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*API_URL=(.*)$') { $apiUrl = $matches[1].Trim('"') }
            elseif ($_ -match '^\s*ANON_KEY=(.*)$') { $anonKey = $matches[1].Trim('"') }
            elseif ($_ -match '^\s*SERVICE_ROLE_KEY=(.*)$') { $serviceKey = $matches[1].Trim('"') }
        }
    }
}

if (-not $anonKey -or -not $serviceKey) {
    Write-Host 'Could not determine ANON_KEY / SERVICE_ROLE_KEY. Run `supabase status` manually and fill wacrm/apps/web/.env.local + wacrm/apps/worker/.env.' -ForegroundColor Red
    exit 1
}

Write-Host "API URL:        $apiUrl" -ForegroundColor Green
Write-Host "ANON KEY:       $anonKey" -ForegroundColor Green
Write-Host "SERVICE KEY:    $serviceKey" -ForegroundColor Green

function Update-EnvFile {
    param([string]$Path, [string]$Url, [string]$Anon, [string]$Service, [string[]]$Extra = @())
    if (-not (Test-Path $Path)) {
        Write-Host "Skipping missing file: $Path" -ForegroundColor Yellow
        return
    }
    $lines = Get-Content $Path
    $seen = @{}
    $out = @()
    foreach ($l in $lines) {
        if ($l -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=') { $out += "NEXT_PUBLIC_SUPABASE_URL=$Url"; $seen['url'] = $true }
        elseif ($l -match '^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=') { $out += "NEXT_PUBLIC_SUPABASE_ANON_KEY=$Anon"; $seen['anon'] = $true }
        elseif ($l -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=') { $out += "SUPABASE_SERVICE_ROLE_KEY=$Service"; $seen['service'] = $true }
        else { $out += $l }
    }
    if (-not $seen['url'])     { $out += "NEXT_PUBLIC_SUPABASE_URL=$Url" }
    if (-not $seen['anon'])    { $out += "NEXT_PUBLIC_SUPABASE_ANON_KEY=$Anon" }
    if (-not $seen['service']) { $out += "SUPABASE_SERVICE_ROLE_KEY=$Service" }
    $out += $Extra
    Set-Content -Path $Path -Value $out -Encoding UTF8
    Write-Host "Updated $Path" -ForegroundColor Green
}

Update-EnvFile -Path (Join-Path $repoRoot 'apps\web\.env.local') -Url $apiUrl -Anon $anonKey -Service $serviceKey
Update-EnvFile -Path (Join-Path $repoRoot 'apps\worker\.env')   -Url $apiUrl -Anon $anonKey -Service $serviceKey

Write-Host ''
Write-Host '==> Local Supabase is ready.' -ForegroundColor Green
Write-Host 'Admin login:' -ForegroundColor Cyan
Write-Host '   email:    admin@wacrm.itgyani.com' -ForegroundColor White
Write-Host '   password: 18a5f3deb2198d569bd7d125b553c52b' -ForegroundColor White
Write-Host ''
Write-Host 'Studio:      http://127.0.0.1:54323' -ForegroundColor Cyan
Write-Host 'Inbucket (email catcher): http://127.0.0.1:54324  (password-reset emails land here)' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Next: restart the web app (port 3100) and the worker so they pick up the new env.' -ForegroundColor Cyan
