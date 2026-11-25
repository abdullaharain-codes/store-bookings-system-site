# DEV ONLY - creates throwaway dev data through the real HTTP API.
# NEVER run this script against production.
# It creates a throwaway admin user and minimal bookable service/hours.
# No secrets or passwords are printed.

param(
    [string]$BaseUrl = 'http://localhost:8000',
    [string]$DevComposeFile = 'infra/dev/docker-compose.dev-serve.yml',
    [string]$DevService = 'api-serve'
)

$ErrorActionPreference = 'Stop'

function Write-AsciiFile([string]$path, [string]$text) {
    Set-Content -LiteralPath $path -Value $text -Encoding ASCII
}

function Get-XsrfTokenFromJar([string]$jarPath) {
    if (-not (Test-Path -LiteralPath $jarPath)) { return '' }
    $lines = @(Get-Content -LiteralPath $jarPath -Encoding UTF8 -ErrorAction SilentlyContinue)
    $token = ''
    foreach ($line in $lines) {
        if ($line -match "`tXSRF-TOKEN`t([^\t]*)$") { $token = $Matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($token)) { return '' }
    return [uri]::UnescapeDataString($token)
}

function Invoke-Api {
    param(
        [Parameter(Mandatory=$true)][string]$Jar,
        [Parameter(Mandatory=$true)][string]$Method,
        [Parameter(Mandatory=$true)][string]$Url,
        [string]$BodyFile = '',
        [int[]]$ExpectedStatuses = @()
    )

    $bodyOut = Join-Path $env:TEMP ("dev-seed-" + [guid]::NewGuid().ToString() + ".json")
    $xsrf = Get-XsrfTokenFromJar $Jar
    $args = @(
        '-s',
        '-c', $Jar,
        '-b', $Jar,
        '-o', $bodyOut,
        '-w', '%{http_code}',
        '-X', $Method,
        '-H', 'Origin: http://localhost:5173',
        '-H', 'Referer: http://localhost:5173/',
        '-H', 'Accept: application/json'
    )
    if ($Method -in @('POST','PUT','PATCH','DELETE')) {
        $args += @('-H', 'Content-Type: application/json')
    }
    if (-not [string]::IsNullOrWhiteSpace($xsrf)) {
        $args += @('-H', ("X-XSRF-TOKEN: " + $xsrf))
    }
    if (-not [string]::IsNullOrWhiteSpace($BodyFile)) {
        $args += @('--data', "@$BodyFile")
    }
    $args += $Url

    $statusText = (& curl.exe @args 2>&1 | Out-String).Trim()
    $status = 0
    [int]::TryParse($statusText, [ref]$status) | Out-Null
    $body = ''
    if (Test-Path -LiteralPath $bodyOut) {
        $body = Get-Content -LiteralPath $bodyOut -Raw -Encoding UTF8
    }
    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($body)) {
        try { $json = $body | ConvertFrom-Json } catch { $json = $null }
    }
    if ($ExpectedStatuses.Count -gt 0 -and ($ExpectedStatuses -notcontains $status)) {
        throw ("Unexpected status {0} for {1} {2}. Expected: {3}. Body: {4}" -f $status, $Method, $Url, ($ExpectedStatuses -join ','), $body)
    }
    return [pscustomobject]@{
        Status = $status
        Body = $body
        Json = $json
    }
}

# --- Preconditions ---
$csrf = Invoke-Api -Jar (Join-Path $env:TEMP ("dev-seed-csrf-" + [guid]::NewGuid().ToString() + ".jar")) -Method 'GET' -Url ($BaseUrl + '/sanctum/csrf-cookie') -ExpectedStatuses @(204)
Write-Host "CSRF status=$($csrf.Status)"

# --- Throwaway admin (password never printed) ---
$rand = [guid]::NewGuid().ToString('N').Substring(0, 12)
$adminEmail = "dev-seed-admin-$rand@example.test"
$adminName = "Dev Seed Admin $rand"
$adminPass = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') + 'Aa1!')
$jar = Join-Path $env:TEMP ("dev-seed-$rand.jar")

$createOut = & docker compose -f $DevComposeFile exec -T $DevService php artisan admin:create --name="$adminName" --email="$adminEmail" --password="$adminPass" 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    throw "admin:create failed (exit $LASTEXITCODE). Output omitted to avoid leaking secrets."
}
Write-Host "ADMIN_CREATED email=$adminEmail"

# --- Login as admin ---
$null = Invoke-Api -Jar $jar -Method 'GET' -Url ($BaseUrl + '/sanctum/csrf-cookie') -ExpectedStatuses @(204)
$loginBody = Join-Path $env:TEMP ("dev-seed-login-$rand.json")
Write-AsciiFile $loginBody (@{ email = $adminEmail; password = $adminPass } | ConvertTo-Json -Compress)
$login = Invoke-Api -Jar $jar -Method 'POST' -Url ($BaseUrl + '/api/v1/auth/login') -BodyFile $loginBody -ExpectedStatuses @(200)
Write-Host "ADMIN_LOGIN status=$($login.Status)"

# --- Service: create or reuse Dev Laptop Checkup ---
$serviceSlug = 'dev-laptop-checkup'
$servicesResp = Invoke-Api -Jar $jar -Method 'GET' -Url ($BaseUrl + '/api/v1/admin/services?per_page=100&search=Dev+Laptop+Checkup') -ExpectedStatuses @(200)
$existingService = $null
$serviceItems = @()
if ($null -ne $servicesResp.Json) {
    if ($null -ne $servicesResp.Json.data) { $serviceItems = @($servicesResp.Json.data) }
    elseif ($null -ne $servicesResp.Json.services) { $serviceItems = @($servicesResp.Json.services) }
}
foreach ($s in $serviceItems) {
    if ($s.slug -eq $serviceSlug) { $existingService = $s; break }
}

if ($null -eq $existingService) {
    $serviceBody = Join-Path $env:TEMP ("dev-seed-service-$rand.json")
    Write-AsciiFile $serviceBody (@{
        name = 'Dev Laptop Checkup'
        slug = $serviceSlug
        description = 'Dev seed service for booking proof.'
        price_min = 1500
        price_max = 3500
        duration_minutes = 60
        is_published = $false
    } | ConvertTo-Json -Compress)
    $createService = Invoke-Api -Jar $jar -Method 'POST' -Url ($BaseUrl + '/api/v1/admin/services') -BodyFile $serviceBody -ExpectedStatuses @(201)
    $existingService = $createService.Json.service
    Write-Host "SERVICE_CREATED slug=$($existingService.slug) id=$($existingService.id)"
} else {
    Write-Host "SERVICE_EXISTS slug=$($existingService.slug) id=$($existingService.id)"
}

# Publish (idempotent endpoint behavior expected)
$publish = Invoke-Api -Jar $jar -Method 'POST' -Url ($BaseUrl + "/api/v1/admin/services/$($existingService.id)/publish") -ExpectedStatuses @(200)
$serviceStatus = if ($publish.Json.service.is_published) { 'published' } else { 'unpublished' }
Write-Host "SERVICE_STATUS slug=$serviceSlug status=$serviceStatus"

# --- Business hours: Mon-Sat 09:00-18:00, Sun closed ---
$hoursResp = Invoke-Api -Jar $jar -Method 'GET' -Url ($BaseUrl + '/api/v1/admin/business-hours') -ExpectedStatuses @(200)
$existingDays = @{}
if ($null -ne $hoursResp.Json -and $null -ne $hoursResp.Json.business_hours) {
    foreach ($h in @($hoursResp.Json.business_hours)) {
        $existingDays[[int]$h.day_of_week] = $true
    }
}

$hoursSpec = @(
    @{ day_of_week = 0; is_closed = $true;  opens_at = $null;   closes_at = $null },
    @{ day_of_week = 1; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' },
    @{ day_of_week = 2; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' },
    @{ day_of_week = 3; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' },
    @{ day_of_week = 4; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' },
    @{ day_of_week = 5; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' },
    @{ day_of_week = 6; is_closed = $false; opens_at = '09:00'; closes_at = '18:00' }
)

$createdHours = 0
$skippedHours = 0
foreach ($spec in $hoursSpec) {
    $day = [int]$spec.day_of_week
    if ($existingDays.ContainsKey($day)) {
        $skippedHours++
        continue
    }
    $bodyPath = Join-Path $env:TEMP ("dev-seed-hour-$rand-$day.json")
    Write-AsciiFile $bodyPath (@{
        day_of_week = $day
        is_closed = [bool]$spec.is_closed
        opens_at = $spec.opens_at
        closes_at = $spec.closes_at
    } | ConvertTo-Json -Compress)
    $null = Invoke-Api -Jar $jar -Method 'POST' -Url ($BaseUrl + '/api/v1/admin/business-hours') -BodyFile $bodyPath -ExpectedStatuses @(201)
    $createdHours++
}

$hoursAfter = Invoke-Api -Jar $jar -Method 'GET' -Url ($BaseUrl + '/api/v1/admin/business-hours') -ExpectedStatuses @(200)
$hoursCount = 0
if ($null -ne $hoursAfter.Json -and $null -ne $hoursAfter.Json.business_hours) {
    $hoursCount = @($hoursAfter.Json.business_hours).Count
}

Write-Host "HOURS_ROWS count=$hoursCount created=$createdHours skipped=$skippedHours"
Write-Host "DEV_SEED RESULT PASS"
Write-Host "SERVICE_SLUG=$serviceSlug"
Write-Host "SCRIPT_EXIT=0"
