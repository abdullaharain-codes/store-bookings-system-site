# DEV ONLY - real-API bookings proof. Never run against production.
# Proves customer booking contract against the running dev API.
# No secrets or passwords are printed.

param(
    [string]$BaseUrl = 'http://localhost:8000'
)

$ErrorActionPreference = 'Stop'

$ts = Get-Date -Format 'yyyyMMddHHmmss'
$tmp = $env:TEMP
$rand = [guid]::NewGuid().ToString('N').Substring(0, 10)
$pass = ([guid]::NewGuid().ToString('N') + 'Aa1!')

$jarC1 = Join-Path $tmp "bkproof_c1_$rand.jar"
$jarC2 = Join-Path $tmp "bkproof_c2_$rand.jar"
$jarGuest = Join-Path $tmp "bkproof_guest_$rand.jar"

$script:results = @()
$script:lastBody = ''
$script:lastJson = $null
$script:availabilityCalls = 0
$script:stopReason = ''

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
        [Parameter(Mandatory=$true)][string]$Id,
        [Parameter(Mandatory=$true)][string]$Jar,
        [Parameter(Mandatory=$true)][string]$Method,
        [Parameter(Mandatory=$true)][string]$Url,
        [string]$BodyFile = '',
        [int]$Expected = -1,
        [switch]$IsAvailability
    )

    if ($IsAvailability) {
        if ($script:availabilityCalls -ge 8) {
            throw "Availability call budget exceeded (max 8)."
        }
        if ($script:availabilityCalls -gt 0) {
            Start-Sleep -Seconds 3
        }
        $script:availabilityCalls++
    }

    $bodyOut = Join-Path $tmp ("bkproof_${rand}_${Id}_body.json")
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

    $script:lastBody = $body
    $script:lastJson = $json

    if ($status -eq 429) {
        $script:stopReason = "429 rate limit on $Id $Method $Url"
        $script:results += [pscustomobject]@{ Id=$Id; Status=$status; Expected=$Expected; Match='MISMATCH_429' }
        [Console]::WriteLine("$Id $Method $Url status=429 expected=$Expected MISMATCH_429")
        throw $script:stopReason
    }

    $match = if ($Expected -lt 0) { 'INFO' } elseif ($status -eq $Expected) { 'MATCH' } else { 'MISMATCH' }
    $script:results += [pscustomobject]@{ Id=$Id; Status=$status; Expected=$Expected; Match=$match }
    [Console]::WriteLine("$Id $Method $Url status=$status expected=$Expected $match")
    return [pscustomobject]@{ Status=$status; Body=$body; Json=$json }
}

function Get-JsonKeys([object]$obj, [string]$prefix='') {
    $keys = @()
    if ($null -eq $obj) { return $keys }
    $props = @()
    try { $props = @($obj.PSObject.Properties) } catch { $props = @() }
    foreach ($p in $props) {
        $name = if ($prefix) { "$prefix.$($p.Name)" } else { $p.Name }
        $keys += $name
        $val = $p.Value
        if ($val -is [pscustomobject]) {
            $keys += Get-JsonKeys $val $name
        } elseif ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
            $arr = @($val)
            if ($arr.Count -gt 0 -and $arr[0] -is [pscustomobject]) {
                $keys += Get-JsonKeys $arr[0] "$name[0]"
            }
        }
    }
    return $keys
}

function Register-And-Login([string]$jar, [string]$email, [string]$name, [string]$label) {
    $null = Invoke-Api -Id "${label}_csrf" -Jar $jar -Method 'GET' -Url ($BaseUrl + '/sanctum/csrf-cookie') -Expected 204
    $regPath = Join-Path $tmp "bkproof_${rand}_${label}_reg.json"
    $loginPath = Join-Path $tmp "bkproof_${rand}_${label}_login.json"
    $regObj = @{ name=$name; email=$email; password=$pass; password_confirmation=$pass } | ConvertTo-Json -Compress
    $loginObj = @{ email=$email; password=$pass } | ConvertTo-Json -Compress
    Write-AsciiFile $regPath $regObj
    Write-AsciiFile $loginPath $loginObj
    $null = Invoke-Api -Id "${label}_register" -Jar $jar -Method 'POST' -Url ($BaseUrl + '/api/v1/auth/register') -BodyFile $regPath -Expected 201
    $null = Invoke-Api -Id "${label}_login" -Jar $jar -Method 'POST' -Url ($BaseUrl + '/api/v1/auth/login') -BodyFile $loginPath -Expected 200
}

try {
    $email1 = "bkproof-c1-$rand@example.test"
    $email2 = "bkproof-c2-$rand@example.test"
    Register-And-Login $jarC1 $email1 'BK Proof C1' 'C1'
    Register-And-Login $jarC2 $email2 'BK Proof C2' 'C2'

    # P1: availability 3 days ahead + nearest mode once
    $targetDate = (Get-Date).AddDays(3)
    if ([int]$targetDate.DayOfWeek -eq 0) { $targetDate = $targetDate.AddDays(1) } # avoid Sunday
    $dateStr = $targetDate.ToString('yyyy-MM-dd')

    $a1 = Invoke-Api -Id 'P1_date' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + "/api/v1/services/dev-laptop-checkup/availability?date=$dateStr") -Expected 200 -IsAvailability
    $a1Slots = @()
    if ($null -ne $a1.Json -and $null -ne $a1.Json.slots) { $a1Slots = @($a1.Json.slots) }
    $a1Count = $a1Slots.Count
    $a1OffsetOk = $false
    $a1FirstStart = ''
    if ($a1Count -gt 0) {
        $a1FirstStart = [string]$a1Slots[0].start
        if ($a1FirstStart -match '\+05:00$') { $a1OffsetOk = $true }
    }
    [Console]::WriteLine("P1_date slots_count=$a1Count offset_plus0500=$a1OffsetOk first_start=$a1FirstStart")
    [Console]::WriteLine("P1_date keys: " + ((Get-JsonKeys $a1.Json) -join ', '))
    [Console]::WriteLine("P1_date raw: " + $a1.Body)

    $a1n = Invoke-Api -Id 'P1_nearest' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + "/api/v1/services/dev-laptop-checkup/availability?date=$dateStr&mode=nearest") -Expected 200 -IsAvailability
    $hasNearest = ($null -ne $a1n.Json -and $null -ne $a1n.Json.nearest_slot)
    [Console]::WriteLine("P1_nearest has_nearest_slot=$hasNearest")
    [Console]::WriteLine("P1_nearest keys: " + ((Get-JsonKeys $a1n.Json) -join ', '))

    if ($a1Count -lt 1) { throw "P1 failed: no slots returned for $dateStr" }

    # P2: create address, create booking
    $addrBody = Join-Path $tmp "bkproof_${rand}_addr.json"
    Write-AsciiFile $addrBody (@{
        recipient_name='BK Proof User'
        phone='03001234567'
        address_line_1='123 Test Street'
        address_line_2=''
        city='Lahore'
        postal_code='54000'
        label='Home'
    } | ConvertTo-Json -Compress)
    $addr = Invoke-Api -Id 'P2_address' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + '/api/v1/addresses') -BodyFile $addrBody -Expected 201
    $addressId = [int]$addr.Json.address.id

    $slot = $a1Slots[0]
    $bookBody = Join-Path $tmp "bkproof_${rand}_book.json"
    Write-AsciiFile $bookBody (@{
        service_id=[int]$a1.Json.service.id
        scheduled_slot_start=[string]$slot.start
        scheduled_slot_end=[string]$slot.end
        address_id=$addressId
        problem_description='Laptop overheating during use.'
    } | ConvertTo-Json -Compress)
    $b1 = Invoke-Api -Id 'P2_book' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + '/api/v1/bookings') -BodyFile $bookBody -Expected 201
    $bookingId = [int]$b1.Json.booking.id
    [Console]::WriteLine("P2 booking_id=$bookingId")
    [Console]::WriteLine("P2 booking keys: " + ((Get-JsonKeys $b1.Json.booking) -join ', '))
    [Console]::WriteLine("P2 booking raw: " + $b1.Body)

    # P3: same slot same user -> 422; second user -> 422
    $p3a = Invoke-Api -Id 'P3_same_user' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + '/api/v1/bookings') -BodyFile $bookBody -Expected 422
    $p3aMsg = ''
    if ($null -ne $p3a.Json -and $null -ne $p3a.Json.message) { $p3aMsg = [string]$p3a.Json.message }
    [Console]::WriteLine("P3_same_user message=$p3aMsg")

    $p3b = Invoke-Api -Id 'P3_other_user' -Jar $jarC2 -Method 'POST' -Url ($BaseUrl + '/api/v1/bookings') -BodyFile $bookBody -Expected 422
    $p3bMsg = ''
    if ($null -ne $p3b.Json -and $null -ne $p3b.Json.message) { $p3bMsg = [string]$p3b.Json.message }
    [Console]::WriteLine("P3_other_user message=$p3bMsg")

    # P4: list and show
    $list = Invoke-Api -Id 'P4_list' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + '/api/v1/bookings') -Expected 200
    $listHas = $false
    if ($null -ne $list.Json -and $null -ne $list.Json.bookings -and $null -ne $list.Json.bookings.data) {
        foreach ($b in @($list.Json.bookings.data)) { if ([int]$b.id -eq $bookingId) { $listHas = $true } }
    }
    [Console]::WriteLine("P4_list contains_booking=$listHas")
    [Console]::WriteLine("P4_list keys: " + ((Get-JsonKeys $list.Json) -join ', '))

    $show = Invoke-Api -Id 'P4_show' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + "/api/v1/bookings/$bookingId") -Expected 200
    [Console]::WriteLine("P4_show keys: " + ((Get-JsonKeys $show.Json) -join ', '))

    # P5: other user 404, guest 401
    $p5a = Invoke-Api -Id 'P5_other_show' -Jar $jarC2 -Method 'GET' -Url ($BaseUrl + "/api/v1/bookings/$bookingId") -Expected 404
    $p5aMsg = ''
    if ($null -ne $p5a.Json -and $null -ne $p5a.Json.message) { $p5aMsg = [string]$p5a.Json.message }
    [Console]::WriteLine("P5_other_show message=$p5aMsg")

    $null = Invoke-Api -Id 'P5_guest_csrf' -Jar $jarGuest -Method 'GET' -Url ($BaseUrl + '/sanctum/csrf-cookie') -Expected 204
    $p5b = Invoke-Api -Id 'P5_guest_list' -Jar $jarGuest -Method 'GET' -Url ($BaseUrl + '/api/v1/bookings') -Expected 401

    # P6: cancel, cancel again, slot free again
    $cancel = Invoke-Api -Id 'P6_cancel' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + "/api/v1/bookings/$bookingId/cancel") -Expected 200
    $cancelStatus = ''
    if ($null -ne $cancel.Json -and $null -ne $cancel.Json.booking) { $cancelStatus = [string]$cancel.Json.booking.status }
    [Console]::WriteLine("P6_cancel booking_status=$cancelStatus")

    $cancel2 = Invoke-Api -Id 'P6_cancel_again' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + "/api/v1/bookings/$bookingId/cancel") -Expected 422
    $cancel2Msg = ''
    if ($null -ne $cancel2.Json -and $null -ne $cancel2.Json.message) { $cancel2Msg = [string]$cancel2.Json.message }
    [Console]::WriteLine("P6_cancel_again message=$cancel2Msg")

    $afterCancel = Invoke-Api -Id 'P6_avail_after_cancel' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + "/api/v1/services/dev-laptop-checkup/availability?date=$dateStr") -Expected 200 -IsAvailability
    $slotFreeAgain = $false
    if ($null -ne $afterCancel.Json -and $null -ne $afterCancel.Json.slots) {
        foreach ($s in @($afterCancel.Json.slots)) {
            if ([string]$s.start -eq [string]$slot.start -and [string]$s.end -eq [string]$slot.end) { $slotFreeAgain = $true }
        }
    }
    [Console]::WriteLine("P6 slot_free_again=$slotFreeAgain")

    # P7: cutoff check - only if a slot exists today inside 2h cutoff; otherwise UNPROVEN
    $today = Get-Date
    $todayStr = $today.ToString('yyyy-MM-dd')
    $p7Status = 'UNPROVEN'
    $p7Detail = 'no qualifying in-cutoff slot found today or not safe to prove without changing settings'
    # We do not fetch availability for today to avoid extra calls unless clearly needed; budget allows 4 more calls.
    # Try to find a slot today that is within cutoff by checking availability once.
    $todayAvail = Invoke-Api -Id 'P7_today_avail' -Jar $jarC1 -Method 'GET' -Url ($BaseUrl + "/api/v1/services/dev-laptop-checkup/availability?date=$todayStr") -Expected 200 -IsAvailability
    $cutoffCandidate = $null
    if ($null -ne $todayAvail.Json -and $null -ne $todayAvail.Json.slots) {
        $nowUtc = [DateTimeOffset]::UtcNow
        foreach ($s in @($todayAvail.Json.slots)) {
            try {
                $start = [DateTimeOffset]::Parse([string]$s.start)
                $mins = ($start.ToUniversalTime() - $nowUtc).TotalMinutes
                if ($mins -gt 0 -and $mins -lt 120) { $cutoffCandidate = $s; break }
            } catch {}
        }
    }
    if ($null -ne $cutoffCandidate) {
        # Create booking for cutoff candidate, then attempt cancel - expect 422 cutoff message
        $cutBody = Join-Path $tmp "bkproof_${rand}_cut.json"
        Write-AsciiFile $cutBody (@{
            service_id=[int]$todayAvail.Json.service.id
            scheduled_slot_start=[string]$cutoffCandidate.start
            scheduled_slot_end=[string]$cutoffCandidate.end
            address_id=$addressId
            problem_description='Cutoff proof booking.'
        } | ConvertTo-Json -Compress)
        $cutBook = Invoke-Api -Id 'P7_book' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + '/api/v1/bookings') -BodyFile $cutBody -Expected 201
        $cutId = [int]$cutBook.Json.booking.id
        $cutCancel = Invoke-Api -Id 'P7_cancel' -Jar $jarC1 -Method 'POST' -Url ($BaseUrl + "/api/v1/bookings/$cutId/cancel") -Expected 422
        $cutMsg = ''
        if ($null -ne $cutCancel.Json -and $null -ne $cutCancel.Json.message) { $cutMsg = [string]$cutCancel.Json.message }
        $p7Status = 'PROVEN'
        $p7Detail = "cutoff cancel rejected with message=$cutMsg"
    } else {
        [Console]::WriteLine("P7 UNPROVEN: no slot within 120 minutes found for $todayStr")
    }
    [Console]::WriteLine("P7 status=$p7Status detail=$p7Detail")

    $mismatches = @($script:results | Where-Object { $_.Match -eq 'MISMATCH' -or $_.Match -eq 'MISMATCH_429' })
    $result = if ($mismatches.Count -eq 0) { 'PASS' } else { 'FAIL' }
    [Console]::WriteLine("AVAILABILITY_CALLS=$($script:availabilityCalls)")
    [Console]::WriteLine("BOOKINGPROOF RESULT $result")
    [Console]::WriteLine("SCRIPT_EXIT=0")
    if ($result -ne 'PASS') { exit 1 }
    exit 0
}
catch {
    [Console]::WriteLine("ERROR: " + $_.Exception.Message)
    [Console]::WriteLine("AVAILABILITY_CALLS=$($script:availabilityCalls)")
    [Console]::WriteLine("BOOKINGPROOF RESULT FAIL")
    [Console]::WriteLine("SCRIPT_EXIT=1")
    exit 1
}
