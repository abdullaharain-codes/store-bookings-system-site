$ErrorActionPreference = "Continue"
$lib = Join-Path $PSScriptRoot "verify-frontend.lib.ps1"
. $lib

$script:pass = 0
$script:fail = 0

function Record {
    param([string]$Name, [bool]$Ok, [string]$Detail)
    if ($Ok) {
        $script:pass++
        Write-Output ("PASS {0}" -f $Name)
    } else {
        $script:fail++
        Write-Output ("FAIL {0} :: {1}" -f $Name, $Detail)
    }
}

function Has-Function {
    param([string]$Name)
    return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

# Fixture: real lines from $env:TEMP\su2-B-default-1.err.txt and su2-B-default-1.txt
# Non-ASCII box characters were excluded; FAIL, message, summary, and passing-like lines kept as real ASCII content.
$fixtureFailLines = @(
    ' FAIL  app/routes/_index.test.tsx > home Shop by Category band > renders API categories as real links to their listing pages',
    'Error: Test timed out in 10000ms.',
    'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
    ' ? app/routes/_index.test.tsx:224:3',
    '    222|',
    '    223| describe("home Shop by Category band", () => {',
    '    224|   it("renders API categories as real links to their listing pages", as.',
    '       |   ^',
    '    225|     useCategories([',
    '    226|       makeCategory(1, { name: "Laptops", slug: "laptops" }),',
    '',
    ' FAIL  app/test/checkout.flow.test.tsx > checkout flow > an authenticated user checks out and lands on the order page with the badge emptied',
    'Error: Test timed out in 10000ms.',
    'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
    ' ? app/test/checkout.flow.test.tsx:126:3',
    '    124|   });',
    '    125|',
    '    126|   it("an authenticated user checks out and lands on the order page wit.',
    '       |   ^',
    '    127|     // One line already in the cart (the add-to-cart step is B4-1a''s f.',
    '    128|     setCartItemsSource([',
    '',
    ' FAIL  app/test/profile.flow.test.tsx > profile flow > sign in -> hub -> Profile link -> edit name -> see announcement -> change password',
    'Error: Test timed out in 10000ms.',
    'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
    ' ? app/test/profile.flow.test.tsx:47:3',
    '     45|   });',
    '     46|',
    '     47|   it("sign in -> hub -> Profile link -> edit name -> see announcement .',
    '       |   ^',
    '     48|     session.start();',
    '     49|     const user = userEvent.setup();'
)

$fixtureSummaryFail = @(
    ' Test Files  6 failed | 40 passed (46)',
    '      Tests  7 failed | 447 passed (454)',
    '   Start at  02:52:42',
    '   Duration  50.99s (tests 57%, transform 13%, import 11%, environment 10%, setup 9%)'
)

$fixtureSummaryClean = @(
    ' Test Files  46 passed (46)',
    '      Tests  454 passed (454)',
    '   Start at  02:52:42',
    '   Duration  33.77s (transform 1.20s, setup 5.10s, import 8.30s, tests 20.10s, environment 12.00s)'
)

$fixturePassingFileLines = @(
    ' ? app/components/a/A.test.tsx (35 tests) 13663ms',
    ' ? app/components/b/B.test.tsx (12 tests) 4200ms',
    ' ? app/components/c/C.test.tsx (8 tests) 3100ms',
    ' ? app/routes/d.test.tsx (20 tests) 9000ms',
    ' ? app/test/e.flow.test.tsx (5 tests) 2500ms'
)

# T1
if (-not (Has-Function 'Get-FailingTestNames')) {
    Record 'T1' $false 'Get-FailingTestNames missing'
} else {
    try {
        $r = @(Get-FailingTestNames -Lines $fixtureFailLines)
        $ok = ($r.Count -eq 3)
        if ($ok) {
            foreach ($item in $r) {
                if ($item -notmatch '^.+ > .+ :: .+$') { $ok = $false; break }
            }
        }
        Record 'T1' $ok ("count={0}; items={1}" -f $r.Count, ($r -join ' || '))
    } catch {
        Record 'T1' $false ("exception: " + $_.Exception.Message)
    }
}

# T2
if (-not (Has-Function 'Get-FailingTestNames')) {
    Record 'T2' $false 'Get-FailingTestNames missing'
} else {
    try {
        $doubled = @($fixtureFailLines + $fixtureFailLines)
        $r = @(Get-FailingTestNames -Lines $doubled)
        $ok = ($r.Count -eq 3)
        Record 'T2' $ok ("count={0}; items={1}" -f $r.Count, ($r -join ' || '))
    } catch {
        Record 'T2' $false ("exception: " + $_.Exception.Message)
    }
}

# T3
if (-not (Has-Function 'Get-FailingTestNames')) {
    Record 'T3' $false 'Get-FailingTestNames missing'
} else {
    try {
        $log = @($fixturePassingFileLines + $fixtureSummaryClean)
        $r = @(Get-FailingTestNames -Lines $log)
        $ok = ($r.Count -eq 0)
        Record 'T3' $ok ("count={0}; items={1}" -f $r.Count, ($r -join ' || '))
    } catch {
        Record 'T3' $false ("exception: " + $_.Exception.Message)
    }
}

# T4
if (-not (Has-Function 'Get-VitestSummary')) {
    Record 'T4' $false 'Get-VitestSummary missing'
} else {
    try {
        $failSum = Get-VitestSummary -Lines $fixtureSummaryFail
        $cleanSum = Get-VitestSummary -Lines $fixtureSummaryClean
        $nullSum = Get-VitestSummary -Lines @('no tests here', 'just text')
        $ok = ($null -ne $failSum) -and ($failSum.FailedCount -eq 7) -and ($null -ne $cleanSum) -and ($cleanSum.FailedCount -eq 0) -and ($null -eq $nullSum)
        $failVal = 'null'
        $cleanVal = 'null'
        $nullVal = 'notnull'
        if ($failSum) { $failVal = [string]$failSum.FailedCount }
        if ($cleanSum) { $cleanVal = [string]$cleanSum.FailedCount }
        if ($null -eq $nullSum) { $nullVal = 'null' }
        $detail = "fail=$failVal clean=$cleanVal null=$nullVal"
        Record 'T4' $ok $detail
    } catch {
        Record 'T4' $false ("exception: " + $_.Exception.Message)
    }
}

# T5
if (-not (Has-Function 'Get-StepStatus')) {
    Record 'T5' $false 'Get-StepStatus missing'
} else {
    try {
        $cleanSum = Get-VitestSummary -Lines $fixtureSummaryClean
        $failSum = Get-VitestSummary -Lines $fixtureSummaryFail
        $s1 = Get-StepStatus -ExitCode 0 -Summary $cleanSum -ExpectSummary
        $s2 = Get-StepStatus -ExitCode 0 -Summary $failSum -ExpectSummary
        $s3 = Get-StepStatus -ExitCode $null -Summary $cleanSum -ExpectSummary
        $s4 = Get-StepStatus -ExitCode 1 -Summary $null
        $ok = ($s1.Status -eq 'PASS') -and ($s2.Status -eq 'FAIL') -and ($s3.Status -eq 'FAIL') -and ($s4.Status -eq 'FAIL')
        $detail = "s1={0} s2={1} s3={2} s4={3}" -f $s1.Status,$s2.Status,$s3.Status,$s4.Status
        Record 'T5' $ok $detail
    } catch {
        Record 'T5' $false ("exception: " + $_.Exception.Message)
    }
}

# T6
if (-not (Has-Function 'Get-FinalBanner')) {
    Record 'T6' $false 'Get-FinalBanner missing'
} else {
    try {
        $resultsFail = @(
            [pscustomobject]@{ Step = 'tsc-b'; Status = 'FAIL' },
            [pscustomobject]@{ Step = 'storefront-vitest'; Status = 'PASS' }
        )
        $resultsPass = @(
            [pscustomobject]@{ Step = 'tsc-b'; Status = 'PASS' },
            [pscustomobject]@{ Step = 'storefront-vitest'; Status = 'PASS' }
        )
        $bFail = [string](Get-FinalBanner -Results $resultsFail)
        $bPass = [string](Get-FinalBanner -Results $resultsPass)
        $ok = ($bFail -notmatch 'NO FAILING') -and ($bFail -match 'FAILED STEPS') -and ($bPass -match 'ALL STEPS PASS')
        Record 'T6' $ok ("failBanner={0} | passBanner={1}" -f $bFail, $bPass)
    } catch {
        Record 'T6' $false ("exception: " + $_.Exception.Message)
    }
}

# T7
if (-not (Has-Function 'Test-PrerenderOutput')) {
    Record 'T7' $false 'Test-PrerenderOutput missing'
} else {
    $tmpRoot = Join-Path $env:TEMP ("vf_prerender_" + [guid]::NewGuid().ToString())
    try {
        New-Item -ItemType Directory -Force -Path (Join-Path $tmpRoot 'shop') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $tmpRoot 'services') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $tmpRoot 'login') | Out-Null
        New-Item -ItemType Directory -Force -Path (Join-Path $tmpRoot 'register') | Out-Null
        $files = @{
            'index.html' = '<html><head><title>Home</title></head></html>'
            'shop\index.html' = '<html><head><title>Shop</title></head></html>'
            'services\index.html' = '<html><head><title>Services</title></head></html>'
            'login\index.html' = '<html><head><title>Login</title></head></html>'
            'register\index.html' = '<html><head><title>Register</title></head></html>'
            '__spa-fallback.html' = '<html><body>fallback</body></html>'
        }
        foreach ($k in $files.Keys) {
            $p = Join-Path $tmpRoot $k
            [IO.File]::WriteAllText($p, $files[$k], [System.Text.UTF8Encoding]::new($false))
        }
        $r1 = Test-PrerenderOutput -BuildClientDir $tmpRoot
        $ok1 = ($r1.Status -eq 'PASS')

        Remove-Item (Join-Path $tmpRoot 'shop\index.html') -Force
        $r2 = Test-PrerenderOutput -BuildClientDir $tmpRoot
        $ok2 = ($r2.Status -eq 'FAIL') -and ((($r2.Problems -join ' ') -match 'shop'))

        [IO.File]::WriteAllText((Join-Path $tmpRoot 'shop\index.html'), '<html><head><title>Shop</title></head></html>', [System.Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $tmpRoot 'login\index.html'), '<html><head><title></title></head></html>', [System.Text.UTF8Encoding]::new($false))
        $r3 = Test-PrerenderOutput -BuildClientDir $tmpRoot
        $ok3 = ($r3.Status -eq 'FAIL') -and ((($r3.Problems -join ' ') -match 'login'))

        [IO.File]::WriteAllText((Join-Path $tmpRoot 'login\index.html'), '<html><head><title>Login</title></head></html>', [System.Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $tmpRoot 'register\index.html'), '', [System.Text.UTF8Encoding]::new($false))
        $r4 = Test-PrerenderOutput -BuildClientDir $tmpRoot
        $ok4 = ($r4.Status -eq 'FAIL') -and ((($r4.Problems -join ' ') -match 'register'))

        $ok = $ok1 -and $ok2 -and $ok3 -and $ok4
        Record 'T7' $ok ("ok1={0} ok2={1} ok3={2} ok4={3} p2={4} p3={5} p4={6}" -f $ok1,$ok2,$ok3,$ok4,($r2.Problems -join '|'),($r3.Problems -join '|'),($r4.Problems -join '|'))
    } catch {
        Record 'T7' $false ("exception: " + $_.Exception.Message)
    } finally {
        if (Test-Path $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# T8
if (-not (Has-Function 'Get-CssStepStatus')) {
    Record 'T8' $false 'Get-CssStepStatus missing'
} else {
    try {
        $tmpCss = Join-Path $env:TEMP ("vf_css_" + [guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Force -Path $tmpCss | Out-Null
        $sf = Join-Path $tmpCss 'root.css'
        $ad = Join-Path $tmpCss 'index.css'
        [IO.File]::WriteAllText($sf, 'body{}', [System.Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText($ad, 'body{}', [System.Text.UTF8Encoding]::new($false))
        $r1 = Get-CssStepStatus -StorefrontCssPath $null -AdminCssPath $ad -StorefrontExit 0 -AdminExit 0
        $r2 = Get-CssStepStatus -StorefrontCssPath $sf -AdminCssPath $ad -StorefrontExit 0 -AdminExit 0
        $r3 = Get-CssStepStatus -StorefrontCssPath $sf -AdminCssPath $ad -StorefrontExit 1 -AdminExit 0
        $ok = ($r1.Status -eq 'FAIL') -and ($r2.Status -eq 'PASS') -and ($r3.Status -eq 'FAIL')
        Record 'T8' $ok ("r1={0} r2={1} r3={2}" -f $r1.Status,$r2.Status,$r3.Status)
        Remove-Item -LiteralPath $tmpCss -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Record 'T8' $false ("exception: " + $_.Exception.Message)
    }
}

# T9
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T9' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log = Join-Path $env:TEMP ("vf_t9_" + [guid]::NewGuid().ToString() + ".txt")
        $r = Invoke-VerifyStep -Name 't9' -Command { cmd /c exit 3 } -LogPath $log
        $failures = @($r.Failures)
        $allPrefixed = ($failures.Count -gt 0)
        foreach ($f in @($failures)) { if ($f -notmatch '^STEP t9: ') { $allPrefixed = $false } }
        $ok = ($r.Result.Status -eq 'FAIL') -and ($failures.Count -gt 0) -and $allPrefixed
        Record 'T9' $ok ("status={0} failures={1}" -f $r.Result.Status, ($failures -join ' || '))
        Remove-Item $log -ErrorAction SilentlyContinue
    } catch {
        Record 'T9' $false ("exception: " + $_.Exception.Message)
    }
}

# T10
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T10' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log = Join-Path $env:TEMP ("vf_t10_" + [guid]::NewGuid().ToString() + ".txt")
        $r = Invoke-VerifyStep -Name 't10' -ExpectSummary -Command { Write-Output ' Test Files  1 passed (1)'; Write-Output '      Tests  2 passed (2)' } -LogPath $log
        $failures = @($r.Failures)
        $ok = ($r.Result.Status -eq 'PASS') -and ($r.Result.Counts -match 'Test Files  1 passed \(1\)') -and ($r.Result.Counts -match 'Tests  2 passed \(2\)') -and ($failures.Count -eq 0)
        Record 'T10' $ok ("status={0} counts={1} failures={2}" -f $r.Result.Status, $r.Result.Counts, $failures.Count)
        Remove-Item $log -ErrorAction SilentlyContinue
    } catch {
        Record 'T10' $false ("exception: " + $_.Exception.Message)
    }
}

# T11
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T11' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log = Join-Path $env:TEMP ("vf_t11_" + [guid]::NewGuid().ToString() + ".txt")
        $r = Invoke-VerifyStep -Name 't11' -ExpectSummary -Command { Write-Output ' FAIL  app/x.test.tsx > suite > case'; Write-Output 'Error: boom'; Write-Output '      Tests  1 failed | 1 passed (2)'; cmd /c exit 1 } -LogPath $log
        $failures = @($r.Failures)
        $joined = $failures -join ' || '
        $ok = ($r.Result.Status -eq 'FAIL') -and ($joined -match 'app/x\.test\.tsx > suite > case') -and ($joined -match 'boom')
        Record 'T11' $ok ("status={0} failures={1}" -f $r.Result.Status, $joined)
        Remove-Item $log -ErrorAction SilentlyContinue
    } catch {
        Record 'T11' $false ("exception: " + $_.Exception.Message)
    }
}

# T12
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T12' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log = Join-Path $env:TEMP ("vf_t12_" + [guid]::NewGuid().ToString() + ".txt")
        $r = Invoke-VerifyStep -Name 't12' -ExpectSummary -Command { Write-Output ' Test Files  1 failed (1)'; Write-Output '      Tests  1 failed | 1 passed (2)' } -LogPath $log
        $ok = ($r.Result.Status -eq 'FAIL')
        Record 'T12' $ok ("status={0}" -f $r.Result.Status)
        Remove-Item $log -ErrorAction SilentlyContinue
    } catch {
        Record 'T12' $false ("exception: " + $_.Exception.Message)
    }
}

# T13
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T13' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log = Join-Path $env:TEMP ("vf_t13_" + [guid]::NewGuid().ToString() + ".txt")
        $r = Invoke-VerifyStep -Name 't13' -FailPattern 'error TS' -Command { Write-Output 'src/a.ts(1,1): error TS2322: bad' } -LogPath $log
        $failures = @($r.Failures)
        $joined = $failures -join ' || '
        $ok = ($r.Result.Status -eq 'FAIL') -and ($joined -match 'error TS2322')
        Record 'T13' $ok ("status={0} failures={1}" -f $r.Result.Status, $joined)
        Remove-Item $log -ErrorAction SilentlyContinue
    } catch {
        Record 'T13' $false ("exception: " + $_.Exception.Message)
    }
}

# T14
if (-not (Has-Function 'Invoke-VerifyStep')) {
    Record 'T14' $false 'Invoke-VerifyStep missing'
} else {
    try {
        $log11 = Join-Path $env:TEMP ("vf_t14a_" + [guid]::NewGuid().ToString() + ".txt")
        $log10 = Join-Path $env:TEMP ("vf_t14b_" + [guid]::NewGuid().ToString() + ".txt")
        $r11 = Invoke-VerifyStep -Name 't14a' -CountPattern ': warning ' -MaxCount 10 -CountLabel 'warnings' -Command { 1..11 | ForEach-Object { Write-Output ("file.ts:1:1: warning W{0}" -f $_) } } -LogPath $log11
        $r10 = Invoke-VerifyStep -Name 't14b' -CountPattern ': warning ' -MaxCount 10 -CountLabel 'warnings' -Command { 1..10 | ForEach-Object { Write-Output ("file.ts:1:1: warning W{0}" -f $_) } } -LogPath $log10
        $ok = ($r11.Result.Status -eq 'FAIL') -and ($r11.Result.Counts -eq 'warnings:11') -and ($r10.Result.Status -eq 'PASS')
        Record 'T14' $ok ("r11={0}/{1} r10={2}/{3}" -f $r11.Result.Status,$r11.Result.Counts,$r10.Result.Status,$r10.Result.Counts)
        Remove-Item $log11 -ErrorAction SilentlyContinue
        Remove-Item $log10 -ErrorAction SilentlyContinue
    } catch {
        Record 'T14' $false ("exception: " + $_.Exception.Message)
    }
}

# T15
if (-not (Has-Function 'Format-VerifyReport')) {
    Record 'T15' $false 'Format-VerifyReport missing'
} else {
    try {
        $longCounts = ('A' * 150)
        $results = @(
            [pscustomobject]@{ Step = 'tsc-b'; Status = 'FAIL'; Counts = 'errors:1' },
            [pscustomobject]@{ Step = 'storefront-vitest'; Status = 'PASS'; Counts = $longCounts }
        )
        $failures = @('STEP tsc-b: error TS1')
        $report = [string](Format-VerifyReport -Results $results -Failures $failures)
        $ok1 = ($report -match 'FAILED STEPS: tsc-b') -and ($report -match '=== FAILURE DETAILS ===') -and ($report -match 'STEP tsc-b: error TS1') -and ($report.Contains($longCounts)) -and ($report -notmatch '\.\.\.')
        $report2 = [string](Format-VerifyReport -Results @([pscustomobject]@{ Step='x'; Status='PASS'; Counts='' }) -Failures @())
        $ok2 = ($report2 -match 'ALL STEPS PASS') -and ($report2 -notmatch 'FAILURE DETAILS')
        Record 'T15' ($ok1 -and $ok2) ("ok1={0} ok2={1} hasLong={2} hasDots={3}" -f $ok1,$ok2,$report.Contains($longCounts),([bool]($report -match '\.\.\.')))
    } catch {
        Record 'T15' $false ("exception: " + $_.Exception.Message)
    }
}

# T16
if (-not (Has-Function 'Get-FinalBanner')) {
    Record 'T16' $false 'Get-FinalBanner missing'
} else {
    try {
        $resultsSkipped = @(
            [pscustomobject]@{ Step = 'a'; Status = 'PASS' },
            [pscustomobject]@{ Step = 'b'; Status = 'SKIPPED' },
            [pscustomobject]@{ Step = 'c'; Status = 'SKIPPED' }
        )
        $resultsNoSkip = @(
            [pscustomobject]@{ Step = 'a'; Status = 'PASS' },
            [pscustomobject]@{ Step = 'b'; Status = 'PASS' }
        )
        $b1 = [string](Get-FinalBanner -Results $resultsSkipped)
        $b2 = [string](Get-FinalBanner -Results $resultsNoSkip)
        $ok = ($b1 -match 'ALL RUN STEPS PASS') -and ($b1 -match '2 skipped') -and ($b2 -eq 'ALL STEPS PASS')
        Record 'T16' $ok ("b1={0} | b2={1}" -f $b1,$b2)
    } catch {
        Record 'T16' $false ("exception: " + $_.Exception.Message)
    }
}

# T17
try {
    $vfPath = Join-Path $PSScriptRoot 'verify-frontend.ps1'
    $libPath = Join-Path $PSScriptRoot 'verify-frontend.lib.ps1'
    $errors = @()
    $tokens = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($vfPath, [ref]$tokens, [ref]$errors)
    $funcs = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
    $badVf = @()
    foreach ($fn in $funcs) {
        $assigns = $fn.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true)
        foreach ($a in $assigns) {
            $left = $a.Left.Extent.Text
            if ($left -match '\$allFailures\b' -or $left -match '\$results\b') {
                $badVf += ("{0}:{1}" -f $fn.Name, $left)
            }
        }
    }
    $tokens2 = $null
    $errors2 = @()
    $ast2 = [System.Management.Automation.Language.Parser]::ParseFile($libPath, [ref]$tokens2, [ref]$errors2)
    $funcs2 = $ast2.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
    $badLib = @()
    foreach ($fn in $funcs2) {
        $assigns = $fn.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true)
        foreach ($a in $assigns) {
            $left = $a.Left.Extent.Text
            if ($left -match '\$allFailures\b' -or $left -match '\$results\b') {
                $badLib += ("{0}:{1}" -f $fn.Name, $left)
            }
        }
    }
    $ok = ($badVf.Count -eq 0) -and ($badLib.Count -eq 0)
    Record 'T17' $ok ("vf={0} lib={1}" -f ($badVf -join '|'), ($badLib -join '|'))
} catch {
    Record 'T17' $false ("exception: " + $_.Exception.Message)
}

Write-Output ("TOTAL {0} PASS {1} FAIL {2}" -f ($script:pass + $script:fail), $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
