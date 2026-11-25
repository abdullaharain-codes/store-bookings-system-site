<?php

use App\Models\Address;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\SlotHold;
use App\Models\User;
use App\Modules\Scheduling\Exceptions\SchedulingValidationException;
use App\Modules\Scheduling\Services\BookingService;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

function bookingService(): BookingService
{
    return app(BookingService::class);
}

test('confirmBooking creates one pending ServiceBooking and releases the temporary hold', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $user = User::factory()->create();
    $address = Address::factory()->create(['user_id' => $user->id]);

    $booking = bookingService()->confirmBooking(
        $user,
        $service->id,
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        'XPS 15',
        'Screen flickering after boot',
    );

    // The transient hold must not outlive the booking-row creation.
    expect(SlotHold::query()->count())->toBe(0);
    expect(ServiceBooking::query()->count())->toBe(1);

    expect($booking->status)->toBe('pending')
        ->and($booking->user_id)->toBe($user->id)
        ->and($booking->service_id)->toBe($service->id)
        ->and($booking->address_id)->toBe($address->id)
        ->and($booking->problem_description)->toBe('Screen flickering after boot')
        ->and($booking->scheduled_slot_start->format('Y-m-d H:i:s'))->toBe('2026-10-05 10:00:00')
        ->and($booking->scheduled_slot_end->format('Y-m-d H:i:s'))->toBe('2026-10-05 11:00:00');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'created',
    ]);
});

test('confirmBooking against an already-held window throws and creates no booking row', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $user = User::factory()->create();
    $other = User::factory()->create();
    $address = Address::factory()->create(['user_id' => $user->id]);

    // A live hold from a competing booking flow already owns this window.
    SlotHold::factory()->create([
        'starts_at' => Carbon::parse('2026-10-05 10:00:00'),
        'ends_at' => Carbon::parse('2026-10-05 11:00:00'),
        'held_by_user_id' => $other->id,
    ]);

    expect(fn () => bookingService()->confirmBooking(
        $user,
        $service->id,
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        null,
        'Screen flickering after boot process.',
    ))->toThrow(SchedulingValidationException::class);

    expect(ServiceBooking::query()->count())->toBe(0);
});

test('confirmBooking against overlapping existing booking throws and creates nothing', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $user = User::factory()->create();

    // One confirmed booking already owns a window that overlaps the attempt
    // (half-open [10:00, 11:00) vs [10:30, 11:30)).
    $address = Address::factory()->create(['user_id' => $user->id]);
    ServiceBooking::factory()->confirmed()->create([
        'service_id' => $service->id,
        'scheduled_slot_start' => Carbon::parse('2026-10-05 10:00:00'),
        'scheduled_slot_end' => Carbon::parse('2026-10-05 11:00:00'),
        'user_id' => $user->id,
    ]);

    expect(fn () => bookingService()->confirmBooking(
        $user,
        $service->id,
        Carbon::parse('2026-10-05 10:30:00'),
        Carbon::parse('2026-10-05 11:30:00'),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        null,
        'Screen flickering after boot process.',
    ))->toThrow(SchedulingValidationException::class);

    expect(ServiceBooking::query()->count())->toBe(1);
});

test('confirmBooking for an unpublished service throws ResourceNotFoundException', function () {
    $service = Service::factory()->create(['is_published' => false]);
    $user = User::factory()->create();
    $address = Address::factory()->create(['user_id' => $user->id]);

    expect(fn () => bookingService()->confirmBooking(
        $user,
        $service->id,
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        null,
        'Screen flickering after boot process.',
    ))->toThrow(ResourceNotFoundException::class);

    expect(ServiceBooking::query()->count())->toBe(0);
});

test('confirmBooking for a nonexistent service throws ResourceNotFoundException', function () {
    $user = User::factory()->create();
    $address = Address::factory()->create(['user_id' => $user->id]);

    expect(fn () => bookingService()->confirmBooking(
        $user,
        999999,
        Carbon::parse('2026-10-05 10:00:00'),
        Carbon::parse('2026-10-05 11:00:00'),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        null,
        'Screen flickering after boot process.',
    ))->toThrow(ResourceNotFoundException::class);

    expect(ServiceBooking::query()->count())->toBe(0);
});

test('cancelBooking succeeds more than two hours before the slot and audit-logs the actor', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    $cancelled = bookingService()->cancelBooking($user, $booking);

    expect($cancelled->status)->toBe('cancelled')
        ->and($cancelled->cancelled_at)->not->toBeNull();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'cancelled',
        'actor_id' => $user->id,
        'metadata' => json_encode(['previous_status' => 'confirmed', 'cancelled_by' => 'customer']),
    ]);
});

test('cancelBooking is blocked within the two-hour cutoff window', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => now()->addHour()->startOfHour(),
        'scheduled_slot_end' => now()->addHour()->startOfHour()->addMinutes(60),
    ]);

    expect(fn () => bookingService()->cancelBooking($user, $booking))
        ->toThrow(SchedulingValidationException::class);

    expect($booking->refresh()->status)->toBe('confirmed');
    $this->assertDatabaseCount('audit_logs', 0);
});

test('cancelBooking with the slot already in the past is blocked', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => now()->subHour()->startOfHour(),
        'scheduled_slot_end' => now()->subHour()->startOfHour()->addMinutes(60),
    ]);

    expect(fn () => bookingService()->cancelBooking($user, $booking))
        ->toThrow(SchedulingValidationException::class);

    $this->assertDatabaseCount('audit_logs', 0);
});

test('cancelBooking is hard-blocked for technician_on_the_way regardless of how far out the slot is', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    // Ten hours out — well beyond even the 2-hour cutoff — yet the status
    // alone must block (PRD: "Technician On The Way" is a system rule that
    // overrides the time window, not combined with it).
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => now()->addHours(10)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(10)->startOfHour()->addMinutes(60),
    ]);

    expect(fn () => bookingService()->cancelBooking($user, $booking))
        ->toThrow(SchedulingValidationException::class);

    expect($booking->refresh()->status)->toBe('technician_on_the_way');
    $this->assertDatabaseCount('audit_logs', 0);
});

test('customer cannot cancel another customer booking (IDOR)', function () {
    $owner = User::factory()->create();
    $otherUser = User::factory()->create();

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $owner->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    expect(fn () => bookingService()->cancelBooking($otherUser, $booking))
        ->toThrow(ResourceNotFoundException::class);

    expect($booking->refresh()->status)->toBe('confirmed');
    $this->assertDatabaseCount('audit_logs', 0);
});

test('admin bypasses the ownership check (PRD §10 admin can always override)', function () {
    $owner = User::factory()->create();
    $adminUser = User::factory()->create();

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $owner->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    $cancelled = bookingService()->cancelBooking($adminUser, $booking, isAdmin: true);

    expect($cancelled->status)->toBe('cancelled');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'cancelled',
        'metadata' => json_encode(['previous_status' => 'confirmed', 'cancelled_by' => 'admin']),
    ]);
});

test('admin can override the two-hour cutoff (PRD §10 admin can always override)', function () {
    $owner = User::factory()->create();
    $adminUser = User::factory()->create();

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $owner->id,
        'scheduled_slot_start' => now()->addHour()->startOfHour(),
        'scheduled_slot_end' => now()->addHour()->startOfHour()->addMinutes(60),
    ]);

    $cancelled = bookingService()->cancelBooking($adminUser, $booking, isAdmin: true);

    expect($cancelled->status)->toBe('cancelled');
});

test('admin can override the technician_on_the_way hard block (PRD §10 admin can always override)', function () {
    $owner = User::factory()->create();
    $adminUser = User::factory()->create();

    $booking = ServiceBooking::factory()->technicianOnTheWay()->create([
        'user_id' => $owner->id,
        'scheduled_slot_start' => now()->addHours(10)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(10)->startOfHour()->addMinutes(60),
    ]);

    $cancelled = bookingService()->cancelBooking($adminUser, $booking, isAdmin: true);

    expect($cancelled->status)->toBe('cancelled');
});

test('non-admin cannot cancel another customer booking even inside the allowed window as the owner', function () {
    $owner = User::factory()->create();
    $otherUser = User::factory()->create();

    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $owner->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    // The other user's own slot is far out, but the booking isn't theirs —
    // ownership fails BEFORE any rule is evaluated.
    expect(fn () => bookingService()->cancelBooking($otherUser, $booking, isAdmin: false))
        ->toThrow(ResourceNotFoundException::class);

    expect($booking->refresh()->status)->toBe('confirmed');
});

// ─── Genuine concurrent confirmation ─────────────────────────────────────────
// Same multi-process technique as SlotHoldServiceTest: two separate PHP
// processes (separate PDO connections) race confirmBooking on the SAME window
// against a fresh file-backed SQLite DB. Whichever child wins the transaction
// serialisation must book; the loser must observe the committed booking and be
// rejected by the booking-window overlap guard. Exactly ONE service_bookings row
// and ZERO residual slot_holds may exist afterwards.

function runBookingChild(string $script, string ...$args): array
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

test('two concurrent confirmBooking calls for the same window cannot both succeed', function () {
    $tmp = sys_get_temp_dir();
    $dbFile = $tmp.'/booking_race_'.uniqid().'.sqlite';
    $readyDir = $tmp.'/booking_ready_'.uniqid();
    $gateFile = $tmp.'/booking_gate_'.uniqid().'.go';
    $migrateScript = $tmp.'/booking_migrate_'.uniqid().'.php';
    $childScript = $tmp.'/booking_child_'.uniqid().'.php';

    mkdir($readyDir);

    try {
        // (a) Fresh file DB, migrated AND seeded with the service/user/address
        // the booking needs, all in one setup process.
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

$user = App\Models\User::factory()->create(['email' => 'concurrency@booking.test']);
App\Models\Service::factory()->create([
    'slug' => 'concurrency-booking-service',
    'is_published' => true,
]);
App\Models\Address::factory()->create(['user_id' => $user->id]);

echo 'MIGRATE_STATUS:'.$status;
PHP);

        $migrate = runBookingChild($migrateScript, base_path(), $dbFile);
        $this->assertSame(0, $migrate['exit'], "migrate+seed failed\nstdout:{$migrate['out']}\nstderr:{$migrate['err']}");

        // (b) The confirm child: wait for the gate, then confirmBooking once.
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
// commits; busy_timeout makes the loser WAIT (then observe the committed
// booking row and reject cleanly) instead of dying with SQLITE_BUSY.
Illuminate\Support\Facades\DB::statement('PRAGMA busy_timeout = 15000;');

$user = App\Models\User::query()->where('email', 'concurrency@booking.test')->firstOrFail();
$service = App\Models\Service::query()->where('slug', 'concurrency-booking-service')->firstOrFail();
$address = App\Models\Address::query()->where('user_id', $user->id)->firstOrFail();

try {
    $booking = app(App\Modules\Scheduling\Services\BookingService::class)->confirmBooking(
        $user,
        $service->id,
        Illuminate\Support\Carbon::parse($startStr),
        Illuminate\Support\Carbon::parse($endStr),
        $address->id,
        'hardware',
        'laptop',
        'Dell',
        null,
        'Concurrent booking attempt',
    );
    echo 'OK:'.$booking->id;
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
        $this->assertSame(1, $okCount, "expected exactly one winning booking, got {$okCount}\n{$diagnostics}");

        $losers = array_filter($results, fn ($r) => ! str_starts_with($r['out'], 'OK:'));
        $this->assertCount(1, $losers, $diagnostics);
        $this->assertSame('REJECTED', reset($losers)['out'], "loser did not report a clean rejection\n{$diagnostics}");

        // (f) Structural proof at the database level: exactly one booking row
        // and no residual hold left behind by the winner's released hold.
        $pdo = new PDO('sqlite:'.$dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $bookingCount = (int) $pdo->query('select count(*) from service_bookings')->fetchColumn();
        $holdCount = (int) $pdo->query('select count(*) from slot_holds')->fetchColumn();

        $this->assertSame(1, $bookingCount, "expected 1 service_bookings row after the race\n{$diagnostics}");
        $this->assertSame(0, $holdCount, "expected 0 slot_holds rows after the race\n{$diagnostics}");
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

// ─── listAllForAdmin ─────────────────────────────────────────────────────────

test('listAllForAdmin returns every booking regardless of owner, ordered by slot', function () {
    $userA = User::factory()->create();
    $userB = User::factory()->create();

    ServiceBooking::factory()->create(['user_id' => $userA->id]);
    ServiceBooking::factory()->create(['user_id' => $userB->id]);
    ServiceBooking::factory()->create(['user_id' => $userA->id]);

    $all = bookingService()->listAllForAdmin();

    expect($all->total())->toBe(3)
        ->and(collect($all->items())->pluck('user_id')->map(fn ($id) => (int) $id)->all())
        ->toContain((int) $userA->id)
        ->toContain((int) $userB->id);
});

test('listAllForAdmin filters by status, slot date range, and search', function () {
    $user = User::factory()->create();
    $past = now()->subDay();
    $today = now()->addDay();
    $future = now()->addDays(3);

    ServiceBooking::factory()->confirmed()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => $past,
        'problem_description' => 'GPU coil whine',
    ]);
    ServiceBooking::factory()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => $today,
        'problem_description' => 'monitor has dead pixels',
    ]);
    ServiceBooking::factory()->technicianOnTheWay()->create([
        'user_id' => $user->id,
        'scheduled_slot_start' => $future,
        'problem_description' => 'fan rattles loudly',
    ]);

    expect(bookingService()->listAllForAdmin(['status' => 'confirmed'])->total())->toBe(1);

    $inRange = bookingService()->listAllForAdmin([
        'date_from' => $today->copy()->startOfDay()->toDateString(),
        'date_to' => $future->copy()->addDay()->toDateString(),
    ]);
    expect($inRange->total())->toBe(2);

    expect(bookingService()->listAllForAdmin(['search' => 'dead pixels'])->total())->toBe(1);
});

// ─── getBookingForAdmin ──────────────────────────────────────────────────────

test('getBookingForAdmin returns any booking with its relations', function () {
    $booking = ServiceBooking::factory()->confirmed()->create();

    $fetched = bookingService()->getBookingForAdmin($booking->id);

    expect($fetched->id)->toBe($booking->id)
        ->and($fetched->relationLoaded('service'))->toBeTrue()
        ->and($fetched->relationLoaded('user'))->toBeTrue()
        ->and($fetched->relationLoaded('address'))->toBeTrue();
});

// ─── assignTechnician ────────────────────────────────────────────────────────

test('assignTechnician sets the technician and audit-logs the assignment', function () {
    $technician = User::factory()->create();
    $booking = ServiceBooking::factory()->confirmed()->create();

    $updated = bookingService()->assignTechnician($booking, $technician->id);

    expect($updated->technician_id)->toBe($technician->id);

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'technician_assigned',
        'metadata' => json_encode(['technician_id' => $technician->id]),
    ]);
});

test('assignTechnician rejects a nonexistent technician id (404)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create();

    expect(fn () => bookingService()->assignTechnician($booking, 999999))
        ->toThrow(ResourceNotFoundException::class);
});

test('assignTechnician rejects terminal bookings', function () {
    $technician = User::factory()->create();
    $completed = ServiceBooking::factory()->completed()->create();
    $cancelled = ServiceBooking::factory()->cancelled()->create();

    expect(fn () => bookingService()->assignTechnician($completed, $technician->id))
        ->toThrow(SchedulingValidationException::class);

    expect(fn () => bookingService()->assignTechnician($cancelled, $technician->id))
        ->toThrow(SchedulingValidationException::class);
});

// ─── transitionStatus ────────────────────────────────────────────────────────

test('transitionStatus follows the booking state machine and audit-logs', function () {
    $booking = ServiceBooking::factory()->create(['status' => 'pending']);

    $booking = bookingService()->transitionStatus($booking, 'confirmed');
    expect($booking->status)->toBe('confirmed');

    $booking = bookingService()->transitionStatus($booking, 'technician_on_the_way');
    expect($booking->status)->toBe('technician_on_the_way');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'status_changed',
        'metadata' => json_encode(['from' => 'confirmed', 'to' => 'technician_on_the_way']),
    ]);
});

test('transitionStatus rejects hopping and reverting completed/cancelled', function () {
    $skipped = ServiceBooking::factory()->create(['status' => 'pending']);

    expect(fn () => bookingService()->transitionStatus($skipped, 'technician_on_the_way'))
        ->toThrow(SchedulingValidationException::class, 'Cannot transition from "pending" to "technician_on_the_way".');

    $completed = ServiceBooking::factory()->completed()->create();

    expect(fn () => bookingService()->transitionStatus($completed, 'pending'))
        ->toThrow(SchedulingValidationException::class, 'Cannot transition from "completed" to "pending".');

    $cancelled = ServiceBooking::factory()->cancelled()->create();

    expect(fn () => bookingService()->transitionStatus($cancelled, 'confirmed'))
        ->toThrow(SchedulingValidationException::class, 'Cannot transition from "cancelled" to "confirmed".');
});

// ─── enterFinalPrice ─────────────────────────────────────────────────────────

test('enterFinalPrice completes a technician_on_the_way booking and sets the price', function () {
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create();

    $updated = bookingService()->enterFinalPrice($booking, 4250.5);

    expect($updated->status)->toBe('completed')
        ->and($updated->final_price)->toBe('4250.50');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'final_price_entered',
        'metadata' => json_encode(['final_price' => '4250.50']),
    ]);
});

test('enterFinalPrice rejects any status other than technician_on_the_way', function () {
    $pending = ServiceBooking::factory()->create(['status' => 'pending']);
    $completed = ServiceBooking::factory()->completed()->create();

    expect(fn () => bookingService()->enterFinalPrice($pending, 1000.0))
        ->toThrow(SchedulingValidationException::class);

    expect(fn () => bookingService()->enterFinalPrice($completed, 1000.0))
        ->toThrow(SchedulingValidationException::class);
});

// ─── cancelBooking terminal guards ───────────────────────────────────────────

test('cancelBooking blocks a completed booking even for admin (data-integrity)', function () {
    $user = User::factory()->create();
    $booking = ServiceBooking::factory()->completed()->create(['user_id' => $user->id]);

    expect(fn () => bookingService()->cancelBooking($user, $booking, isAdmin: true))
        ->toThrow(SchedulingValidationException::class, 'A completed booking cannot be cancelled.');

    $booking->refresh();
    expect($booking->status)->toBe('completed')
        ->and($booking->final_price)->not->toBeNull();
});

test('cancelBooking blocks a completed booking for the owning customer too', function () {
    $user = User::factory()->create();
    $booking = ServiceBooking::factory()->completed()->create(['user_id' => $user->id]);

    expect(fn () => bookingService()->cancelBooking($user, $booking))
        ->toThrow(SchedulingValidationException::class, 'A completed booking cannot be cancelled.');
});

test('cancelBooking is an idempotency-safe rejection for already-cancelled bookings', function () {
    $user = User::factory()->create();
    $booking = ServiceBooking::factory()->cancelled()->create(['user_id' => $user->id]);

    $originalCancelledAt = $booking->cancelled_at;
    $originalStatus = $booking->status;

    expect(fn () => bookingService()->cancelBooking($user, $booking, isAdmin: true))
        ->toThrow(SchedulingValidationException::class, 'This booking has already been cancelled.');

    $booking->refresh();
    expect($booking->status)->toBe($originalStatus)
        ->and($booking->cancelled_at->equalTo($originalCancelledAt))->toBeTrue();
});
