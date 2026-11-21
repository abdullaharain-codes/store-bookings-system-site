import type { ComponentProps } from "react";
import type { Badge } from "@ecommerce/ui";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

/** ONE named status -> badge variant map (kept outside the component file). */
const ORDER_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  pending: "warning",
  confirmed: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "error",
};

export function orderStatusBadgeVariant(status: string): BadgeVariant {
  return ORDER_STATUS_BADGE_VARIANT[status] ?? "default";
}
