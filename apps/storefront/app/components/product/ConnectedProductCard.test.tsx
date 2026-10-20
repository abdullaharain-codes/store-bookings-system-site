import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { callCounts, session, testProductDetails, testUser } from "../../test/handlers";
import { renderWithProviders } from "../../test/utils";
import { ADD_TO_CART_SUCCESS_MESSAGE } from "../../hooks/useAddToCart";
import { ConnectedProductCard } from "./ConnectedProductCard";

const inStock = testProductDetails.find((p) => p.id === 11)!;
const outOfStock = testProductDetails.find((p) => p.id === 13)!;

function resetSessionState() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: false,
  });
  sessionStorage.clear();
}

describe("ConnectedProductCard", () => {
  beforeEach(() => {
    resetSessionState();
  });

  it("renders a live Add to Cart on every card, for in-stock products", async () => {
    renderWithProviders(
      <>
        <ConnectedProductCard product={inStock} href="/product/dell-xps-15" />
        <ConnectedProductCard product={inStock} href="/product/dell-xps-15" />
      </>,
      { entry: "/shop" }
    );

    expect(screen.getAllByRole("button", { name: "Add to Cart" })).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: "Add to wishlist" })
        .every((b) => (b as HTMLButtonElement).disabled)
    ).toBe(true);
  });

  it("authenticated: clicking Add to Cart posts product + quantity and announces politely", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectedProductCard product={inStock} href="/product/dell-xps-15" />,
      { entry: "/shop", withAnnouncer: true }
    );

    await user.click(screen.getByRole("button", { name: "Add to Cart" }));

    // B4-1c: the message now goes through the site's single live region, not a
    // per-card status. The region is always mounted, so wait for its text.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        ADD_TO_CART_SUCCESS_MESSAGE
      )
    );
    expect(callCounts.cartItems).toBe(1);
  });

  it("guest: clicking Add to Cart defers to /login with no cart request", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    session.start();
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <ConnectedProductCard product={inStock} href="/product/dell-xps-15" />,
      { entry: "/shop" }
    );

    await user.click(screen.getByRole("button", { name: "Add to Cart" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);
  });

  it("an out-of-stock product keeps Add to Cart inert even when the hook is wired", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectedProductCard product={outOfStock} href="/product/dell-latitude-5440" />,
      { entry: "/shop", withAnnouncer: true }
    );

    const addToCart = screen.getByRole("button", { name: "Add to Cart" });
    expect(addToCart).toBeDisabled();
    await user.click(addToCart);
    expect(callCounts.cartItems).toBe(0);
    // Nothing was announced: the always-mounted region stays empty.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("passes the detail href through so the card remains a link to the product", async () => {
    renderWithProviders(
      <ConnectedProductCard product={inStock} href="/product/dell-xps-15" />,
      { entry: "/shop" }
    );

    expect(screen.getAllByRole("link", { name: /Dell XPS 15/ }).at(0)).toHaveAttribute(
      "href",
      "/product/dell-xps-15"
    );
  });
});