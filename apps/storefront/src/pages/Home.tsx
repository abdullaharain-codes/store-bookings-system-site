/**
 * ⚠️ THROWAWAY PHASE-3 VERIFICATION PAGE — DO NOT STYLE OR EXTEND.
 *
 * Proves the storefront can talk to the live Laravel backend end-to-end
 * (public reads + filter wiring). To be deleted/replaced by the real
 * storefront Home built from the design-reference prototype later.
 */
import { useCallback, useEffect, useState } from "react";
import {
  getBrands,
  getCategories,
  getProducts,
  type Brand,
  type Category,
  type ProductsResponse,
} from "@ecommerce/api-client";

interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

function Section<T>({
  title,
  state,
}: {
  title: string;
  state: AsyncState<T>;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {state.loading && <p>loading…</p>}
      {state.error && <p style={{ color: "red" }}>ERROR: {state.error}</p>}
      {state.data !== null && (
        <pre>{JSON.stringify(state.data, null, 2)}</pre>
      )}
    </section>
  );
}

export default function HomePage() {
  const [categoriesState, setCategoriesState] = useState<AsyncState<Category[]>>({
    loading: true,
    error: null,
    data: null,
  });
  const [brandsState, setBrandsState] = useState<AsyncState<Brand[]>>({
    loading: true,
    error: null,
    data: null,
  });
  const [productsState, setProductsState] = useState<AsyncState<ProductsResponse>>({
    loading: true,
    error: null,
    data: null,
  });

  // Product filters — applied on submit against the live API.
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");

  const fetchCategories = useCallback(() => {
    setCategoriesState({ loading: true, error: null, data: null });
    getCategories()
      .then((res) => setCategoriesState({ loading: false, error: null, data: res.categories }))
      .catch((err: unknown) =>
        setCategoriesState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          data: null,
        }),
      );
  }, []);

  const fetchBrands = useCallback(() => {
    setBrandsState({ loading: true, error: null, data: null });
    getBrands()
      .then((res) => setBrandsState({ loading: false, error: null, data: res.brands }))
      .catch((err: unknown) =>
        setBrandsState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          data: null,
        }),
      );
  }, []);

  const fetchProducts = useCallback(
    (filters: { categoryId?: number; brandId?: number; search?: string; sort?: "price_asc" | "price_desc"; page?: number }) => {
      setProductsState({ loading: true, error: null, data: null });
      getProducts(filters)
        .then((res) => setProductsState({ loading: false, error: null, data: res }))
        .catch((err: unknown) =>
          setProductsState({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            data: null,
          }),
        );
    },
    [],
  );

  useEffect(() => {
    // Parallel initial load of all three public read endpoints.
    fetchCategories();
    fetchBrands();
    fetchProducts({});
  }, [fetchCategories, fetchBrands, fetchProducts]);

  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <h1>Phase-3 verification (throwaway page)</h1>

      <Section title={`Categories (${categoriesState.data?.length ?? "-"})`} state={categoriesState} />
      <hr />

      <Section title={`Brands (${brandsState.data?.length ?? "-"})`} state={brandsState} />
      <hr />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchProducts({
            categoryId: categoryId ? Number(categoryId) : undefined,
            brandId: brandId ? Number(brandId) : undefined,
            search: search || undefined,
            sort: sort ? (sort as "price_asc" | "price_desc") : undefined,
          });
        }}
      >
        <label>
          category_id{" "}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— all —</option>
            {categoriesState.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}: {c.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          brand_id{" "}
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">— all —</option>
            {brandsState.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id}: {b.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          search <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>{" "}
        <label>
          sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">— newest —</option>
            <option value="price_asc">price_asc</option>
            <option value="price_desc">price_desc</option>
          </select>
        </label>{" "}
        <button type="submit">Apply</button>
      </form>

      <Section
        title={`Products (total: ${productsState.data?.total ?? "-"}, page ${productsState.data?.current_page ?? "-"}, per_page ${productsState.data?.per_page ?? "-"})`}
        state={productsState}
      />
    </div>
  );
}
