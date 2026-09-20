<?php

use App\Models\SlotHold;
use App\Models\User;
use App\Modules\Scheduling\Exceptions\SchedulingValidationException;
use App\Modules\Scheduling\Services\SlotHoldService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function holdService(): SlotHoldService
{
    return app(SlotHoldService::class);
}

function setHoldSetting(string $key, string $value): void
{
    DB::table('business_settings')->where('key', $key)->update(['value' => $value]);
}

/**
 * The fixed window every boundary test hangs a hold on (half-open interval):
 * 2026-10-05 10:00:00 … 11:00:00.
 */
function existingWindow(?int $userId = null): SlotHold
{
    return SlotHold::factory()
        ->window('2026-10-05 10:00:00', '2026-10-05 11:00:00')
        ->when($userId !== null, fn ($factory) => $factory->heldBy($userId))
        ->create();
}

function windowFree(Carbon $startsAt, Carbon $endsAt): bool
{
    return holdService()->isWindowFree($startsAt, $endsAt);
}

afterEach(function () {
    Carbon::setTestNow();
});

// ─── Half-open interval overlap boundaries ───────────────────────────────────
// Two windows [a.start, a.end) and [b.start, b.end) overlap iff
// a.start < b.end AND b.start < a.end. These tests pin the boundary cases.

test('exact-match windows overlap', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 11:00:00')))
        ->toBeFalse();
});

test('partial overlap — request starts inside the held window', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 10:30:00'), Carbon::parse('2026-10-05 11:30:00')))
        ->toBeFalse();
});

test('partial overlap — request ends inside the held window', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 09:30:00'), Carbon::parse('2026-10-05 10:30:00')))
        ->toBeFalse();
});

test('one window fully containing the other overlaps', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 09:00:00'), Carbon::parse('2026-10-05 12:00:00')))
        ->toBeFalse();
});

test('adjacent-touching windows do NOT overlap — request starts exactly when hold ends', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 11:00:00'), Carbon::parse('2026-10-05 12:00:00')))
        ->toBeTrue();
});

test('adjacent-touching windows do NOT overlap — request ends exactly when hold starts', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 09:00:00'), Carbon::parse('2026-10-05 10:00:00')))
        ->toBeTrue();
});

test('fully-disjoint windows do not overlap', function () {
    existingWindow();

    expect(windowFree(Carbon::parse('2026-10-05 11:30:00'), Carbon::parse('2026-10-05 12:30:00')))
        ->toBeTrue();
});

test('isWindowFree is true when no hold exists at all', function () {
    expect(windowFree(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 11:00:00')))
        ->toBeTrue();
});

// ─── attemptHold behaviour ───────────────────────────────────────────────────

test('attemptHold throws the scheduling exception on an active overlap', function () {
    existingWindow();

    holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
    );
})->throws(SchedulingValidationException::class, 'no longer available');

test('attemptHold on an overlapping window creates no hold row', function () {
    existingWindow();

    try {
        holdService()->attemptHold(
            Carbon::parse('2026-10-05 10:00:00'),
            Carbon::parse('2026-10-05 11:00:00'),
        );
    } catch (SchedulingValidationException) {
        // expected
    }

    expect(SlotHold::query()->count())->toBe(1);
});

test('expired overlapping holds never block attemptHold', function () {
    SlotHold::factory()
        ->window('2026-10-05 10:00:00', '2026-10-05 11:00:00')
        ->expired()
        ->create();

    $hold = holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
    );

    expect($hold->exists)->toBeTrue();
    expect(SlotHold::query()->count())->toBe(2);
});

test('releaseHold makes an occupied window immediately available', function () {
    $hold = holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
    );

    expect(windowFree(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 11:00:00')))
        ->toBeFalse();

    holdService()->releaseHold($hold);

    expect(windowFree(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 11:00:00')))
        ->toBeTrue();
});

test('attemptHold stores the window and an expires_at of now + slot_hold_minutes', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setHoldSetting('slot_hold_minutes', '25');

    $hold = holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
    );

    expect($hold->starts_at->format('Y-m-d H:i:s'))->toBe('2026-10-05 10:00:00');
    expect($hold->ends_at->format('Y-m-d H:i:s'))->toBe('2026-10-05 11:00:00');
    expect($hold->expires_at->format('Y-m-d H:i:s'))->toBe('2026-09-19 08:25:00');
});

test('attemptHold persists the user when provided and allows null by design', function () {
    $user = User::factory()->create();

    $owned = holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
        userId: $user->id,
    );

    $anon = holdService()->attemptHold(
        Carbon::parse('2026-10-06 10:00:00'),
        Carbon::parse('2026-10-06 11:00:00'),
    );

    expect($owned->held_by_user_id)->toBe($user->id);
    expect($anon->held_by_user_id)->toBeNull();
    expect($owned->id)->not->toBe($anon->id);
});

// ─── Defensive window invariant ──────────────────────────────────────────────
// startsAt >= endsAt is a programmer error: it must throw before any query and
// must never produce a hold row.

test('attemptHold with an equal start and end throws InvalidArgumentException and creates no row', function () {
    holdService()->attemptHold(
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 10:00:00'),
    );
})->throws(InvalidArgumentException::class);

test('attemptHold with inverted start and end throws InvalidArgumentException and creates no row', function () {
    holdService()->attemptHold(
        Carbon::parse('2026-10-05 11:00:00'),
        Carbon::parse('2026-10-05 10:00:00'),
    );
})->throws(InvalidArgumentException::class);

test('isWindowFree with an equal start and end throws InvalidArgumentException', function () {
    windowFree(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 10:00:00'));
})->throws(InvalidArgumentException::class);

test('isWindowFree with inverted start and end throws InvalidArgumentException', function () {
    windowFree(Carbon::parse('2026-10-05 11:00:00'), Carbon::parse('2026-10-05 10:00:00'));
})->throws(InvalidArgumentException::class);

test('failing window guards leave the slot_holds table empty', function () {
    try {
        holdService()->attemptHold(Carbon::parse('2026-10-05 10:00:00'), Carbon::parse('2026-10-05 10:00:00'));
    } catch (InvalidArgumentException) {
        // expected
    }

    try {
        holdService()->attemptHold(Carbon::parse('2026-10-05 11:00:00'), Carbon::parse('2026-10-05 10:00:00'));
    } catch (InvalidArgumentException) {
        // expected
    }

    expect(SlotHold::query()->count())->toBe(0);
});

// ─── Genuine concurrent attempt ──────────────────────────────────────────────
// Two separate PHP processes (separate PDO connections) contend for the SAME
// file-backed SQLite database at the same instant. Exactly one hold may be
// created; the loser must observe the winner's committed hold inside its own
// transaction (SQLite transaction_mode = IMMEDIATE serializes the writers, and
// PRAGMA busy_timeout makes the loser wait rather than failing with a raw
// "database is locked"). This mirrors — and goes beyond — Phase 4: it is real
// process-level contention, not sequential calls in one process.

function runHeldProcess(string $script, string ...$args): array
{
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = proc_open(array_merge([PHP_BINARY, $script], $args), $descriptors, $pipes);

    if (! is_resource($proc)) {
        return ['exit' => -1, 'out' => '', 'err' => 'proc_open could not start the child process.'];
    }

    fclose($pipes[0]);

    $err = stream_get_contents($pipes[2]);
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return ['exit' => proc_close($proc), 'out' => (string) $out, 'err' => (string) $err];
}

test('two concurrent attemptHold calls for the same window cannot both succeed', function () {
    $tmp = sys_get_temp_dir();
    $dbFile = $tmp.'/slothold_'.uniqid().'.sqlite';
    $readyDir = $tmp.'/slothold_ready_'.uniqid();
    $gateFile = $tmp.'/slothold_gate_'.uniqid().'.go';
    $migrateScript = $tmp.'/slothold_migrate_'.uniqid().'.php';
    $childScript = $tmp.'/slothold_child_'.uniqid().'.php';

    mkdir($readyDir);

    try {
        // (a) A fresh file DB, fully migrated, in its own process.
        file_put_contents($migrateScript, <<<'PHP'
<?php

$base = $argv[1];
$dbFile = $argv[2];

// Laravel's env() checks the $_ENV/$_SERVER superglobals ahead of putenv(),
// so all three stores must agree or a stale ':memory:' inherited from the
// parent test process wins.
putenv('DB_CONNECTION=sqlite');
putenv('DB_DATABASE='.$dbFile);
$_ENV['DB_CONNECTION'] = 'sqlite';
$_ENV['DB_DATABASE'] = $dbFile;
$_SERVER['DB_CONNECTION'] = 'sqlite';
$_SERVER['DB_DATABASE'] = $dbFile;

require $base.'/vendor/autoload.php';

$app = require $base.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$status = $kernel->call('migrate', ['--force' => true, '--no-interaction' => true]);

echo 'MIGRATE_STATUS:'.$status;
PHP);

        $migrate = runHeldProcess($migrateScript, base_path(), $dbFile);
        $this->assertSame(0, $migrate['exit'], "migrate failed\nstdout:{$migrate['out']}\nstderr:{$migrate['err']}");

        // (b) The attempt child: wait for the gate, then call attemptHold once.
        file_put_contents($childScript, <<<'PHP'
<?php

$base = $argv[1];
$dbFile = $argv[2];
$readyPath = $argv[3];
$gatePath = $argv[4];
$startStr = $argv[5];
$endStr = $argv[6];

putenv('DB_CONNECTION=sqlite');
putenv('DB_DATABASE='.$dbFile);
$_ENV['DB_CONNECTION'] = 'sqlite';
$_ENV['DB_DATABASE'] = $dbFile;
$_SERVER['DB_CONNECTION'] = 'sqlite';
$_SERVER['DB_DATABASE'] = $dbFile;

// Signal readiness to the parent, then block until the start gate opens so
// both children race into their transactions at almost the same instant.
file_put_contents($readyPath, 'ready');

$gateSeen = false;
$deadline = microtime(true) + 20.0;

while (microtime(true) < $deadline) {
    clearstatcache(true, $gatePath);
    if (file_exists($gatePath)) {
        $gateSeen = true;
        break;
    }
    usleep(2000);
}

if (! $gateSeen) {
    echo 'GATE_TIMEOUT';
    exit(0);
}

require $base.'/vendor/autoload.php';

$app = require $base.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

// Under real contention, one child's BEGIN IMMEDIATE blocks until the other
// commits. busy_timeout makes the loser WAIT (then re-read the committed
// state and reject cleanly) instead of dying with SQLITE_BUSY.
Illuminate\Support\Facades\DB::statement('PRAGMA busy_timeout = 15000;');

try {
    $hold = app(App\Modules\Scheduling\Services\SlotHoldService::class)->attemptHold(
        Illuminate\Support\Carbon::parse($startStr),
        Illuminate\Support\Carbon::parse($endStr),
    );
    echo 'OK:'.$hold->id;
} catch (App\Modules\Scheduling\Exceptions\SchedulingValidationException) {
    echo 'REJECTED';
} catch (Throwable $e) {
    echo 'ERROR:'.get_class($e).':'.substr((string) $e->getMessage(), 0, 150);
}
PHP);

        $window = ['2026-10-05 10:00:00', '2026-10-05 11:00:00'];
        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];

        $proc1 = proc_open([PHP_BINARY, $childScript, base_path(), $dbFile, $readyDir.'/1.ready', $gateFile, $window[0], $window[1]], $descriptors, $pipes1);
        $proc2 = proc_open([PHP_BINARY, $childScript, base_path(), $dbFile, $readyDir.'/2.ready', $gateFile, $window[0], $window[1]], $descriptors, $pipes2);

        $this->assertIsResource($proc1, 'could not spawn first child');
        $this->assertIsResource($proc2, 'could not spawn second child');

        fclose($pipes1[0]);
        fclose($pipes2[0]);

        // (c) Wait for both readiness signals (up to ~15s), then open the gate.
        $deadline = microtime(true) + 15.0;

        while (microtime(true) < $deadline && count(glob($readyDir.'/*.ready') ?: []) < 2) {
            usleep(5000);
        }

        file_put_contents($gateFile, 'go');

        // (d) Collect both outcomes.
        $err1 = stream_get_contents($pipes1[2]);
        $out1 = stream_get_contents($pipes1[1]);
        fclose($pipes1[1]);
        fclose($pipes1[2]);
        $exit1 = proc_close($proc1);

        $err2 = stream_get_contents($pipes2[2]);
        $out2 = stream_get_contents($pipes2[1]);
        fclose($pipes2[1]);
        fclose($pipes2[2]);
        $exit2 = proc_close($proc2);

        $results = [
            'child1' => ['exit' => $exit1, 'out' => trim((string) $out1), 'err' => trim((string) $err1)],
            'child2' => ['exit' => $exit2, 'out' => trim((string) $out2), 'err' => trim((string) $err2)],
        ];
        $diagnostics = json_encode($results);

        $okCount = count(array_filter($results, fn ($r) => str_starts_with($r['out'], 'OK:')));

        // (e) Exactly one success; the loser got a clean overlap rejection.
        $this->assertSame(1, $okCount, "expected exactly one winning hold, got {$okCount}\n{$diagnostics}");

        $losers = array_filter($results, fn ($r) => ! str_starts_with($r['out'], 'OK:'));
        $this->assertCount(1, $losers, $diagnostics);
        $this->assertSame('REJECTED', reset($losers)['out'], "loser did not report a clean rejection\n{$diagnostics}");

        // (f) Structural proof at the database level: exactly one hold row.
        $pdo = new PDO('sqlite:'.$dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $count = (int) $pdo->query('select count(*) from slot_holds')->fetchColumn();

        $this->assertSame(1, $count, "expected 1 slot_holds row after the race\n{$diagnostics}");
    } finally {
        foreach (glob($readyDir.'/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($readyDir);
        @unlink($gateFile);
        @unlink($migrateScript);
        @unlink($childScript);
        @unlink($dbFile);
    }
});
