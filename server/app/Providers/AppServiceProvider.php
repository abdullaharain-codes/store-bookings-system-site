<?php

namespace App\Providers;

use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Repositories\EloquentCartRepository;
use App\Modules\Catalog\Repositories\EloquentProductRepository;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use App\Modules\Merchandising\Repositories\EloquentBannerRepository;
use App\Modules\Notifications\Contracts\NotificationRepositoryInterface;
use App\Modules\Notifications\Repositories\EloquentNotificationRepository;
use App\Modules\Orders\Contracts\AddressRepositoryInterface;
use App\Modules\Orders\Repositories\EloquentAddressRepository;
use App\Modules\Reviews\Contracts\ReviewRepositoryInterface;
use App\Modules\Reviews\Repositories\EloquentReviewRepository;
use App\Modules\ReviewShowcase\Contracts\ReviewShowcaseItemRepositoryInterface;
use App\Modules\ReviewShowcase\Repositories\EloquentReviewShowcaseItemRepository;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use App\Modules\Scheduling\Repositories\EloquentBusinessHourRepository;
use App\Modules\Scheduling\Repositories\EloquentHolidayRepository;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use App\Modules\Services\Repositories\EloquentServiceRepository;
use App\Modules\Settings\Contracts\SettingRepositoryInterface;
use App\Modules\Settings\Repositories\EloquentSettingRepository;
use App\Modules\Taxonomy\Contracts\BrandRepositoryInterface;
use App\Modules\Taxonomy\Contracts\CategoryRepositoryInterface;
use App\Modules\Taxonomy\Repositories\EloquentBrandRepository;
use App\Modules\Taxonomy\Repositories\EloquentCategoryRepository;
use App\Shared\AuditLogger;
use App\Shared\FileUploadService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(FileUploadService::class);
        $this->app->singleton(AuditLogger::class);

        $this->app->bind(CategoryRepositoryInterface::class, EloquentCategoryRepository::class);
        $this->app->bind(BrandRepositoryInterface::class, EloquentBrandRepository::class);
        $this->app->bind(ProductRepositoryInterface::class, EloquentProductRepository::class);
        $this->app->bind(CartRepositoryInterface::class, EloquentCartRepository::class);
        $this->app->bind(AddressRepositoryInterface::class, EloquentAddressRepository::class);
        $this->app->bind(ServiceRepositoryInterface::class, EloquentServiceRepository::class);
        $this->app->bind(SettingRepositoryInterface::class, EloquentSettingRepository::class);
        $this->app->bind(BusinessHourRepositoryInterface::class, EloquentBusinessHourRepository::class);
        $this->app->bind(HolidayRepositoryInterface::class, EloquentHolidayRepository::class);
        $this->app->bind(BannerRepositoryInterface::class, EloquentBannerRepository::class);
        $this->app->bind(ReviewRepositoryInterface::class, EloquentReviewRepository::class);
        $this->app->bind(ReviewShowcaseItemRepositoryInterface::class, EloquentReviewShowcaseItemRepository::class);
        $this->app->bind(NotificationRepositoryInterface::class, EloquentNotificationRepository::class);
    }

    public function boot(): void
    {
        // Named rate limiters (rules.md §9, hardening item #8), applied via
        // throttle:<name> on exactly the auth and review-submission routes.

        // LOGIN — brute-force protection keyed on the SUBMITTED email + IP
        // (compound), never IP alone: an attacker rotating IPs against one
        // victim's email still hits that email's key, while a shared-IP office
        // is never globally locked out by someone else's attempts.
        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(5)->by(
                ($request->input('email') ?? 'anonymous').'|'.$request->ip()
            );
        });

        // REGISTER — new-account creation has no identity yet to key on, so it
        // is IP-bound: 5 attempts/minute per IP.
        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // PASSWORD CHANGE — keyed per authenticated user so one user's attempts
        // never throttle a sibling account behind the same IP.
        RateLimiter::for('password-change', function (Request $request) {
            return $request->user()
                ? Limit::perMinute(5)->by('user:'.$request->user()->id)
                : Limit::none();
        });

        // REVIEW SUBMISSION — automated-spam guard on customer reviews:
        // 10 attempts/minute per authenticated user (generous for legitimate
        // use, tight enough to slow bulk posting).
        RateLimiter::for('review-submission', function (Request $request) {
            return $request->user()
                ? Limit::perMinute(10)->by('user:'.$request->user()->id)
                : Limit::none();
        });
    }
}
