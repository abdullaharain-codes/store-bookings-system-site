<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\HomepageBanner;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use App\Modules\Merchandising\Http\Requests\ReorderBannersRequest;
use App\Modules\Merchandising\Http\Requests\StoreBannerRequest;
use App\Modules\Merchandising\Http\Requests\UpdateBannerRequest;
use App\Modules\Merchandising\Services\BannerService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BannerController extends Controller
{
    public function __construct(
        private readonly BannerService $banners,
        private readonly BannerRepositoryInterface $bannerRepository,
    ) {}

    /**
     * Admin listing — includes unpublished banners. Filters (search, status,
     * per_page) pass straight through to the repository; pagination metadata
     * rides on Laravel's standard paginator envelope (mirrors categories). The
     * search term matches against the banner's target CATEGORY name, since a
     * banner is identified by what it links to (PRD §8).
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->bannerRepository->findAllForAdmin(
            $request->only(['search', 'status', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(HomepageBanner $homepageBanner): JsonResponse
    {
        return response()->json([
            'banner' => $homepageBanner->load(['asset', 'targetCategory']),
        ]);
    }

    public function store(StoreBannerRequest $request): JsonResponse
    {
        $banner = $this->banners->createBanner($request->validated());

        return response()->json([
            'banner' => $banner->load(['asset', 'targetCategory']),
        ], 201);
    }

    public function update(UpdateBannerRequest $request, HomepageBanner $homepageBanner): JsonResponse
    {
        $banner = $this->banners->updateBanner($homepageBanner, $request->validated());

        return response()->json([
            'banner' => $banner->refresh()->load(['asset', 'targetCategory']),
        ]);
    }

    public function destroy(HomepageBanner $homepageBanner): JsonResponse
    {
        $this->banners->deleteBanner($homepageBanner);

        return response()->json([
            'message' => 'Banner deleted.',
        ]);
    }

    public function publish(HomepageBanner $homepageBanner): JsonResponse
    {
        $banner = $this->banners->publish($homepageBanner);

        return response()->json([
            'banner' => $banner->refresh()->load(['asset', 'targetCategory']),
        ]);
    }

    public function unpublish(HomepageBanner $homepageBanner): JsonResponse
    {
        $banner = $this->banners->unpublish($homepageBanner);

        return response()->json([
            'banner' => $banner->refresh()->load(['asset', 'targetCategory']),
        ]);
    }

    public function reorder(ReorderBannersRequest $request): JsonResponse
    {
        $this->banners->reorderBanners($request->validated('ordered_ids'));

        return response()->json([
            'message' => 'Banners reordered.',
        ]);
    }
}
