<?php

use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\Admin\AssetController as AdminAssetController;
use App\Http\Controllers\Api\V1\Admin\BannerController as AdminBannerController;
use App\Http\Controllers\Api\V1\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Api\V1\Admin\BrandController as AdminBrandController;
use App\Http\Controllers\Api\V1\Admin\BusinessHourController as AdminBusinessHourController;
use App\Http\Controllers\Api\V1\Admin\CategoryController as AdminCategoryController;
use App\Http\Controllers\Api\V1\Admin\HolidayController as AdminHolidayController;
use App\Http\Controllers\Api\V1\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\ReviewController as AdminReviewController;
use App\Http\Controllers\Api\V1\Admin\ReviewShowcaseController as AdminReviewShowcaseController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BannerController as PublicBannerController;
use App\Http\Controllers\Api\V1\BookingController;
use App\Http\Controllers\Api\V1\BrandController as PublicBrandController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CategoryController as PublicCategoryController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController as PublicProductController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ReviewController as PublicReviewController;
use App\Http\Controllers\Api\V1\ReviewShowcaseController as PublicReviewShowcaseController;
use App\Http\Controllers\Api\V1\ServiceController as PublicServiceController;
use App\Http\Controllers\Api\V1\ShippingFeeController;
use App\Http\Controllers\Api\V1\WishlistController;
use App\Models\BusinessSetting;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

Route::prefix('v1')->group(function () {

    // ── Public routes (allow-listed per architecture.md §5) ─────────────
    Route::get('/health', fn () => response()->json(['status' => 'ok']));

    // Taxonomy public reads — published data only, no auth (PRD §5.1).
    // The frontend builds nav/filters/homepage sections from these live
    // endpoints; taxonomy is never hard-coded (architecture.md §6).
    Route::get('/categories', [PublicCategoryController::class, 'index']);
    Route::get('/categories/{slug}', [PublicCategoryController::class, 'show']);
    Route::get('/brands', [PublicBrandController::class, 'index']);
    Route::get('/brands/{slug}', [PublicBrandController::class, 'show']);
    Route::get('/products', [PublicProductController::class, 'index']);
    Route::get('/products/{slug}', [PublicProductController::class, 'show']);

    // Services public reads — published, paginated data only, no auth (PRD §10).
    Route::get('/services', [PublicServiceController::class, 'index']);
    Route::get('/services/{slug}', [PublicServiceController::class, 'show']);

    // Public availability for the booking wizard's date/time step (Phase 7), e.g.
    // GET /api/v1/services/{slug}/availability?date=2026-09-21[&mode=nearest].
    // No auth, same as the reads above. Rate limited because it is unauthenticated
    // and every call walks business hours plus live holds and bookings - an
    // unthrottled version is both a scraping target and a cheap way to hammer the
    // scheduling tables. ?mode=nearest rides this route rather than adding a
    // second endpoint (phases.md Phase 7 lists nearest-slot suggestion as part of
    // the engine). Missing vs unpublished slugs 404 identically, as above.
    Route::get('/services/{slug}/availability', [PublicServiceController::class, 'availability'])
        ->middleware('throttle:service-availability')
        ->name('services.availability');

    // Product/Service reviews public reads (PRD §11 sidebars) — published
    // reviews of a published target, paginated, no auth. The 404 for a
    // missing OR unpublished target mirrors the detail controllers (an
    // unpublished target must not leak its existence).
    Route::get('/products/{slug}/reviews', [PublicReviewController::class, 'productReviews']);
    Route::get('/services/{slug}/reviews', [PublicReviewController::class, 'serviceReviews']);

    // Homepage banners public read (PRD §8) — the storefront carousel feed:
    // published banners only, whose target category is also published, in
    // admin-defined display order. Frontend resolves targetCategory.slug at
    // click time (design.md §3.7); the destination updates live when an admin
    // re-points a banner. No pagination — curated, admin-ordered set.
    Route::get('/homepage-banners', [PublicBannerController::class, 'index']);

    // Review showcase public read (architecture.md §4 review-showcase module) —
    // an admin-curated gallery of screenshots of real customer reviews, in
    // admin-defined display order, paginated. Published items only, no auth.
    // Each item is its own entity (never joined to the reviews table).
    Route::get('/review-showcase', [PublicReviewShowcaseController::class, 'index']);

    // Public shipping-fee read (D2, owner decision): checkout shows the fee
    // BEFORE an order is placed, so this exposes the same flat value
    // OrderService stores as shipping_fee — through the same service. Exactly
    // one field, no other business setting. Read live (no cache) so an admin
    // change shows immediately. Throttled like the other unauthenticated read
    // (the availability endpoint): it is public and cheap, but a named limiter
    // keeps it from being a free hammering surface.
    Route::get('/shipping-fee', [ShippingFeeController::class, 'show'])
        ->middleware('throttle:shipping-fee')
        ->name('shipping-fee.show');

    // Auth (session-based Sanctum SPA auth — session handled once by
    // statefulApi()'s EnsureFrontendRequestsAreStateful on the api group)
    // Named limiters per rules.md §9 / hardening item #8: login keyed
    // email+IP (compound), register keyed IP.
    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register'])
            ->middleware('throttle:register');
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:login');
        Route::post('/logout', [AuthController::class, 'logout'])
            ->middleware('auth:sanctum');
        Route::get('/user', [AuthController::class, 'user'])
            ->middleware('auth:sanctum');
    });

    // ── Authenticated-only routes (any customer, not admin) ─────────────
    // auth:sanctum: session-cookie SPA auth, no admin role gate.
    // The ownership check lives inside CartService/WishlistService, not in
    // middleware — this follows architecture.md §5 (row-level, not route-level).
    Route::middleware(['auth:sanctum', AuthenticateSession::class])->group(function () {
        Route::get('/cart', [CartController::class, 'index']);
        Route::post('/cart/items', [CartController::class, 'store']);
        Route::patch('/cart/items/{cartItem}', [CartController::class, 'update']);
        Route::delete('/cart/items/{cartItem}', [CartController::class, 'destroy']);

        Route::get('/wishlist', [WishlistController::class, 'index']);
        Route::post('/wishlist/{product}', [WishlistController::class, 'toggle']);

        // ── Address CRUD + default ───────────────────────────────────────
        // auth:sanctum: session-cookie SPA auth, no admin role gate.
        // Ownership checks live inside AddressService (architecture.md §5).
        Route::get('/addresses', [AddressController::class, 'index']);
        Route::post('/addresses', [AddressController::class, 'store']);
        Route::put('/addresses/{address}', [AddressController::class, 'update']);
        Route::delete('/addresses/{address}', [AddressController::class, 'destroy']);
        Route::post('/addresses/{address}/default', [AddressController::class, 'setDefault']);

        // ── Orders ───────────────────────────────────────────────────────
        Route::post('/orders', [OrderController::class, 'store']);
        Route::get('/orders', [OrderController::class, 'index']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
        Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel']);

        // ── Bookings (PRD §5.2 / §10) ────────────────────────────────────
        // Service Booking (create), Booking Cancellation, Service Booking
        // History — all protected (auth:sanctum), no admin role gate. The
        // client builds booking state from these live endpoints.
        // Default admin booking management (lists/status/final-price) is a
        // separate later step under /admin/* — not wired here.
        Route::post('/bookings', [BookingController::class, 'store']);
        Route::get('/bookings', [BookingController::class, 'index']);
        Route::get('/bookings/{booking}', [BookingController::class, 'show']);
        Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);

        // ── Profile (PRD §5.2 customer self-service) ──────────────────────
        // Protected, no admin gate, no {id} in the URL — the authenticated
        // user always acts on their own record, so there is no ownership gap.
        // password change is throttle-limited per user (rules.md §9).
        Route::get('/profile', [ProfileController::class, 'show']);
        Route::match(['put', 'patch'], '/profile', [ProfileController::class, 'update']);
        Route::post('/profile/password', [ProfileController::class, 'changePassword'])
            ->middleware('throttle:password-change');

        // ── Dashboard (PRD §5.2 account overview) ─────────────────────────
        // Read-only aggregation of the authenticated customer's OWN data
        // (orders count / upcoming bookings / wishlist count). No {id}
        // parameter — the ownership surface IS the authenticated user, and
        // every underlying query is user_id-scoped inside its owning
        // module's service.
        Route::get('/dashboard', [DashboardController::class, 'show']);

        // ── Reviews (PRD §11 sidebars) ────────────────────────────────────
        // Customer submission of a product/service review. Eligibility (a
        // delivered order for products, a completed booking for services) is
        // verified in ReviewService — the client never proves anything.
        // Submission is throttle-limited per user (rules.md §9 spam guard).
        Route::post('/reviews', [PublicReviewController::class, 'store'])
            ->middleware('throttle:review-submission');

        // ── Notifications (Step 11.1 — read/mark infrastructure) ─────────
        // The authenticated user's OWN notifications only. The list has no
        // {id}; the mark-read {notification} id is scoped inside
        // NotificationService so a foreign notification 404s identically to
        // a missing one (architecture.md §10).
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    });

    // ── Admin routes (require auth + admin role) ────────────────────────
    // Single middleware group guards the whole /admin surface so no admin
    // endpoint can be left unguarded (rules.md §5).
    Route::prefix('admin')
        ->middleware(['auth:sanctum', 'admin', AuthenticateSession::class])
        ->group(function () {
            Route::apiResource('categories', AdminCategoryController::class)
                ->except(['create', 'edit']);
            Route::post('/categories/{category}/publish', [AdminCategoryController::class, 'publish']);
            Route::post('/categories/{category}/unpublish', [AdminCategoryController::class, 'unpublish']);

            Route::apiResource('brands', AdminBrandController::class)
                ->except(['create', 'edit']);
            Route::post('/brands/{brand}/publish', [AdminBrandController::class, 'publish']);
            Route::post('/brands/{brand}/unpublish', [AdminBrandController::class, 'unpublish']);

            Route::apiResource('products', AdminProductController::class)
                ->except(['create', 'edit']);
            Route::post('/products/{product}/publish', [AdminProductController::class, 'publish']);
            Route::post('/products/{product}/unpublish', [AdminProductController::class, 'unpublish']);

            // ── Services (PRD §10) ───────────────────────────────────────
            Route::apiResource('services', AdminServiceController::class)
                ->except(['create', 'edit']);
            Route::post('/services/{service}/publish', [AdminServiceController::class, 'publish']);
            Route::post('/services/{service}/unpublish', [AdminServiceController::class, 'unpublish']);

            // ── Orders ───────────────────────────────────────────────────
            Route::get('/orders', [AdminOrderController::class, 'index']);
            Route::get('/orders/{order}', [AdminOrderController::class, 'show']);
            Route::patch('/orders/{order}/status', [AdminOrderController::class, 'updateStatus']);

            // ── Bookings (PRD §10) ───────────────────────────────────────
            // Admin Bookings (list + calendar), assignment, status flow, and
            // final-price entry. 'completed' reaches only via final-price
            // (the money is required on completion) — see BookingService.
            Route::get('/bookings', [AdminBookingController::class, 'index']);
            Route::get('/bookings/{booking}', [AdminBookingController::class, 'show']);
            Route::post('/bookings/{booking}/assign-technician', [AdminBookingController::class, 'assignTechnician']);
            Route::patch('/bookings/{booking}/status', [AdminBookingController::class, 'updateStatus']);
            Route::post('/bookings/{booking}/final-price', [AdminBookingController::class, 'enterFinalPrice']);

            // ── Homepage Banners (PRD §8) ────────────────────────────────
            // Admin CRUD + publish/unpublish + reorder of the hero carousel.
            // destination is a real FK to Category (never a hard-coded URL),
            // and the admin list shows what each banner links to.
            Route::apiResource('homepage-banners', AdminBannerController::class)
                ->except(['create', 'edit']);
            Route::post('/homepage-banners/reorder', [AdminBannerController::class, 'reorder']);
            Route::post('/homepage-banners/{homepageBanner}/publish', [AdminBannerController::class, 'publish']);
            Route::post('/homepage-banners/{homepageBanner}/unpublish', [AdminBannerController::class, 'unpublish']);

            // ── Review Showcase (architecture.md §4 review-showcase) ─────────
            // Admin CRUD + publish/unpublish + reorder of the customer-review
            // screenshot gallery. Own table (review_showcase_items), never
            // joined to reviews — the screenshot alone is the content (SRS
            // §3.4 showcase image rules). Publish state only via the dedicated
            // endpoints below.
            Route::apiResource('review-showcase', AdminReviewShowcaseController::class)
                ->parameters(['review-showcase' => 'reviewShowcaseItem'])
                ->except(['create', 'edit']);
            Route::post('/review-showcase/reorder', [AdminReviewShowcaseController::class, 'reorder']);
            Route::post('/review-showcase/{reviewShowcaseItem}/publish', [AdminReviewShowcaseController::class, 'publish']);
            Route::post('/review-showcase/{reviewShowcaseItem}/unpublish', [AdminReviewShowcaseController::class, 'unpublish']);

            // ── Reviews moderation (PRD §11 sidebars) ─────────────────────
            // Admin listing (including unpublished) + the only state changes
            // a review has: publish/unpublish. No generic update — a review's
            // content is immutable once submitted (ReleasePlan §12).
            Route::get('/reviews', [AdminReviewController::class, 'index']);
            Route::post('/reviews/{review}/publish', [AdminReviewController::class, 'publish']);
            Route::post('/reviews/{review}/unpublish', [AdminReviewController::class, 'unpublish']);

            // Business Hours / Holidays (PRD 9, scheduling config)
            // Admin-managed weekly schedule and blocked dates used by slot generation.
            Route::apiResource('business-hours', AdminBusinessHourController::class)
                ->except(['create', 'edit']);
            Route::apiResource('holidays', AdminHolidayController::class)
                ->except(['create', 'edit']);

            // Business Settings (architecture.md 4.1)
            // Generic key/value/type table read via BusinessSetting::getValue().
            // The {setting} closure binding resolves the unique key string to
            // the row; an unknown key fails binding and the global handler
            // normalises it to the same {"message":"Not Found"} 404 as every
            // other miss. The update FormRequest builds its value rules from
            // the row's stored 'type', so a boolean setting rejects any
            // non-boolean payload (never silently coerced).
            Route::bind('setting', function (string $value) {
                return BusinessSetting::where('key', $value)->firstOrFail();
            });
            Route::get('/settings', [AdminSettingController::class, 'index']);
            Route::get('/settings/{setting}', [AdminSettingController::class, 'show']);
            Route::patch('/settings/{setting}', [AdminSettingController::class, 'update']);

            // ── Assets (Phase 12 hardening item #10) ─────────────────────────
            // Generic image upload. The returned Asset id is what the taxonomy/
            // merch admin CRUD forms submit as *_asset_id — an upload endpoint
            // missing until now, so asset_id fields could never be populated.
            // File/size/MIME validation stays in FileUploadService (never
            // duplicated here); its InvalidArgumentException becomes the standard
            // {"message": ...} 422. Admin-only: the whole /admin group is guarded
            // by auth:sanctum + admin (rules.md §5).
            Route::post('/assets', [AdminAssetController::class, 'store']);
        });
});
