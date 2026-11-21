function Get-FailingTestNames {
    param([string[]]$Lines)
    $items = @()
    $seen = @{}
    if ($null -eq $Lines) { return @() }
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = [string]$Lines[$i]
        if ($line -match '^\s*FAIL\s+(\S+\.test\.[jt]sx?)\s+>\s+(.+?)\s*$') {
            $file = $Matches[1]
            $test = $Matches[2]
            $key = "$file > $test"
            if ($seen.ContainsKey($key)) { continue }
            $msg = ''
            for ($j = $i + 1; $j -lt $Lines.Count; $j++) {
                $next = ([string]$Lines[$j]).Trim()
                if ($next.Length -gt 0) {
                    if ($next.Length -gt 200) { $next = $next.Substring(0, 200) }
                    $msg = $next
                    break
                }
            }
            $seen[$key] = $true
            $items += ("{0} > {1} :: {2}" -f $file, $test, $msg)
        }
    }
    return @($items)
}

function Get-VitestSummary {
    param([string[]]$Lines)
    if ($null -eq $Lines) { return $null }
    $filesLine = $null
    $testsLine = $null
    $durationLine = $null
    foreach ($raw in $Lines) {
        $line = [string]$raw
        if ($null -eq $filesLine -and $line -match '^\s*Test Files\s+') { $filesLine = $line.Trim() }
        if ($null -eq $testsLine -and $line -match '^\s*Tests\s+') { $testsLine = $line.Trim() }
        if ($null -eq $durationLine -and $line -match '^\s*Duration\s+') { $durationLine = $line.Trim() }
    }
    if ($null -eq $testsLine) { return $null }
    $failedCount = 0
    if ($testsLine -match '(\d+)\s+failed') {
        $failedCount = [int]$Matches[1]
    }
    return [pscustomobject]@{
        FilesLine    = $filesLine
        TestsLine    = $testsLine
        DurationLine = $durationLine
        FailedCount  = $failedCount
    }
}

function Get-StepStatus {
    param(
        $ExitCode,
        $Summary,
        [switch]$ExpectSummary
    )
    if ($null -eq $ExitCode) {
        return [pscustomobject]@{ Status = 'FAIL'; Reason = 'exit code unavailable' }
    }
    $code = [int]$ExitCode
    if ($code -ne 0) {
        return [pscustomobject]@{ Status = 'FAIL'; Reason = ("exit code {0}" -f $code) }
    }
    if ($ExpectSummary) {
        if ($null -eq $Summary) {
            return [pscustomobject]@{ Status = 'FAIL'; Reason = 'missing vitest summary' }
        }
        $failed = 0
        if ($null -ne $Summary.FailedCount) { $failed = [int]$Summary.FailedCount }
        if ($failed -gt 0) {
            return [pscustomobject]@{ Status = 'FAIL'; Reason = ("summary reports {0} failed" -f $failed) }
        }
    }
    return [pscustomobject]@{ Status = 'PASS'; Reason = '' }
}

function Get-FinalBanner {
    param($Results)
    $failed = @()
    $skipped = @()
    foreach ($r in @($Results)) {
        if ($null -ne $r -and $r.Status -eq 'FAIL') {
            $name = ''
            if ($r.PSObject.Properties['Step']) { $name = [string]$r.Step }
            if ([string]::IsNullOrWhiteSpace($name)) { $name = 'unknown' }
            $failed += $name
        }
        if ($null -ne $r -and $r.Status -eq 'SKIPPED') {
            $sname = ''
            if ($r.PSObject.Properties['Step']) { $sname = [string]$r.Step }
            if ([string]::IsNullOrWhiteSpace($sname)) { $sname = 'unknown' }
            $skipped += $sname
        }
    }
    if ($failed.Count -gt 0) {
        return ('FAILED STEPS: ' + ($failed -join ', '))
    }
    if ($skipped.Count -gt 0) {
        return ("ALL RUN STEPS PASS ({0} skipped: {1})" -f $skipped.Count, ($skipped -join ', '))
    }
    return 'ALL STEPS PASS'
}

function Test-PrerenderOutput {
    param([string]$BuildClientDir)
    $problems = @()
    $titleFiles = @('index.html', 'shop\index.html', 'services\index.html', 'login\index.html', 'register\index.html')
    foreach ($rel in $titleFiles) {
        $path = Join-Path $BuildClientDir $rel
        if (-not (Test-Path -LiteralPath $path)) {
            $problems += ("{0}: missing" -f $rel)
            continue
        }
        $len = (Get-Item -LiteralPath $path).Length
        if ($len -le 0) {
            $problems += ("{0}: zero bytes" -f $rel)
            continue
        }
        $content = [IO.File]::ReadAllText($path)
        if ($content -notmatch '<title>[^<]+</title>') {
            $problems += ("{0}: missing or empty title" -f $rel)
        }
    }
    $fallback = '__spa-fallback.html'
    $fallbackPath = Join-Path $BuildClientDir $fallback
    if (-not (Test-Path -LiteralPath $fallbackPath)) {
        $problems += ("{0}: missing" -f $fallback)
    } else {
        $flen = (Get-Item -LiteralPath $fallbackPath).Length
        if ($flen -le 0) {
            $problems += ("{0}: zero bytes" -f $fallback)
        }
    }
    if ($problems.Count -eq 0) {
        return [pscustomobject]@{ Status = 'PASS'; Problems = @() }
    }
    return [pscustomobject]@{ Status = 'FAIL'; Problems = @($problems) }
}

function Get-CssStepStatus {
    param(
        [string]$StorefrontCssPath,
        [string]$AdminCssPath,
        $StorefrontExit,
        $AdminExit
    )
    $problems = @()
    if ([string]::IsNullOrWhiteSpace($StorefrontCssPath) -or -not (Test-Path -LiteralPath $StorefrontCssPath)) {
        $problems += 'storefront css missing'
    }
    if ([string]::IsNullOrWhiteSpace($AdminCssPath) -or -not (Test-Path -LiteralPath $AdminCssPath)) {
        $problems += 'admin css missing'
    }
    if ($null -eq $StorefrontExit -or [int]$StorefrontExit -ne 0) {
        $problems += 'storefront css exit not 0'
    }
    if ($null -eq $AdminExit -or [int]$AdminExit -ne 0) {
        $problems += 'admin css exit not 0'
    }
    if ($problems.Count -eq 0) {
        return [pscustomobject]@{ Status = 'PASS'; Problems = @() }
    }
    return [pscustomobject]@{ Status = 'FAIL'; Problems = @($problems) }
}

function Invoke-VerifyStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [string]$WorkDir,
        [switch]$ExpectSummary,
        [string]$FailPattern,
        [string]$CountPattern,
        [int]$MaxCount = -1,
        [string]$CountLabel
    )

    $pushed = $false
    if (-not [string]::IsNullOrWhiteSpace($WorkDir)) {
        Push-Location -LiteralPath $WorkDir
        $pushed = $true
    }
    try {
        $global:LASTEXITCODE = 0
        & $Command 2>&1 | Out-File -FilePath $LogPath -Encoding utf8
        $code = $LASTEXITCODE
    } finally {
        if ($pushed) { Pop-Location }
    }

    $logLines = @()
    if (Test-Path -LiteralPath $LogPath) {
        $logLines = @(Get-Content -LiteralPath $LogPath -Encoding UTF8)
    }

    $summary = $null
    $counts = ''
    $countValue = 0
    $hasCount = $false
    if ($ExpectSummary) {
        $summary = Get-VitestSummary -Lines $logLines
        $counts = (@($summary.FilesLine, $summary.TestsLine, $summary.DurationLine) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ' | '
    } elseif (-not [string]::IsNullOrWhiteSpace($CountPattern)) {
        $countValue = @($logLines | Where-Object { $_ -match $CountPattern }).Count
        $hasCount = $true
        $label = $CountLabel
        if ([string]::IsNullOrWhiteSpace($label)) { $label = 'count' }
        $counts = ("{0}:{1}" -f $label, $countValue)
    }

    $statusInfo = Get-StepStatus -ExitCode $code -Summary $summary -ExpectSummary:$ExpectSummary
    $status = $statusInfo.Status
    $reason = $statusInfo.Reason

    if ($status -eq 'PASS' -and -not [string]::IsNullOrWhiteSpace($FailPattern)) {
        $matched = @($logLines | Where-Object { $_ -match $FailPattern })
        if ($matched.Count -gt 0) {
            $status = 'FAIL'
            $reason = ("matched {0}" -f $FailPattern)
        }
    }

    if ($status -eq 'PASS' -and $hasCount -and $MaxCount -ge 0 -and $countValue -gt $MaxCount) {
        $status = 'FAIL'
        $reason = ("{0} {1} > {2}" -f $CountLabel, $countValue, $MaxCount)
    }

    $failureLines = @()
    if ($status -eq 'FAIL') {
        if ($ExpectSummary) {
            $names = @(Get-FailingTestNames -Lines $logLines)
            if ($names.Count -gt 0) {
                foreach ($n in $names) { $failureLines += ("STEP {0}: {1}" -f $Name, $n) }
            }
        }
        if ($failureLines.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($FailPattern)) {
            $matched = @($logLines | Where-Object { $_ -match $FailPattern } | Select-Object -First 5)
            foreach ($m in $matched) { $failureLines += ("STEP {0}: {1}" -f $Name, ([string]$m).Trim()) }
        }
        if ($failureLines.Count -eq 0) {
            $tail = @($logLines | Where-Object { ([string]$_).Trim().Length -gt 0 } | Select-Object -Last 5)
            foreach ($t in $tail) { $failureLines += ("STEP {0}: {1}" -f $Name, ([string]$t).Trim()) }
        }
        if ($failureLines.Count -eq 0) {
            $fallback = $reason
            if ([string]::IsNullOrWhiteSpace($fallback)) { $fallback = 'failed' }
            $failureLines += ("STEP {0}: {1}" -f $Name, $fallback)
        }
    }

    return [pscustomobject]@{
        Result = [pscustomobject]@{
            Step   = $Name
            Status = $status
            Counts = $counts
        }
        Failures = @($failureLines)
    }
}

function Format-VerifyReport {
    param(
        $Results,
        $Failures
    )
    $resultRows = @($Results)
    $failureRows = @($Failures)
    $table = ($resultRows | Format-Table -AutoSize | Out-String -Width 250).TrimEnd()
    $banner = [string](Get-FinalBanner -Results $resultRows)
    $parts = @()
    $parts += $table
    $parts += ''
    $parts += $banner
    if ($failureRows.Count -gt 0) {
        $parts += ''
        $parts += '=== FAILURE DETAILS ==='
        foreach ($f in $failureRows) { $parts += [string]$f }
    }
    return ($parts -join [Environment]::NewLine)
}
