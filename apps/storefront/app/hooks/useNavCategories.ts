import { getCategories, type Category } from "@ecommerce/api-client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys, TAXONOMY_STALE_TIME } from "./query-keys";

export interface NavCategory {
  id: number;
  name: string;
  slug: string;
  children: NavCategory[];
}

/**
 * The API returns a FLAT list keyed by `parent_category_id` (CategoryController
 * has no nested serializer), so the tree is rebuilt here. One unfiltered request
 * beats N+1 `parent_id` lookups on every header render.
 */
function buildTree(categories: Category[]): NavCategory[] {
  const childrenByParent = new Map<number, Category[]>();
  for (const category of categories) {
    if (category.parent_category_id === null) continue;
    const siblings = childrenByParent.get(category.parent_category_id);
    if (siblings) siblings.push(category);
    else childrenByParent.set(category.parent_category_id, [category]);
  }

  const toNode = (category: Category): NavCategory => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    children: (childrenByParent.get(category.id) ?? []).map(toNode),
  });

  // A category whose parent was filtered out (unpublished, or a broken
  // parent_category_id) would otherwise disappear from the nav entirely, so it
  // is promoted to a root entry rather than dropped.
  const knownIds = new Set(categories.map((category) => category.id));
  const roots = categories.filter(
    (category) =>
      category.parent_category_id === null ||
      !knownIds.has(category.parent_category_id)
  );

  return roots.map(toNode);
}

/**
 * Live category menu data. Returns an empty list while loading or on failure —
 * the header treats "no categories" and "categories unavailable" identically and
 * falls back to its static links, so the shell never depends on this resolving.
 */
export function useNavCategories() {
  const query = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => getCategories(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  const categories = useMemo(
    () => buildTree(query.data?.categories ?? []),
    [query.data]
  );

  return { categories, isPending: query.isPending };
}
