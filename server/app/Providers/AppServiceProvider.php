<?php

namespace App\Providers;

use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Repositories\EloquentCartRepository;
use App\Modules\Catalog\Repositories\EloquentProductRepository;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use App\Modules\Merchandising\Repositories\EloquentBannerRepository;
use App\Modules\Orders\Contracts\AddressRepositoryInterface;
use App\Modules\Orders\Repositories\EloquentAddressRepository;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use App\Modules\Scheduling\Repositories\EloquentBusinessHourRepository;
use App\Modules\Scheduling\Repositories\EloquentHolidayRepository;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use App\Modules\Services\Repositories\EloquentServiceRepository;
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
        $this->app->bind(BusinessHourRepositoryInterface::class, EloquentBusinessHourRepository::class);
        $this->app->bind(HolidayRepositoryInterface::class, EloquentHolidayRepository::class);
        $this->app->bind(BannerRepositoryInterface::class, EloquentBannerRepository::class);
    }

    public function boot(): void
    {
        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });
    }
}
