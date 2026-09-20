<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use Illuminate\Http\JsonResponse;

class BannerController extends Controller
{
    public function __construct(
        private readonly BannerRepositoryInterface $banners,
    ) {}

    /**
     * Storefront carousel feed (PRD §8): published banners whose target
     * category is ALSO published, in admin-defined display order. Each item
     * carries its asset and the nested targetCategory so the frontend resolves
     * `targetCategory.slug` at click time (design.md §3.7) — the association is
     * live, so an admin re-pointing a banner is visible on the next load.
     *
     * No pagination: the hero carousel is a curated, admin-ordered set
     * (mirrors the non-paginated published category listing, not the admin
     * paginator).
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'banners' => $this->banners->findPublished(),
        ]);
    }
}
