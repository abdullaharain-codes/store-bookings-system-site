import { type ReactNode } from "react";
import { clsx } from "clsx";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (columnKey: string, direction: "asc" | "desc") => void;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  rowActions?: (row: T) => ReactNode;
  selectable?: boolean;
  selectedRowKeys?: (string | number)[];
  onSelectionChange?: (keys: (string | number)[]) => void;
  isLoading?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

function SortArrow({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg
      className={clsx(
        "h-[14px] w-[14px]",
        direction === "asc" ? "-rotate-180" : ""
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SortUnsortedIcon() {
  return (
    <svg
      className="h-[14px] w-[14px] text-[var(--color-text-muted)] opacity-40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 9l4-4 4 4" />
      <path d="M8 15l4 4 4-4" />
    </svg>
  );
}

const cellValue = <T,>(row: T, key: string): string => {
  const value = (row as unknown as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortColumn,
  sortDirection,
  onSortChange,
  page,
  pageCount,
  onPageChange,
  rowActions,
  selectable = false,
  selectedRowKeys = [],
  onSelectionChange,
  isLoading = false,
  emptyState,
  className,
}: DataTableProps<T>) {
  const rowKeys = rows.map(rowKey);
  const allSelected =
    rowKeys.length > 0 && rowKeys.every((key) => selectedRowKeys.includes(key));
  const someSelected = !allSelected && rowKeys.some((key) => selectedRowKeys.includes(key));

  const visibleColumnCount =
    columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  const toggleAll = () => {
    if (!onSelectionChange) {
      return;
    }
    onSelectionChange(allSelected ? [] : rowKeys);
  };

  const toggleRow = (key: string | number) => {
    if (!onSelectionChange) {
      return;
    }
    const next = selectedRowKeys.includes(key)
      ? selectedRowKeys.filter((existing) => existing !== key)
      : [...selectedRowKeys, key];
    onSelectionChange(next);
  };

  const handleSort = (column: Column<T>) => {
    if (!onSortChange) {
      return;
    }
    const nextDirection =
      sortColumn === column.key && sortDirection === "asc" ? "desc" : "asc";
    onSortChange(column.key, nextDirection);
  };

  return (
    <div className={className}>
      <div className="w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)]">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[var(--color-border-default)] text-[length:var(--font-size-sm)] text-[var(--color-text-muted)]">
            <tr>
              {selectable && (
                <th scope="col" className="px-6 py-4 font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = someSelected;
                      }
                    }}
                    disabled={!onSelectionChange}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sortColumn === column.key
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={clsx(
                    "px-6 py-4 font-medium",
                    column.sortable && onSortChange && "p-0"
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className={clsx(
                        "inline-flex min-h-[44px] items-center gap-[var(--space-1)] px-6 font-medium",
                        "transition-colors duration-[var(--motion-duration-fast)] hover:text-[var(--color-text-primary)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
                      )}
                    >
                      {column.header}
                      {sortColumn === column.key ? (
                        <SortArrow direction={sortDirection ?? "asc"} />
                      ) : (
                        <SortUnsortedIcon />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="px-6 py-4 text-right font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          {isLoading ? (
            <tbody aria-busy="true">
              <tr className="sr-only">
                <td colSpan={visibleColumnCount} role="status">
                  Loading table
                </td>
              </tr>
              {Array.from({ length: 5 }, (_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-[var(--color-border-default)] last:border-b-0"
                >
                  {Array.from({ length: visibleColumnCount }, (_, cellIndex) => (
                    <td key={cellIndex} className="px-6 py-4">
                      <div className="h-3 w-full animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={visibleColumnCount} className="px-0 py-0">
                  {emptyState ?? (
                    <EmptyState
                      title="No data"
                      description="Nothing to show here yet."
                    />
                  )}
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const selected = selectedRowKeys.includes(key);
                return (
                  <tr
                    key={key}
                    className="border-b border-[var(--color-border-default)] transition-colors last:border-b-0 hover:bg-[var(--color-surface-muted)]/40"
                  >
                    {selectable && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${key}`}
                          checked={selected}
                          disabled={!onSelectionChange}
                          onChange={() => toggleRow(key)}
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="px-6 py-4 text-[length:var(--font-size-md)] text-[var(--color-text-primary)]"
                      >
                        {column.render
                          ? column.render(row)
                          : cellValue(row, column.key)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-6 py-4 text-right">{rowActions(row)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {page !== undefined && onPageChange && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-default)] p-[var(--space-4)] text-sm text-[var(--color-text-muted)]">
          <span>
            Page {page}
            {pageCount !== undefined ? ` of ${pageCount}` : ""}
          </span>
          <div className="flex items-center gap-[var(--space-2)]">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <SortArrow direction="asc" />
            </Button>
            {pageCount !== undefined &&
              Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <Button
                    key={pageNumber}
                    size="sm"
                    variant={pageNumber === page ? "primary" : "secondary"}
                    aria-label={`Page ${pageNumber}`}
                    aria-current={pageNumber === page ? "page" : undefined}
                    onClick={() => onPageChange(pageNumber)}
                    className="min-w-[44px] px-3"
                  >
                    {pageNumber}
                  </Button>
                )
              )}
            <Button
              size="sm"
              variant="secondary"
              aria-label="Next page"
              disabled={pageCount !== undefined && page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              <SortArrow direction="desc" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}