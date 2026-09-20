<?php

use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\Admin\BannerController as AdminBannerController;
use App\Http\Controllers\Api\V1\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Api\V1\Admin\BrandController as AdminBrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController as AdminCategoryController;
use App\Http\Controllers\Api\V1\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\ReviewController as AdminReviewController;
use App\Http\Controllers\Api\V1\Admin\ReviewShowcaseController as AdminReviewShowcaseController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BannerController as PublicBannerController;
use App\Http\Controllers\Api\V1\BookingController;
use App\Http\Controllers\Api\V1\BrandController as PublicBrandController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CategoryController as PublicCategoryController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController as PublicProductController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ReviewController as PublicReviewController;
use App\Http\Controllers\Api\V1\ReviewShowcaseController as PublicReviewShowcaseController;
use App\Http\Controllers\Api\V1\ServiceController as PublicServiceController;
use App\Http\Controllers\Api\V1\WishlistController;
use Illuminate\Support\Facades\Route;

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

    // Auth (session-based Sanctum SPA auth — session handled once by
    // statefulApi()'s EnsureFrontendRequestsAreStateful on the api group)
    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register'])
            ->middleware('throttle:auth');
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:auth');
        Route::post('/logout', [AuthController::class, 'logout'])
            ->middleware('auth:sanctum');
        Route::get('/user', [AuthController::class, 'user'])
            ->middleware('auth:sanctum');
    });

    // ── Authenticated-only routes (any customer, not admin) ─────────────
    // auth:sanctum: session-cookie SPA auth, no admin role gate.
    // The ownership check lives inside CartService/WishlistService, not in
    // middleware — this follows architecture.md §5 (row-level, not route-level).
    Route::middleware(['auth:sanctum'])->group(function () {
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
        Route::get('/profile', [ProfileController::class, 'show']);
        Route::match(['put', 'patch'], '/profile', [ProfileController::class, 'update']);
        Route::post('/profile/password', [ProfileController::class, 'changePassword']);

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
        Route::post('/reviews', [PublicReviewController::class, 'store']);
    });

    // ── Admin routes (require auth + admin role) ────────────────────────
    // Single middleware group guards the whole /admin surface so no admin
    // endpoint can be left unguarded (rules.md §5).
    Route::prefix('admin')
        ->middleware(['auth:sanctum', 'admin'])
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
        });
});
