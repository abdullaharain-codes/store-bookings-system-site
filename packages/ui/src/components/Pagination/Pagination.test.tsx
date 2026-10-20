import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./index";

function renderPagination(
  props: Partial<Parameters<typeof Pagination>[0]> = {}
) {
  const onPageChange = props.onPageChange ?? vi.fn();
  const renderResult = render(
    <Pagination
      currentPage={1}
      lastPage={5}
      getHref={(page) => `#page-${page}`}
      onPageChange={onPageChange}
      {...props}
    />
  );
  return { ...renderResult, onPageChange };
}

describe("Pagination", () => {
  it("renders nothing when lastPage is 1 or lower", () => {
    const { container } = renderPagination({ lastPage: 1 });
    expect(container.firstChild).toBeNull();

    const { container: containerZero } = renderPagination({ lastPage: 0 });
    expect(containerZero.firstChild).toBeNull();
  });

  it("is a nav with a Pagination label and real page anchors", () => {
    renderPagination({ currentPage: 2, lastPage: 3 });

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByLabelText("Previous")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "href",
      "#page-1"
    );
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "href",
      "#page-3"
    );
    expect(screen.getByLabelText("Next")).toBeInTheDocument();
  });

  it("honours a custom aria label", () => {
    renderPagination({ ariaLabel: "Results pages" });
    expect(
      screen.getByRole("navigation", { name: "Results pages" })
    ).toBeInTheDocument();
  });

  it("marks the current page with aria-current", () => {
    renderPagination({ currentPage: 3, lastPage: 5 });

    const current = screen.getByLabelText("Page 3");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName).toBe("SPAN");
    // Non-current pages are real links, without aria-current.
    expect(screen.getByRole("link", { name: "Page 4" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("wraps the window in ellipses for a long page range", () => {
    renderPagination({ currentPage: 5, lastPage: 10 });

    // 1 … 4 5 6 … 10 — the numeric window sits around the current page.
    expect(screen.getByRole("link", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Page 5")).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Page 6" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 10" })).toBeInTheDocument();
    // Two gap markers either side of the window.
    expect(screen.getAllByText("\u2026")).toHaveLength(2);
  });

  it("collapses the window when every page fits it", () => {
    renderPagination({ currentPage: 2, lastPage: 4 });

    expect(screen.getByRole("link", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Page 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 4" })).toBeInTheDocument();
    expect(screen.queryAllByText("\u2026")).toHaveLength(0);
  });

  it("calls onPageChange and prevents navigation on a plain left click", async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination({ currentPage: 2, lastPage: 5 });

    await user.click(screen.getByRole("link", { name: "Page 1" }));

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(1);
    // preventDefault stopped the anchor's default `#page-1` navigation.
    expect(window.location.hash).toBe("");
  });

  it("calls onPageChange for Previous and Next too", async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination({ currentPage: 2, lastPage: 5 });

    await user.click(screen.getByLabelText("Previous"));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);

    await user.click(screen.getByLabelText("Next"));
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("leaves modified clicks to the browser", () => {
    const { onPageChange } = renderPagination({ currentPage: 2, lastPage: 5 });

    fireEvent.click(screen.getByRole("link", { name: "Page 1" }), {
      ctrlKey: true,
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { onPageChange, unmount } = renderPagination({
      currentPage: 1,
      lastPage: 5,
    });

    const previous = screen.getByLabelText("Previous");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).not.toHaveAttribute("href");
    fireEvent.click(previous);
    expect(onPageChange).not.toHaveBeenCalled();

    unmount();

    const lastPageResult = renderPagination({ currentPage: 5, lastPage: 5 });
    const next = screen.getByLabelText("Next");
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    fireEvent.click(next);
    expect(lastPageResult.onPageChange).not.toHaveBeenCalled();
  });
});