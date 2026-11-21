param(
    [ValidateSet('standard','nohash')]
    [string]$Scenario = 'standard',
    [switch]$WarmOrders
)

$ErrorActionPreference = 'Stop'

if ($Scenario -eq 'nohash') {
    Write-Output 'SCENARIO nohash: expected values encode the hypothesis'
}

$base = 'http://localhost:8000'
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$email = "pw-proof-$ts@example.test"
$pass = ([guid]::NewGuid().ToString() + 'Aa1!')
$newPass = ([guid]::NewGuid().ToString() + 'Bb2!')
$tmp = $env:TEMP
$jarA = Join-Path $tmp "pwp_${ts}_A.jar"
$jarB = Join-Path $tmp "pwp_${ts}_B.jar"
$jarC = Join-Path $tmp "pwp_${ts}_C.jar"
$jarD = Join-Path $tmp "pwp_${ts}_D.jar"

$script:results = @()

function Write-Utf8NoBom([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
}

function Get-XsrfToken([string]$jar) {
    if (-not (Test-Path -LiteralPath $jar)) { return '' }
    $lines = @(Get-Content -LiteralPath $jar -Encoding UTF8 -ErrorAction SilentlyContinue)
    $val = ''
    foreach ($line in $lines) {
        if ($line -match "`tXSRF-TOKEN`t([^\t]*)$") { $val = $Matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($val)) { return '' }
    return [uri]::UnescapeDataString($val)
}

function Call([string]$id, [string]$jar, [string]$method, [string]$url, [int]$expected, [string]$bodyFile) {
    $bodyOut = Join-Path $tmp ("pwp_${ts}_${id}_body.json")
    $xsrf = Get-XsrfToken $jar
    $args = @(
        '-s',
        '-c', $jar,
        '-b', $jar,
        '-o', $bodyOut,
        '-w', '%{http_code}',
        '-X', $method,
        '-H', 'Origin: http://localhost:5173',
        '-H', 'Referer: http://localhost:5173/',
        '-H', 'Accept: application/json',
        '-H', 'Content-Type: application/json'
    )
    if (-not [string]::IsNullOrWhiteSpace($xsrf)) {
        $args += @('-H', ("X-XSRF-TOKEN: " + $xsrf))
    }
    if (-not [string]::IsNullOrWhiteSpace($bodyFile)) {
        $args += @('--data', "@$bodyFile")
    }
    $args += $url
    $statusText = (& curl.exe @args 2>&1 | Out-String).Trim()
    $status = 0
    [int]::TryParse($statusText, [ref]$status) | Out-Null
    $match = if ($status -eq $expected) { 'MATCH' } else { 'MISMATCH' }
    $script:results += [pscustomobject]@{ Id = $id; Status = $status; Expected = $expected; Match = $match }
    [Console]::WriteLine(("{0} {1} {2} status={3} expected={4} {5}" -f $id, $method, $url, $status, $expected, $match))
    return $status
}

# JSON bodies
$registerBody = Join-Path $tmp "pwp_${ts}_register.json"
$loginBody = Join-Path $tmp "pwp_${ts}_login.json"
$changeBody = Join-Path $tmp "pwp_${ts}_change.json"
$loginNewBody = Join-Path $tmp "pwp_${ts}_login_new.json"
$loginOldBody = Join-Path $tmp "pwp_${ts}_login_old.json"

$registerObj = @{ name = 'PW Proof'; email = $email; password = $pass; password_confirmation = $pass } | ConvertTo-Json -Compress
$loginObj = @{ email = $email; password = $pass } | ConvertTo-Json -Compress
$changeObj = @{ current_password = $pass; new_password = $newPass; new_password_confirmation = $newPass } | ConvertTo-Json -Compress
$loginNewObj = @{ email = $email; password = $newPass } | ConvertTo-Json -Compress
$loginOldObj = @{ email = $email; password = $pass } | ConvertTo-Json -Compress

Write-Utf8NoBom $registerBody $registerObj
Write-Utf8NoBom $loginBody $loginObj
Write-Utf8NoBom $changeBody $changeObj
Write-Utf8NoBom $loginNewBody $loginNewObj
Write-Utf8NoBom $loginOldBody $loginOldObj

# S1 jar A
Call 'S1a' $jarA 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null
Call 'S1b' $jarA 'POST' ($base + '/api/v1/auth/register') 201 $registerBody | Out-Null
Call 'S1c' $jarA 'POST' ($base + '/api/v1/auth/login') 200 $loginBody | Out-Null
Call 'S1d' $jarA 'GET' ($base + '/api/v1/auth/user') 200 '' | Out-Null

# S2 jar B
Call 'S2a' $jarB 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null
Call 'S2b' $jarB 'POST' ($base + '/api/v1/auth/login') 200 $loginBody | Out-Null
if ($Scenario -ne 'nohash') {
    Call 'S2c' $jarB 'GET' ($base + '/api/v1/auth/user') 200 '' | Out-Null
}

# S3 both valid before change
Call 'S3a' $jarA 'GET' ($base + '/api/v1/auth/user') 200 '' | Out-Null
if ($Scenario -ne 'nohash') {
    Call 'S3b' $jarB 'GET' ($base + '/api/v1/auth/user') 200 '' | Out-Null
}
if ($WarmOrders) {
    Call 'S3c' $jarB 'GET' ($base + '/api/v1/orders') 200 '' | Out-Null
}

# S4 change password on jar A
Call 'S4a' $jarA 'POST' ($base + '/api/v1/profile/password') 200 $changeBody | Out-Null

# S5 jar A still signed in
Call 'S5a' $jarA 'GET' ($base + '/api/v1/auth/user') 200 '' | Out-Null

# S6 jar B signed out
$s6aExpected = if ($Scenario -eq 'nohash') { 200 } else { 401 }
$s6bExpected = if ($Scenario -eq 'nohash') { 200 } else { 401 }
Call 'S6a' $jarB 'GET' ($base + '/api/v1/auth/user') $s6aExpected '' | Out-Null
Call 'S6b' $jarB 'GET' ($base + '/api/v1/orders') $s6bExpected '' | Out-Null

# S7 new/old password
Call 'S7a' $jarC 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null
Call 'S7b' $jarC 'POST' ($base + '/api/v1/auth/login') 200 $loginNewBody | Out-Null
Call 'S7c' $jarD 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null
Call 'S7d' $jarD 'POST' ($base + '/api/v1/auth/login') 401 $loginOldBody | Out-Null

$failed = @($script:results | Where-Object { $_.Match -ne 'MATCH' } | ForEach-Object { $_.Id })
if ($failed.Count -eq 0) {
    Write-Output 'PWPROOF RESULT PASS'
    exit 0
} else {
    Write-Output ('PWPROOF RESULT FAIL ' + ($failed -join ','))
    exit 1
}
