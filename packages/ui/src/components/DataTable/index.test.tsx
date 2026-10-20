import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Column } from "./index";
import { DataTable } from "./index";

interface Row {
  id: number;
  name: string;
  price: string;
}

const rows: Row[] = [
  { id: 1, name: "Laptop", price: "120000" },
  { id: 2, name: "Router", price: "45000" },
  { id: 3, name: "Tablet", price: "80000" },
];

const columns: Column<Row>[] = [
  { key: "name", header: "Name", sortable: true },
  {
    key: "price",
    header: "Price",
    sortable: true,
    render: (row) => `Rs. ${row.price}`,
  },
];

const baseProps = {
  columns,
  rows,
  rowKey: (row: Row) => row.id,
};

describe("DataTable", () => {
  it("renders columns and rows, including custom render cells", () => {
    render(<DataTable {...baseProps} />);

    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();

    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Router")).toBeInTheDocument();
    expect(screen.getByText("Tablet")).toBeInTheDocument();

    expect(screen.getByText("Rs. 120000")).toBeInTheDocument();
    expect(screen.getByText("Rs. 45000")).toBeInTheDocument();
  });

  it("calls onSortChange with the right column, toggling asc→desc on repeat clicks", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        {...baseProps}
        sortColumn="name"
        sortDirection="asc"
        onSortChange={onSortChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(onSortChange).toHaveBeenLastCalledWith("name", "desc");

    rerender(
      <DataTable
        {...baseProps}
        sortColumn="name"
        sortDirection="desc"
        onSortChange={onSortChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(onSortChange).toHaveBeenLastCalledWith("name", "asc");

    rerender(
      <DataTable
        {...baseProps}
        sortColumn="name"
        sortDirection="asc"
        onSortChange={onSortChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Price" }));
    expect(onSortChange).toHaveBeenLastCalledWith("price", "asc");
  });

  it("renders a disabled sort indicator for non-sortable headers", () => {
    const nonSortable: Column<Row>[] = [
      { key: "name", header: "Name" },
      { key: "price", header: "Price" },
    ];
    render(<DataTable {...baseProps} columns={nonSortable} />);

    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
  });

  it("shows a neutral unsorted indicator on inactive sortable headers and a directional arrow on the active one", () => {
    render(
      <DataTable {...baseProps} sortColumn="name" sortDirection="asc" onSortChange={() => {}} />
    );

    const activeButton = screen.getByRole("button", { name: "Name" });
    const inactiveButton = screen.getByRole("button", { name: "Price" });

    expect(activeButton.querySelector("svg")).toHaveClass("-rotate-180");
    expect(activeButton.querySelector("svg")).not.toHaveClass("opacity-40");

    expect(inactiveButton.querySelector("svg")).toHaveClass("opacity-40");
    expect(inactiveButton.querySelector("svg")).not.toHaveClass("-rotate-180");
  });

  it("reflects the sort direction on the active column (asc vs desc)", () => {
    const { rerender } = render(
      <DataTable {...baseProps} sortColumn="name" sortDirection="asc" onSortChange={() => {}} />
    );

    expect(screen.getByRole("button", { name: "Name" }).querySelector("svg")).toHaveClass(
      "-rotate-180"
    );

    rerender(
      <DataTable {...baseProps} sortColumn="name" sortDirection="desc" onSortChange={() => {}} />
    );

    expect(screen.getByRole("button", { name: "Name" }).querySelector("svg")).not.toHaveClass(
      "-rotate-180"
    );
  });

  it("select-all selects and then deselects all row keys", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DataTable {...baseProps} selectable selectedRowKeys={[]} onSelectionChange={onSelectionChange} />
    );

    await user.click(screen.getByLabelText("Select all rows"));
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2, 3]);

    rerender(
      <DataTable {...baseProps} selectable selectedRowKeys={[1, 2, 3]} onSelectionChange={onSelectionChange} />
    );

    await user.click(screen.getByLabelText("Select all rows"));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("sets indeterminate on the select-all checkbox when only some rows are selected", () => {
    const { rerender } = render(
      <DataTable {...baseProps} selectable selectedRowKeys={[1]} />
    );

    expect(screen.getByLabelText("Select all rows")).toHaveProperty("indeterminate", true);

    rerender(
      <DataTable {...baseProps} selectable selectedRowKeys={[]} />
    );
    expect(screen.getByLabelText("Select all rows")).toHaveProperty("indeterminate", false);

    rerender(
      <DataTable {...baseProps} selectable selectedRowKeys={[1, 2, 3]} />
    );
    expect(screen.getByLabelText("Select all rows")).toHaveProperty("indeterminate", false);
  });

  it("toggles an individual row key on its checkbox", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DataTable {...baseProps} selectable selectedRowKeys={[1]} onSelectionChange={onSelectionChange} />
    );

    await user.click(screen.getByLabelText("Select row 2"));
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2]);

    rerender(
      <DataTable {...baseProps} selectable selectedRowKeys={[1, 2]} onSelectionChange={onSelectionChange} />
    );
    await user.click(screen.getByLabelText("Select row 1"));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2]);
  });

  it("renders row actions via the render prop for every row", () => {
    render(
      <DataTable
        {...baseProps}
        rowActions={(row) => <button type="button">Delete {row.name}</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Delete Laptop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Router" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Tablet" })).toBeInTheDocument();
  });

  it("renders pagination controls and calls onPageChange", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTable {...baseProps} page={2} pageCount={4} onPageChange={onPageChange} />
    );

    await user.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });

  it("disables prev at the first page and next at the last page", () => {
    const onPageChange = vi.fn();

    const { rerender } = render(
      <DataTable {...baseProps} page={1} pageCount={4} onPageChange={onPageChange} />
    );
    expect(screen.getByLabelText("Previous page")).toBeDisabled();

    rerender(
      <DataTable {...baseProps} page={4} pageCount={4} onPageChange={onPageChange} />
    );
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("shows skeleton rows while loading instead of real data", () => {
    render(<DataTable {...baseProps} isLoading />);

    expect(screen.getByText("Loading table")).toBeInTheDocument();
    expect(screen.queryByText("Laptop")).toBeNull();
  });

  it("renders the default empty state when rows is empty", () => {
    render(<DataTable {...baseProps} rows={[]} />);

    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show here yet.")).toBeInTheDocument();
  });

  it("renders a custom empty state when provided", () => {
    render(
      <DataTable {...baseProps} rows={[]} emptyState={<p>Custom empty message</p>} />
    );

    expect(screen.getByText("Custom empty message")).toBeInTheDocument();
    expect(screen.queryByText("No data")).toBeNull();
  });
});