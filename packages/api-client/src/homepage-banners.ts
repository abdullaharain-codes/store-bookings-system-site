/**
 * Typed wrappers around the public homepage-banners read endpoint (Laravel
 * API v1).
 *
 * Response shape mirrors App\Http\Controllers\Api\V1\BannerController exactly —
 * verified against the controller rather than guessed:
 * - GET /homepage-banners -> { banners: HomepageBanner[] }   (NOT paginated —
 *   a curated, admin-ordered carousel set, announced in routes/api.php)
 */
import apiClient from "./api-client";
import type { Asset, Category } from "./catalog";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

export interface HomepageBanner {
  id: number;
  asset_id: number;
  target_category_id: number;
  /** Admin-defined carousel order (PRD §8 "reorder"). */
  display_order: number;
  is_published: boolean;
  /**
   * Nullable scheduling window (architecture.md §4, schema-only for now):
   * null = always active. Scheduling logic is out of scope; only the columns
   * exist so a later step needs no migration.
   */
  start_at: string | null;
  end_at: string | null;
  created_at?: string;
  updated_at?: string;
  /**
   * Optional overlay copy (BE1, PRD §8: `varchar(120) NULL` / `varchar(255) NULL`).
   *
   * `null` is an AUTHORED state, not missing data: a banner with both fields
   * null is image-only, which is the common case. Both keys are always present
   * in the payload because the controllers serialize the model directly, so a
   * client can branch on the value without probing for key existence. Plain
   * text by contract — the server rejects anything containing an HTML tag.
   */
  headline: string | null;
  subtitle: string | null;
  /** Banner image (the FK is RESTRICT + required — always present). */
  asset: Asset;
  /**
   * Live click destination — a real FK to Category (architecture.md §4/§6),
   * never a hard-coded URL. Resolve `target_category.slug` at click time so
   * an admin re-pointing a banner takes effect on the next load.
   */
  target_category: Category;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface HomepageBannersResponse {
  banners: HomepageBanner[];
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/**
 * The storefront hero carousel feed (PRD §8): published banners whose target
 * category is ALSO published, in admin-defined display order, each carrying
 * its nested asset and live target category. Not paginated — curated set.
 */
export async function getHomepageBanners(): Promise<HomepageBanner[]> {
  const { data } = await apiClient.get<HomepageBannersResponse>(
    "/homepage-banners"
  );
  return data.banners;
}