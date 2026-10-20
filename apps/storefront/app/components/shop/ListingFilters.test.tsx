import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { ListingFilters } from "./ListingFilters";
import type { ListingParams } from "./useListingParams";

const baseParams: ListingParams = {
  sort: "newest",
  page: 1,
  search: null,
  minPrice: null,
  maxPrice: null,
  inStock: null,
  brand: null,
};

const fixtureCategories = [
  {
    id: 1,
    name: "Laptops",
    slug: "laptops",
    parent_category_id: null,
    is_published: true,
  },
  {
    id: 2,
    name: "Gaming Laptops",
    slug: "gaming-laptops",
    parent_category_id: 1,
    is_published: true,
  },
  {
    id: 3,
    name: "Accessories",
    slug: "accessories",
    parent_category_id: null,
    is_published: true,
  },
] as Array<{
  id: number;
  name: string;
  slug: string;
  parent_category_id: number | null;
  is_published: boolean;
}>;

const fixtureBrands = [
  { id: 1, name: "Dell", slug: "dell" },
  { id: 2, name: "HP", slug: "hp" },
];

function renderFilters(
  props: Partial<Parameters<typeof ListingFilters>[0]> = {}
) {
  const onUpdate = props.onUpdate ?? vi.fn();
  const onClearAll = props.onClearAll ?? vi.fn();
  const result = render(
    <MemoryRouter>
      <ListingFilters
        params={baseParams}
        categories={fixtureCategories as never}
        brands={fixtureBrands as never}
        onUpdate={onUpdate}
        onClearAll={onClearAll}
        {...props}
      />
    </MemoryRouter>
  );
  return { ...result, onUpdate, onClearAll };
}

describe("ListingFilters", () => {
  it("renders real category links with children indented, in API order, only when shown", () => {
    const { onUpdate } = renderFilters({ showCategories: true });

    const laptops = screen.getByRole("link", { name: "Laptops" });
    expect(laptops).toHaveAttribute("href", "/shop/category/laptops");
    // Child rendered under its parent, in API order after the parent.
    expect(laptops.nextSibling).toHaveTextContent("Gaming Laptops");
    expect(screen.getByRole("link", { name: "Accessories" })).toBeInTheDocument();
    // A hidden category section renders no category links at all.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("hides the categories section unless showCategories is true", () => {
    renderFilters();

    expect(screen.queryByRole("link", { name: "Laptops" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Accessories" })).not.toBeInTheDocument();
  });

  it("renders a labelled brand radio group with All brands plus one per brand", () => {
    renderFilters();

    const group = screen.getByRole("group", { name: "Brand" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All brands" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dell" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "HP" })).not.toBeChecked();
  });

  it("hides the brand filter on a brand page", () => {
    renderFilters({ hideBrandFilter: true });

    expect(screen.queryByRole("group", { name: "Brand" })).not.toBeInTheDocument();
  });

  it("selecting a brand radio updates the listing", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderFilters({ params: { ...baseParams, brand: "dell" } });

    const dell = screen.getByRole("radio", { name: "Dell" });
    expect(dell).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "HP" }));
    expect(onUpdate).toHaveBeenCalledWith({ brand: "hp" });
  });

  it("choosing All brands removes the brand filter", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderFilters({
      params: { ...baseParams, brand: "hp" },
    });

    await user.click(screen.getByRole("radio", { name: "All brands" }));
    expect(onUpdate).toHaveBeenCalledWith({ brand: null });
  });

  it("applies a valid price range and rejects min > max with an inline error", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderFilters();

    const min = screen.getByLabelText("Min price");
    const max = screen.getByLabelText("Max price");

    await user.type(min, "2000");
    await user.type(max, "1000");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Invalid order: shown to the user, never navigated.
    const error = screen.getByText("Minimum price cannot exceed maximum price.");
    expect(error).toBeInTheDocument();
    expect(min).toHaveAttribute("aria-describedby", error.id);
    expect(onUpdate).not.toHaveBeenCalled();

    await user.clear(max);
    await user.type(max, "4000");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Valid range: navigated.
    expect(onUpdate).toHaveBeenCalledWith({ minPrice: 2000, maxPrice: 4000 });
    expect(screen.queryByText("Minimum price cannot exceed maximum price.")).not.toBeInTheDocument();
  });

  it("supports an in-stock-only checkbox driven by the URL", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderFilters({ params: { ...baseParams, inStock: true } });

    const checkbox = screen.getByRole("checkbox", { name: "In stock only" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(onUpdate).toHaveBeenCalledWith({ inStock: null });
  });

  it("shows Clear all filters only when a filter is active and clears it", async () => {
    const user = userEvent.setup();
    const { onClearAll } = renderFilters();

    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();

    const { onClearAll: activeClear } = renderFilters({
      params: { ...baseParams, minPrice: 100, page: 2, sort: "price_asc" as const },
      onClearAll,
    });

    const clear = screen.getByRole("button", { name: "Clear all filters" });
    await user.click(clear);
    expect(activeClear).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("labels the filter column for assistive tech", () => {
    renderFilters();

    // Each control group carries an accessible name rather than raw text.
    expect(screen.getByRole("group", { name: "Price" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Availability" })).toBeInTheDocument();
  });
});