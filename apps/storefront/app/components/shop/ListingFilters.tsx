import { useId, useState } from "react";
import type { Brand, Category } from "@ecommerce/api-client";
import { Link } from "react-router";
import { type ListingParams, hasActiveFilters } from "./useListingParams";

interface ListingFiltersProps {
  params: ListingParams;
  /** Full published taxonomy (flat, both levels); the component builds its own tree view. */
  categories: Category[];
  brands: Brand[];
  /** Category links only belong on the /shop index — a resolved category/brand page navigates through its breadcrumb and pills instead. */
  showCategories?: boolean;
  /** The brand radio group is meaningless on a brand's own page. */
  hideBrandFilter?: boolean;
  onUpdate: (patch: Partial<ListingParams>) => void;
  onClearAll: () => void;
}

const GROUP_CLASS =
  "rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]";
const LEGEND_CLASS =
  "text-[length:var(--font-size-label-caps)] font-semibold uppercase tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)]";
const LINK_CLASS =
  "flex min-h-[36px] items-center rounded-[var(--radius-sm)] px-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const INPUT_CLASS =
  "min-h-[44px] w-full rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-[var(--space-3)] text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const RADIO_CLASS = "h-4 w-4 accent-[var(--color-brand-accent)]";

export function ListingFilters({
  params,
  categories,
  brands,
  showCategories = false,
  hideBrandFilter = false,
  onUpdate,
  onClearAll,
}: ListingFiltersProps) {
  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {showCategories && <CategoryLinks categories={categories} />}
      {!hideBrandFilter && (
        <BrandGroup
          brands={brands}
          value={params.brand}
          onChange={(brand) => onUpdate({ brand })}
        />
      )}
      <PriceGroup
        params={params}
        onApply={(minPrice, maxPrice) => onUpdate({ minPrice, maxPrice })}
      />
      <AvailabilityGroup
        checked={params.inStock === true}
        onChange={(checked) => onUpdate({ inStock: checked ? true : null })}
      />
      {hasActiveFilters(params) && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border-default)] px-[var(--space-4)] text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function CategoryLinks({ categories }: { categories: Category[] }) {
  const topLevel = categories.filter((category) => category.parent_category_id === null);

  return (
    <nav aria-label="Categories" className={GROUP_CLASS}>
      <h2 className={LEGEND_CLASS}>Categories</h2>
      <ul className="mt-[var(--space-3)] flex flex-col gap-[var(--space-1)]">
        {topLevel.map((category) => {
          const children = categories.filter(
            (child) => child.parent_category_id === category.id
          );
          return (
            <li key={category.id}>
              <Link to={`/shop/category/${category.slug}`} className={LINK_CLASS}>
                {category.name}
              </Link>
              {children.length > 0 && (
                <ul className="flex flex-col gap-[var(--space-1)] ps-[var(--space-4)]">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link to={`/shop/category/${child.slug}`} className={LINK_CLASS}>
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BrandGroup({
  brands,
  value,
  onChange,
}: {
  brands: Brand[];
  value: string | null;
  onChange: (brand: string | null) => void;
}) {
  return (
    <fieldset className={GROUP_CLASS}>
      <legend className={LEGEND_CLASS}>Brand</legend>
      <div className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
        <label className="flex min-h-[36px] cursor-pointer items-center gap-[var(--space-2)] text-sm text-[var(--color-text-primary)]">
          <input
            type="radio"
            name="shop-filter-brand"
            checked={value === null}
            onChange={() => onChange(null)}
            className={RADIO_CLASS}
          />
          All brands
        </label>
        {brands.map((brand) => (
          <label
            key={brand.id}
            className="flex min-h-[36px] cursor-pointer items-center gap-[var(--space-2)] text-sm text-[var(--color-text-primary)]"
          >
            <input
              type="radio"
              name="shop-filter-brand"
              checked={value === brand.slug}
              onChange={() => onChange(brand.slug)}
              className={RADIO_CLASS}
            />
            {brand.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PriceGroup({
  params,
  onApply,
}: {
  params: ListingParams;
  onApply: (minPrice: number | null, maxPrice: number | null) => void;
}) {
  const minId = useId();
  const maxId = useId();
  const errorId = useId();
  const [min, setMin] = useState(params.minPrice === null ? "" : String(params.minPrice));
  const [max, setMax] = useState(params.maxPrice === null ? "" : String(params.maxPrice));
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const minTrimmed = min.trim();
    const maxTrimmed = max.trim();
    const minPrice = minTrimmed === "" ? null : Number(minTrimmed);
    const maxPrice = maxTrimmed === "" ? null : Number(maxTrimmed);

    if ((minPrice !== null && !Number.isFinite(minPrice)) || (maxPrice !== null && !Number.isFinite(maxPrice))) {
      setError("Enter a valid price.");
      return;
    }
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      setError("Minimum price cannot exceed maximum price.");
      return;
    }
    setError(null);
    onApply(minPrice, maxPrice);
  }

  return (
    <fieldset className={GROUP_CLASS}>
      <legend className={LEGEND_CLASS}>Price</legend>
      <div className="mt-[var(--space-3)] flex gap-[var(--space-3)]">
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]">
          <label htmlFor={minId} className="text-sm text-[var(--color-text-secondary)]">
            Min price
          </label>
          <input
            id={minId}
            type="text"
            inputMode="decimal"
            value={min}
            onChange={(event) => {
              setMin(event.target.value);
              setError(null);
            }}
            aria-describedby={error ? errorId : undefined}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]">
          <label htmlFor={maxId} className="text-sm text-[var(--color-text-secondary)]">
            Max price
          </label>
          <input
            id={maxId}
            type="text"
            inputMode="decimal"
            value={max}
            onChange={(event) => {
              setMax(event.target.value);
              setError(null);
            }}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={apply}
        className="mt-[var(--space-3)] min-h-[44px] rounded-[var(--radius-sm)] bg-[var(--color-brand-accent)] px-[var(--space-4)] text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand-accent)]"
      >
        Apply
      </button>
      {error && (
        <p id={errorId} role="alert" className="mt-[var(--space-2)] text-sm text-[var(--color-status-error)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function AvailabilityGroup({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <fieldset className={GROUP_CLASS}>
      <legend className={LEGEND_CLASS}>Availability</legend>
      <label className="mt-[var(--space-3)] flex min-h-[36px] cursor-pointer items-center gap-[var(--space-2)] text-sm text-[var(--color-text-primary)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-brand-accent)]"
        />
        In stock only
      </label>
    </fieldset>
  );
}
