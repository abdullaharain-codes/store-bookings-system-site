import { getBrands } from "@ecommerce/api-client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys, TAXONOMY_STALE_TIME } from "./query-keys";

export interface NavBrand {
  id: number;
  name: string;
  slug: string;
}

/**
 * Live brand menu data, with the same empty-on-failure contract as
 * useNavCategories: a header that cannot reach the API still navigates.
 */
export function useNavBrands() {
  const query = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => getBrands(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  const brands = useMemo<NavBrand[]>(
    () =>
      (query.data?.brands ?? []).map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
      })),
    [query.data]
  );

  return { brands, isPending: query.isPending };
}
