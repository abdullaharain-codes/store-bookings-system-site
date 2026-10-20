import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyListingPatch,
  hasActiveFilters,
  parseListingParams,
  PRODUCTS_PER_PAGE,
  serializeListingParams,
  useListingParams,
} from "./useListingParams";
import { renderWithProviders } from "../../test/utils";

function Harness({ onChanged }: { onChanged?: (patch: Partial<ReturnType<typeof useListingParams>["params"]>) => void }) {
  const { params, update, clearAll } = useListingParams();
  onChanged?.(params);
  return (
    <div>
      <output data-testid="id">
        {params.sort}|{params.page}|{params.search ?? ""}|{params.minPrice ?? ""}|{params.maxPrice ?? ""}|{params.inStock ? "stock" : ""}|{params.brand ?? ""}
      </output>
      <button type="button" onClick={() => update({ sort: "price_asc" })}>sort</button>
      <button type="button" onClick={() => update({ page: 3 })}>page</button>
      <button type="button" onClick={() => update({ inStock: true })}>stock</button>
      <button type="button" onClick={clearAll}>clear</button>
    </div>
  );
}

describe("useListingParams parse", () => {
  it("drops invalid values and applies whitelist defaults", () => {
    const params = parseListingParams(
      new URLSearchParams({
        sort: "relevance", // not in the whitelist
        page: "-3", // not a positive integer
        min_price: "-5", // must be non-negative
        search: "   ",
      }),
    );
    expect(params).toEqual({
      sort: "newest",
      page: 1,
      search: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      brand: null,
    });
  });

  it("parses valid values, trimming search", () => {
    const params = parseListingParams(
      new URLSearchParams({
        sort: "price_desc",
        page: "4",
        min_price: "1000.50",
        max_price: "5000",
        in_stock: "1",
        brand: "dell",
        search: "  xps  ",
      }),
    );
    expect(params).toEqual({
      sort: "price_desc",
      page: 4,
      search: "xps",
      minPrice: 1000.5,
      maxPrice: 5000,
      inStock: true,
      brand: "dell",
    });
  });

  it("drops in_stock values other than the documented 1", () => {
    const params = parseListingParams(new URLSearchParams({ in_stock: "true" }));
    expect(params.inStock).toBeNull();
  });
});

describe("useListingParams serialize", () => {
  it("omits defaults from the URL", () => {
    const searchParams = serializeListingParams({
      sort: "newest",
      page: 1,
      search: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      brand: null,
    });
    expect(searchParams.toString()).toBe("");
  });

  it("serialises every non-default filter", () => {
    const searchParams = serializeListingParams({
      sort: "price_asc",
      page: 2,
      search: "xps",
      minPrice: 1000,
      maxPrice: 5000,
      inStock: true,
      brand: "dell",
    });
    expect(searchParams.toString()).toBe(
      "search=xps&min_price=1000&max_price=5000&in_stock=1&brand=dell&sort=price_asc&page=2"
    );
  });
});

describe("useListingParams update", () => {
  it("resets page to 1 when a filter changes", () => {
    const current = {
      sort: "newest" as const,
      page: 4,
      search: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      brand: null,
    };
    const next = applyListingPatch(
      { ...current, sort: "price_asc" as const },
      { sort: "price_asc" as const },
    );
    expect(next.page).toBe(1);
    expect(next.sort).toBe("price_asc");
  });

  it("keeps the page when only page changes", () => {
    const current = {
      sort: "newest" as const,
      page: 2,
      search: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      brand: null,
    };
    const next = applyListingPatch(current, { page: 3 });
    expect(next.page).toBe(3);
    expect(next.sort).toBe("newest");
  });
});

describe("useListingParams hook", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reads params from the URL and updates the URL in the reverse project", async () => {
    // Reverse project is an oxlint term: the hook writes the same params it read.
    const onChanged = vi.fn();
    const view = renderWithProviders(<Harness onChanged={onChanged} />, {
      entry: "/shop?search=xps&page=2&sort=price_desc",
    });

    expect(onChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: "price_desc",
        page: 2,
        search: "xps",
        inStock: null,
        brand: null,
      })
    );

    fireEvent.click(screen.getByText("page"));
    expect(view.probe.path).toContain("page=3");
    expect(view.probe.path).toContain("sort=price_desc");

    fireEvent.click(screen.getByText("sort"));
    expect(view.probe.path).toContain("sort=price_asc");
    // Changing sort resets the page back to 1 (omitted from the URL).
    expect(view.probe.path).not.toContain("page=");
  });

  it("removes every filter with a single echo when none were active", async () => {
    const view = renderWithProviders(<Harness />, { entry: "/shop" });
    fireEvent.click(screen.getByText("clear"));
    expect(view.probe.path).toBe("/shop");
  });

  it("can toggle in stock", () => {
    renderWithProviders(<Harness />, { entry: "/shop" });
    fireEvent.click(screen.getByText("stock"));
  });
});

describe("hasActiveFilters", () => {
  it("is false for a bare listing", () => {
    expect(
      hasActiveFilters({
        sort: "newest",
        page: 1,
        search: null,
        minPrice: null,
        maxPrice: null,
        inStock: null,
        brand: null,
      })
    ).toBe(false);
  });

  it("is true when any filter or a later page is set", () => {
    const base = {
      search: null,
      minPrice: null,
      maxPrice: null,
      inStock: null,
      brand: null,
    };
    expect(hasActiveFilters({ ...base, sort: "price_asc", page: 1 })).toBe(true);
    expect(hasActiveFilters({ ...base, sort: "newest", page: 2 })).toBe(true);
    expect(hasActiveFilters({ ...base, sort: "newest", page: 1, search: "x" })).toBe(true);
  });
});

describe("PRODUCTS_PER_PAGE", () => {
  it("is a named UI decision of 12", () => {
    // The UI page size is a display choice, not the API's business cap.
    expect(PRODUCTS_PER_PAGE).toBe(12);
  });
});