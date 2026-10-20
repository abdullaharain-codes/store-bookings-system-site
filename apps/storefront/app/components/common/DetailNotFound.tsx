import { Link } from "react-router";
import { Breadcrumb, type BreadcrumbItem } from "@ecommerce/ui";
import { PageHeading } from "./PageHeading";

/**
 * Shared not-found block for the detail pages (TASK B3-3). Product and service
 * detail pages both render it so the 404 layout — breadcrumb, exactly one h1,
 * message, back link — is defined once instead of copy-pasted. The noindex meta
 * and the document title stay in the calling page component.
 */
interface DetailNotFoundProps {
  title: string;
  message: string;
  breadcrumbItems: BreadcrumbItem[];
  backHref: string;
  backLabel: string;
  onNavigate?: (href: string) => void;
}

export function DetailNotFound({
  title,
  message,
  breadcrumbItems,
  backHref,
  backLabel,
  onNavigate,
}: DetailNotFoundProps) {
  return (
    <>
      <Breadcrumb items={breadcrumbItems} onNavigate={onNavigate} />
      <PageHeading>{title}</PageHeading>
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      <p>
        <Link
          to={backHref}
          className="text-sm font-medium text-[var(--color-brand-accent)] hover:underline"
        >
          {backLabel}
        </Link>
      </p>
    </>
  );
}