param(
    [switch]$Fast,
    [switch]$SelfTest
)

$ErrorActionPreference = "Continue"
$lib = Join-Path $PSScriptRoot "verify-frontend.lib.ps1"
. $lib

if ($SelfTest) {
    $selfTestPath = Join-Path $PSScriptRoot "verify-frontend.selftest.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $selfTestPath 2>&1
    $stCode = $LASTEXITCODE
    exit $stCode
}

# Guard: refuse to start if another vitest process exists
try {
    $vitestProcs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -match 'vitest'
    })
    if ($vitestProcs.Count -gt 0) {
        Write-Output "REFUSING TO START: another vitest process is running (exit 99)."
        foreach ($vp in $vitestProcs) {
            Write-Output ("PID={0} CMD={1}" -f $vp.ProcessId, $vp.CommandLine)
        }
        exit 99
    }
} catch {
    Write-Output "REFUSING TO START: could not check for existing vitest processes (exit 99)."
    Write-Output $_.Exception.Message
    exit 99
}

$root = Split-Path -Parent $PSScriptRoot
$temp = $env:TEMP
$results = @()
$allFailures = @()

# Clear tsbuildinfo
Remove-Item "$root\apps\storefront\tsconfig.tsbuildinfo" -ErrorAction SilentlyContinue
Remove-Item "$root\apps\storefront\node_modules\.tmp\*.tsbuildinfo" -ErrorAction SilentlyContinue

# tsc-b
$r = Invoke-VerifyStep -Name 'tsc-b' -Command { npx tsc -b } -LogPath (Join-Path $temp 'vf_tsc.txt') -WorkDir (Join-Path $root 'apps\storefront') -FailPattern 'error TS' -CountPattern 'error TS' -MaxCount 0 -CountLabel 'errors'
$results += $r.Result
$allFailures += $r.Failures

# storefront vitest
$r = Invoke-VerifyStep -Name 'storefront-vitest' -Command { npx vitest run } -LogPath (Join-Path $temp 'vf_sf.txt') -WorkDir (Join-Path $root 'apps\storefront') -ExpectSummary
$results += $r.Result
$allFailures += $r.Failures

# api-client vitest
$r = Invoke-VerifyStep -Name 'api-client-vitest' -Command { npx vitest run } -LogPath (Join-Path $temp 'vf_ac.txt') -WorkDir (Join-Path $root 'packages\api-client') -ExpectSummary
$results += $r.Result
$allFailures += $r.Failures

# ui vitest
$r = Invoke-VerifyStep -Name 'ui-vitest' -Command { npx vitest run } -LogPath (Join-Path $temp 'vf_ui.txt') -WorkDir (Join-Path $root 'packages\ui') -ExpectSummary
$results += $r.Result
$allFailures += $r.Failures

if (-not $Fast) {
    # storefront build
    $r = Invoke-VerifyStep -Name 'storefront-build' -Command { npm --workspace storefront-app run build } -LogPath (Join-Path $temp 'vf_sfb.txt') -WorkDir $root
    $results += $r.Result
    $allFailures += $r.Failures

    # admin build
    $r = Invoke-VerifyStep -Name 'admin-build' -Command { npm --workspace admin-app run build } -LogPath (Join-Path $temp 'vf_ab.txt') -WorkDir $root
    $results += $r.Result
    $allFailures += $r.Failures
} else {
    Write-Output "FAST MODE: storefront-build, admin-build, prerender, check-built-css are SKIPPED."
    $results += [pscustomobject]@{ Step = 'storefront-build'; Status = 'SKIPPED'; Counts = '(Fast)' }
    $results += [pscustomobject]@{ Step = 'admin-build'; Status = 'SKIPPED'; Counts = '(Fast)' }
}

# prerender
if (-not $Fast) {
    $buildClientDir = Join-Path $root 'apps\storefront\build\client'
    $pr = Test-PrerenderOutput -BuildClientDir $buildClientDir
    $prCounts = 'index.html,shop/index.html,services/index.html,login/index.html,register/index.html,__spa-fallback.html'
    $results += [pscustomobject]@{ Step = 'prerender'; Status = $pr.Status; Counts = $prCounts }
    if ($pr.Status -eq 'FAIL') {
        $pLines = @($pr.Problems | ForEach-Object { [string]$_ })
        if ($pLines.Count -eq 0) { $pLines = @('unknown prerender failure') }
        foreach ($p in $pLines) { $allFailures += @("STEP prerender: $p") }
    }
} else {
    $results += [pscustomobject]@{ Step = 'prerender'; Status = 'SKIPPED'; Counts = '(Fast)' }
}

# check-built-css
if (-not $Fast) {
    $sfCss = $null
    $adCss = $null
    $sfCssItem = Get-ChildItem -Path (Join-Path $root 'apps\storefront\build\client\assets') -Filter 'root-*.css' -ErrorAction SilentlyContinue | Select-Object -First 1
    $adCssItem = Get-ChildItem -Path (Join-Path $root 'apps\admin\dist\assets') -Filter 'index-*.css' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($sfCssItem) { $sfCss = $sfCssItem.FullName }
    if ($adCssItem) { $adCss = $adCssItem.FullName }

    $sfLog = Join-Path $temp 'vf_css_sf.txt'
    $adLog = Join-Path $temp 'vf_css_ad.txt'
    $sfExit = $null
    $adExit = $null

    if ($sfCss) {
        Push-Location $root
        $global:LASTEXITCODE = 0
        & node scripts/check-built-css.mjs $sfCss 2>&1 | Out-File -FilePath $sfLog -Encoding utf8
        $sfExit = $LASTEXITCODE
        Pop-Location
    } else {
        'storefront css not found' | Out-File -FilePath $sfLog -Encoding utf8
        $sfExit = $null
    }

    if ($adCss) {
        Push-Location $root
        $global:LASTEXITCODE = 0
        & node scripts/check-built-css.mjs $adCss 2>&1 | Out-File -FilePath $adLog -Encoding utf8
        $adExit = $LASTEXITCODE
        Pop-Location
    } else {
        'admin css not found' | Out-File -FilePath $adLog -Encoding utf8
        $adExit = $null
    }

    $cssStatus = Get-CssStepStatus -StorefrontCssPath $sfCss -AdminCssPath $adCss -StorefrontExit $sfExit -AdminExit $adExit
    $sfCssLines = @()
    $adCssLines = @()
    if (Test-Path -LiteralPath $sfLog) { $sfCssLines = @(Get-Content -LiteralPath $sfLog -Encoding UTF8) }
    if (Test-Path -LiteralPath $adLog) { $adCssLines = @(Get-Content -LiteralPath $adLog -Encoding UTF8) }
    $sfLast = ''
    $adLast = ''
    for ($i = $sfCssLines.Count - 1; $i -ge 0; $i--) { $t = ([string]$sfCssLines[$i]).Trim(); if ($t.Length -gt 0) { $sfLast = $t; break } }
    for ($i = $adCssLines.Count - 1; $i -ge 0; $i--) { $t = ([string]$adCssLines[$i]).Trim(); if ($t.Length -gt 0) { $adLast = $t; break } }
    $cssCounts = ("sf={0} | ad={1}" -f $sfLast, $adLast)
    $results += [pscustomobject]@{ Step = 'check-built-css'; Status = $cssStatus.Status; Counts = $cssCounts }
    if ($cssStatus.Status -eq 'FAIL') {
        $cLines = @()
        foreach ($p in @($cssStatus.Problems)) { $cLines += [string]$p }
        if ($sfLast) { $cLines += ("sf: " + $sfLast) }
        if ($adLast) { $cLines += ("ad: " + $adLast) }
        foreach ($c in $cLines) { $allFailures += @("STEP check-built-css: $c") }
    }
} else {
    $results += [pscustomobject]@{ Step = 'check-built-css'; Status = 'SKIPPED'; Counts = '(Fast)' }
}

# lint
$r = Invoke-VerifyStep -Name 'lint' -Command { npm --workspace storefront-app run lint } -LogPath (Join-Path $temp 'vf_lint.txt') -WorkDir $root -CountPattern ': warning ' -MaxCount 10 -CountLabel 'warnings'
$results += $r.Result
$allFailures += $r.Failures

Write-Output (Format-VerifyReport -Results $results -Failures $allFailures)

$failCount = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
exit $failCount
