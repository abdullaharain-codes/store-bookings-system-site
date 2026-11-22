param(
    [int]$WarmupSeconds = 0
)

$ErrorActionPreference = 'Stop'

$base = 'http://localhost:8000'
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$email = "addr-proof-$ts@example.test"
$pass = ([guid]::NewGuid().ToString() + 'Aa1!')
$tmp = $env:TEMP
$jar = Join-Path $tmp "addrp_${ts}.jar"

$script:results = @()
$script:lastBody = ''

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
    $bodyOut = Join-Path $tmp ("addrp_${ts}_${id}_body.json")
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
    $script:lastBody = ''
    if (Test-Path -LiteralPath $bodyOut) {
        $script:lastBody = (Get-Content -LiteralPath $bodyOut -Raw -Encoding UTF8)
    }
    $script:results += [pscustomobject]@{ Id = $id; Status = $status; Expected = $expected; Match = $match }
    [Console]::WriteLine(("{0} {1} {2} status={3} expected={4} {5}" -f $id, $method, $url, $status, $expected, $match))
    return $status
}

function Get-BodyJson() {
    if ([string]::IsNullOrWhiteSpace($script:lastBody)) { return $null }
    try { return $script:lastBody | ConvertFrom-Json } catch { return $null }
}

if ($WarmupSeconds -gt 0) {
    Start-Sleep -Seconds $WarmupSeconds
}

# A1-A3: session and auth
Call 'A1' $jar 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null

$registerBody = Join-Path $tmp "addrp_${ts}_register.json"
$loginBody = Join-Path $tmp "addrp_${ts}_login.json"
$registerObj = @{ name = 'Addr Proof'; email = $email; password = $pass; password_confirmation = $pass } | ConvertTo-Json -Compress
$loginObj = @{ email = $email; password = $pass } | ConvertTo-Json -Compress
Write-Utf8NoBom $registerBody $registerObj
Write-Utf8NoBom $loginBody $loginObj

Call 'A2' $jar 'POST' ($base + '/api/v1/auth/register') 201 $registerBody | Out-Null
Call 'A3' $jar 'POST' ($base + '/api/v1/auth/login') 200 $loginBody | Out-Null

# A4: list addresses initially
Call 'A4' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA4 = Get-BodyJson
$countA4 = if ($bodyA4 -and $null -ne $bodyA4.addresses) { @($bodyA4.addresses).Count } else { -1 }
Write-Output ("A4_COUNT count={0} expected=0 {1}" -f $countA4, $(if ($countA4 -eq 0) { 'MATCH' } else { 'MISMATCH' }))

# A5: create first address (no is_default)
$create1Body = Join-Path $tmp "addrp_${ts}_create1.json"
$create1Obj = @{ recipient_name = 'Addr Proof One'; phone = '03001234567'; address_line_1 = '1 Test Street'; address_line_2 = 'Floor 2'; city = 'Lahore'; postal_code = '54000'; label = 'Home' } | ConvertTo-Json -Compress
Write-Utf8NoBom $create1Body $create1Obj
Call 'A5' $jar 'POST' ($base + '/api/v1/addresses') 201 $create1Body | Out-Null
$bodyA5 = Get-BodyJson
$id1 = if ($bodyA5 -and $bodyA5.address) { [int]$bodyA5.address.id } else { 0 }
$isDefault1 = if ($bodyA5 -and $null -ne $bodyA5.address.is_default) { [bool]$bodyA5.address.is_default } else { $null }
Write-Output ("A5_ID id={0}" -f $id1)
Write-Output ("A5_IS_DEFAULT value={0} expected=False {1}" -f $isDefault1, $(if ($isDefault1 -eq $false) { 'MATCH' } else { 'MISMATCH' }))

# A6: create second address
$create2Body = Join-Path $tmp "addrp_${ts}_create2.json"
$create2Obj = @{ recipient_name = 'Addr Proof Two'; phone = '03007654321'; address_line_1 = '2 Test Avenue'; city = 'Karachi' } | ConvertTo-Json -Compress
Write-Utf8NoBom $create2Body $create2Obj
Call 'A6' $jar 'POST' ($base + '/api/v1/addresses') 201 $create2Body | Out-Null
$bodyA6 = Get-BodyJson
$id2 = if ($bodyA6 -and $bodyA6.address) { [int]$bodyA6.address.id } else { 0 }
Write-Output ("A6_ID id={0}" -f $id2)

# A7: list count and default count
Call 'A7' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA7 = Get-BodyJson
$countA7 = if ($bodyA7 -and $null -ne $bodyA7.addresses) { @($bodyA7.addresses).Count } else { -1 }
$defaultCountA7 = if ($bodyA7 -and $null -ne $bodyA7.addresses) { @($bodyA7.addresses | Where-Object { $_.is_default -eq $true }).Count } else { -1 }
Write-Output ("A7_COUNT count={0} expected=2 {1}" -f $countA7, $(if ($countA7 -eq 2) { 'MATCH' } else { 'MISMATCH' }))
Write-Output ("A7_DEFAULT_COUNT count={0} expected=0 {1}" -f $defaultCountA7, $(if ($defaultCountA7 -eq 0) { 'MATCH' } else { 'MISMATCH' }))
Write-Output "A7_NOTE expected default count 0 because repository create merges is_default:false and does not auto-default first address"

# A8: set default id1
Call 'A8' $jar 'POST' ($base + "/api/v1/addresses/$id1/default") 200 '' | Out-Null
Call 'A8b' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA8 = Get-BodyJson
$defaultsA8 = @()
if ($bodyA8 -and $null -ne $bodyA8.addresses) { $defaultsA8 = @($bodyA8.addresses | Where-Object { $_.is_default -eq $true }) }
$defaultIdA8 = if ($defaultsA8.Count -eq 1) { [int]$defaultsA8[0].id } else { 0 }
Write-Output ("A8_DEFAULT_COUNT count={0} expected=1 {1}" -f $defaultsA8.Count, $(if ($defaultsA8.Count -eq 1) { 'MATCH' } else { 'MISMATCH' }))
Write-Output ("A8_DEFAULT_ID id={0} expected={1} {2}" -f $defaultIdA8, $id1, $(if ($defaultIdA8 -eq $id1) { 'MATCH' } else { 'MISMATCH' }))

# A9: set default id2
Call 'A9' $jar 'POST' ($base + "/api/v1/addresses/$id2/default") 200 '' | Out-Null
Call 'A9b' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA9 = Get-BodyJson
$defaultsA9 = @()
if ($bodyA9 -and $null -ne $bodyA9.addresses) { $defaultsA9 = @($bodyA9.addresses | Where-Object { $_.is_default -eq $true }) }
$defaultIdA9 = if ($defaultsA9.Count -eq 1) { [int]$defaultsA9[0].id } else { 0 }
Write-Output ("A9_DEFAULT_COUNT count={0} expected=1 {1}" -f $defaultsA9.Count, $(if ($defaultsA9.Count -eq 1) { 'MATCH' } else { 'MISMATCH' }))
Write-Output ("A9_DEFAULT_ID id={0} expected={1} {2}" -f $defaultIdA9, $id2, $(if ($defaultIdA9 -eq $id2) { 'MATCH' } else { 'MISMATCH' }))

# A10: PUT clear address_line_2 with empty string (no is_default)
$updateBody = Join-Path $tmp "addrp_${ts}_update.json"
$updateObj = @{ recipient_name = 'Addr Proof One'; phone = '03001234567'; address_line_1 = '1 Test Street'; address_line_2 = ''; city = 'Lahore'; postal_code = '54000'; label = 'Home' } | ConvertTo-Json -Compress
Write-Utf8NoBom $updateBody $updateObj
Call 'A10' $jar 'PUT' ($base + "/api/v1/addresses/$id1") 200 $updateBody | Out-Null
Call 'A10b' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA10 = Get-BodyJson
$addr1 = if ($bodyA10 -and $null -ne $bodyA10.addresses) { $bodyA10.addresses | Where-Object { [int]$_.id -eq $id1 } | Select-Object -First 1 } else { $null }
$line2 = if ($addr1) { $addr1.address_line_2 } else { '<missing>' }
$line2IsNull = $null -eq $line2
Write-Output ("A10_LINE2_NULL value={0} expected=True {1}" -f $line2IsNull, $(if ($line2IsNull) { 'MATCH' } else { 'MISMATCH' }))

# A11: validation error
$badBody = Join-Path $tmp "addrp_${ts}_bad.json"
$badObj = @{ recipient_name = ''; phone = '03001234567'; address_line_1 = 'Bad'; city = 'Lahore' } | ConvertTo-Json -Compress
Write-Utf8NoBom $badBody $badObj
Call 'A11' $jar 'POST' ($base + '/api/v1/addresses') 422 $badBody | Out-Null
$bodyA11 = Get-BodyJson
$hasRecipientKey = $false
if ($bodyA11 -and $bodyA11.errors) {
    $hasRecipientKey = $null -ne $bodyA11.errors.recipient_name
}
Write-Output ("A11_ERRORS_HAS_RECIPIENT_NAME value={0} expected=True {1}" -f $hasRecipientKey, $(if ($hasRecipientKey) { 'MATCH' } else { 'MISMATCH' }))

# A12: delete default address id2
Call 'A12' $jar 'DELETE' ($base + "/api/v1/addresses/$id2") 200 '' | Out-Null
Call 'A12b' $jar 'GET' ($base + '/api/v1/addresses') 200 '' | Out-Null
$bodyA12 = Get-BodyJson
$countA12 = if ($bodyA12 -and $null -ne $bodyA12.addresses) { @($bodyA12.addresses).Count } else { -1 }
$defaultsA12 = if ($bodyA12 -and $null -ne $bodyA12.addresses) { @($bodyA12.addresses | Where-Object { $_.is_default -eq $true }).Count } else { -1 }
Write-Output ("A12_COUNT count={0} expected=1 {1}" -f $countA12, $(if ($countA12 -eq 1) { 'MATCH' } else { 'MISMATCH' }))
Write-Output ("A12_DEFAULTS_REMAINING count={0} expected=0" -f $defaultsA12)
if ($defaultsA12 -ne 0) {
    Write-Output "A12_FINDING default count differs from repository delete behavior (plain delete, no reassignment)"
} else {
    Write-Output "A12_OBSERVED matches repository delete behavior (plain delete, no reassignment)"
}

# A13: delete unknown
Call 'A13' $jar 'DELETE' ($base + '/api/v1/addresses/99999999') 404 '' | Out-Null
$bodyA13 = Get-BodyJson
$msgA13 = if ($bodyA13 -and $bodyA13.message) { [string]$bodyA13.message } else { '' }
Write-Output ("A13_MESSAGE value={0} expected=Not Found {1}" -f $msgA13, $(if ($msgA13 -eq 'Not Found') { 'MATCH' } else { 'MISMATCH' }))

# A14: fresh jar with only csrf cookie
$jarFresh = Join-Path $tmp "addrp_${ts}_fresh.jar"
Call 'A14csrf' $jarFresh 'GET' ($base + '/sanctum/csrf-cookie') 204 '' | Out-Null
Call 'A14' $jarFresh 'GET' ($base + '/api/v1/addresses') 401 '' | Out-Null

# Summary
$failedIds = @($script:results | Where-Object { $_.Match -ne 'MATCH' } | ForEach-Object { $_.Id })
$extraChecks = @()
if ($countA4 -ne 0) { $extraChecks += 'A4_COUNT' }
if ($isDefault1 -ne $false) { $extraChecks += 'A5_IS_DEFAULT' }
if ($countA7 -ne 2) { $extraChecks += 'A7_COUNT' }
if ($defaultCountA7 -ne 0) { $extraChecks += 'A7_DEFAULT_COUNT' }
if ($defaultsA8.Count -ne 1) { $extraChecks += 'A8_DEFAULT_COUNT' }
if ($defaultIdA8 -ne $id1) { $extraChecks += 'A8_DEFAULT_ID' }
if ($defaultsA9.Count -ne 1) { $extraChecks += 'A9_DEFAULT_COUNT' }
if ($defaultIdA9 -ne $id2) { $extraChecks += 'A9_DEFAULT_ID' }
if (-not $line2IsNull) { $extraChecks += 'A10_LINE2_NULL' }
if (-not $hasRecipientKey) { $extraChecks += 'A11_ERRORS_HAS_RECIPIENT_NAME' }
if ($countA12 -ne 1) { $extraChecks += 'A12_COUNT' }
if ($msgA13 -ne 'Not Found') { $extraChecks += 'A13_MESSAGE' }

$allFailed = @($failedIds + $extraChecks)
if ($allFailed.Count -eq 0) {
    Write-Output 'ADDRESSPROOF RESULT PASS'
    exit 0
} else {
    Write-Output ('ADDRESSPROOF RESULT FAIL ' + (($allFailed | Select-Object -Unique) -join ','))
    exit 1
}
