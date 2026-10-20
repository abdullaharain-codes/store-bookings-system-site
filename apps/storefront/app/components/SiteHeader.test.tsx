import { useAuthStore } from "@ecommerce/api-client";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader";
import {
  BRANDS_URL,
  CART_URL,
  CATEGORIES_URL,
  session,
  testUser,
} from "../test/handlers";
import { server } from "../test/server";
import { createTestQueryClient, renderWithProviders } from "../test/utils";

/** A single line item, for the singular accessible-name case. */
const oneCartItem = {
  id: 1,
  cart_id: 1,
  product_id: 11,
  quantity: 1,
  hold_expires_at: null,
  hold_status: "none" as const,
};

/**
 * Three auth states the header must tell apart. "Unknown" is deliberately a
 * separate case from "guest": flashing a Log in link while the session lookup
 * is still in flight would make a signed-in visitor look logged out.
 */
function setSession(state: "unknown" | "guest" | "authed") {
  useAuthStore.setState({
    isSessionChecked: state !== "unknown",
    isAuthenticated: state === "authed",
    user: state === "authed" ? testUser : null,
  });
}

/** The real store action, so the logout test can swap in a spy and put it back. */
const realLogout = useAuthStore.getState().logout;

afterEach(() => {
  useAuthStore.setState({
    isSessionChecked: false,
    isAuthenticated: false,
    user: null,
    logout: realLogout,
  });
});

describe("SiteHeader structure", () => {
  it("exposes banner, navigation and search landmarks", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(
      screen.getByRole("banner", { name: /site header/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("links the brand to the home page", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "TechFix" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("always offers the static Shop and Services links", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/shop"
    );
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/services"
    );
  });

  /**
   * The promo strip is a sibling of the header, not a child: a sticky bar
   * wrapped in a header-sized element is pinned for only its own height. The
   * layout owns the strip; the header owns the single banner landmark.
   */
  it("leaves the announcement strip to the layout", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(screen.queryByTestId("site-announcement")).not.toBeInTheDocument();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });
});

describe("SiteHeader live taxonomy", () => {
  it("builds the category menu from the API, nesting children under parents", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = await screen.findByRole("button", { name: /categories/i });
    await userEvent.click(toggle);

    const menu = screen.getByRole("group", { name: /categories/i });
    expect(within(menu).getByRole("link", { name: "Laptops" })).toHaveAttribute(
      "href",
      "/shop/category/laptops"
    );
    expect(within(menu).getByRole("link", { name: "Gaming Laptops" })).toHaveAttribute(
      "href",
      "/shop/category/gaming-laptops"
    );
    expect(within(menu).getByRole("link", { name: "Accessories" })).toHaveAttribute(
      "href",
      "/shop/category/accessories"
    );

    // A child must not be promoted to a top-level entry of its own.
    expect(within(menu).getAllByRole("link")).toHaveLength(4);
  });

  it("builds the brand menu from the API", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    await userEvent.click(await screen.findByRole("button", { name: /brands/i }));

    const menu = screen.getByRole("group", { name: /brands/i });
    expect(within(menu).getByRole("link", { name: "Dell" })).toHaveAttribute(
      "href",
      "/shop/brand/dell"
    );
    expect(within(menu).getByRole("link", { name: "HP" })).toHaveAttribute(
      "href",
      "/shop/brand/hp"
    );
  });

  /**
   * A <ul> may only ever contain <li>, so a sub-list has to live inside its
   * parent <li>. Emitting <ul><ul>… silently drops the nesting in real
   * browsers, which is why this is asserted structurally rather than by eye.
   */
  it("nests sub-categories inside the parent list item", async () => {
    setSession("guest");
    const { container } = renderWithProviders(<SiteHeader />);

    await userEvent.click(await screen.findByRole("button", { name: /categories/i }));

    // The fixture has one parent with two children, so the tree is really
    // expanded at this point.
    expect(
      screen.getByRole("link", { name: "Gaming Laptops" })
    ).toBeInTheDocument();
    expect(container.querySelectorAll("ul > ul")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Gaming Laptops" }).closest("li")
        ?.parentElement?.tagName
    ).toBe("UL");
  });

  it("keeps the static links and stays quiet when the taxonomy request fails", async () => {
    setSession("guest");
    server.use(
      http.get(CATEGORIES_URL, () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      ),
      http.get(BRANDS_URL, () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      )
    );
    renderWithProviders(<SiteHeader />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Shop" })).toBeInTheDocument()
    );

    expect(screen.getByRole("link", { name: "Services" })).toBeInTheDocument();
    // No raw transport message and no half-built menu.
    expect(screen.queryByText(/server error/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /categories/i })).not.toBeInTheDocument();
  });

  it("treats an empty taxonomy as a valid answer", async () => {
    setSession("guest");
    server.use(
      http.get(CATEGORIES_URL, () => HttpResponse.json({ categories: [] })),
      http.get(BRANDS_URL, () => HttpResponse.json({ brands: [] }))
    );
    renderWithProviders(<SiteHeader />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Shop" })).toBeVisible());
    expect(screen.getByRole("link", { name: "Services" })).toBeVisible();
    expect(screen.queryByRole("group", { name: /categories/i })).not.toBeInTheDocument();
  });
});

describe("SiteHeader search", () => {
  it("submits a trimmed term to /shop using the API's search param", async () => {
    setSession("guest");
    const { probe } = renderWithProviders(<SiteHeader />);

    await userEvent.type(screen.getByRole("searchbox"), "  dell laptop  ");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(probe.path).toBe("/shop?search=dell+laptop");
  });

  it("does not navigate on an empty or whitespace-only search", async () => {
    setSession("guest");
    const { probe } = renderWithProviders(<SiteHeader />, { entry: "/services" });

    await userEvent.type(screen.getByRole("searchbox"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(probe.path).toBe("/services");
  });
});

describe("SiteHeader auth area", () => {
  it("stays neutral while the session is still unknown", () => {
    setSession("unknown");
    renderWithProviders(<SiteHeader />);

    expect(screen.queryByRole("link", { name: /^log in$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log ?out/i })).not.toBeInTheDocument();
  });

  it("shows a log in link to a known guest", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.queryByRole("button", { name: /log ?out/i })).not.toBeInTheDocument();
  });

  /**
   * "Log in" is a word, not a glyph. Reusing the round icon-button classes gave
   * it a 40x40 hit target and centred two words in a circle.
   */
  it("styles the guest log in link as a padded text link", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const login = screen.getByRole("link", { name: /^log in$/i });
    expect(login.className).not.toMatch(/rounded-full/);
    expect(login.className).not.toMatch(/\bh-10\b/);
    expect(login.className).not.toMatch(/\bw-10\b/);
    expect(login.className).toMatch(/\bpx-\d/);
    expect(login.className).toMatch(/\bpy-\d/);
  });

  it("keeps the account button round but pads the log out button to match", () => {
    setSession("authed");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Account" }).className).toMatch(
      /rounded-full/
    );

    const logout = screen.getByRole("button", { name: /log ?out/i });
    expect(logout.className).toMatch(/\bpx-\d/);
    expect(logout.className).toMatch(/\bpy-\d/);
  });

  it("shows account and log out to a signed-in visitor", () => {
    setSession("authed");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute(
      "href",
      "/account"
    );
    expect(
      screen.getByRole("button", { name: /log ?out/i })
    ).toBeInTheDocument();
  });

  it("logs out, clears the per-user caches and returns home", async () => {
    const logout = vi.fn(async () => {
      useAuthStore.setState({ isAuthenticated: false, user: null });
    });
    useAuthStore.setState({ logout });

    setSession("authed");
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["cart"], { cart: { items: [] } });
    queryClient.setQueryData(["wishlist"], { wishlist: [] });

    const { probe } = renderWithProviders(<SiteHeader />, { queryClient });

    await userEvent.click(screen.getByRole("button", { name: /log ?out/i }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["cart"])).toBeUndefined();
    expect(queryClient.getQueryData(["wishlist"])).toBeUndefined();
    await waitFor(() => expect(probe.path).toBe("/"));
  });
});

describe("SiteHeader cart badge", () => {
  it("puts the item count in the link's accessible name", async () => {
    // The cart endpoint is session-gated, so the in-memory session has to be
    // live for the count to arrive.
    session.start();
    setSession("authed");
    renderWithProviders(<SiteHeader />);

    const cart = await screen.findByRole("link", { name: /cart/i });
    await waitFor(() => expect(cart).toHaveAccessibleName("Cart, 2 items"));
  });

  it("keeps a plain name when the count is unknown", () => {
    setSession("authed");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Cart" })).toHaveAttribute(
      "href",
      "/cart"
    );
  });

  it("uses the singular for exactly one item", async () => {
    session.start();
    setSession("authed");
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({
          cart: { id: 1, user_id: testUser.id, items: [oneCartItem] },
        })
      )
    );
    renderWithProviders(<SiteHeader />);

    const cart = await screen.findByRole("link", { name: /cart/i });
    await waitFor(() => expect(cart).toHaveAccessibleName("Cart, 1 item"));
  });

  it("drops the count entirely for an empty cart", async () => {
    session.start();
    setSession("authed");
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({
          cart: { id: 1, user_id: testUser.id, items: [] },
        })
      )
    );
    renderWithProviders(<SiteHeader />);

    // A badge reading "0" is noise, so the name stays plain.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Cart" })).toBeInTheDocument()
    );
    expect(screen.queryByTestId("cart-count")).not.toBeInTheDocument();
  });

  it("does not request a cart for a guest", async () => {
    setSession("guest");
    const queryClient = createTestQueryClient();
    renderWithProviders(<SiteHeader />, { queryClient });

    await waitFor(() => expect(screen.getByRole("link", { name: "Cart" })).toBeVisible());
    expect(queryClient.getQueryData(["cart"])).toBeUndefined();
  });

  it("exposes a wishlist link", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Wishlist" })).toHaveAttribute(
      "href",
      "/wishlist"
    );
  });
});

describe("SiteHeader category dropdown dismissal", () => {
  it("closes when a pointer press lands outside it", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = await screen.findByRole("button", { name: /categories/i });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // pointerdown specifically, with focus deliberately left on the toggle, so
    // this cannot pass by accident via the focusout handler.
    fireEvent.pointerDown(document.body);


    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("group", { name: /categories/i })).not.toBeInTheDocument();
  });

  it("closes once focus tabs out of it, but not while focus moves inside", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = await screen.findByRole("button", { name: /categories/i });
    await userEvent.click(toggle);

    // Tabbing from the toggle onto the first panel link stays inside.
    await userEvent.tab();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Keep tabbing until focus leaves the dropdown entirely.
    for (let i = 0; i < 12; i += 1) {
      if (toggle.getAttribute("aria-expanded") === "false") break;
      await userEvent.tab();
    }

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the other dropdown opens", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const categories = await screen.findByRole("button", { name: /categories/i });
    const brands = screen.getByRole("button", { name: /brands/i });

    await userEvent.click(categories);
    expect(categories).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(brands);

    expect(brands).toHaveAttribute("aria-expanded", "true");
    expect(categories).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: /categories/i })).not.toBeInTheDocument();
  });
});

describe("SiteHeader mobile menu", () => {
  it("is a closed disclosure until the button is pressed", () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: /mobile/i })).not.toBeInTheDocument();
  });

  it("wires aria-controls to the panel it reveals", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = screen.getByRole("button", { name: /open menu/i });
    await userEvent.click(toggle);

    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the toggle", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    const toggle = screen.getByRole("button", { name: /open menu/i });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(toggle).toHaveFocus();
  });

  it("closes when a link inside it is followed", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />, { entry: "/" });

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const panel = screen.getByRole("navigation", { name: /mobile/i });
    await userEvent.click(within(panel).getByRole("link", { name: "Services" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /open menu/i })
      ).toHaveAttribute("aria-expanded", "false")
    );
  });

  it("reaches the same links as the desktop navigation", async () => {
    setSession("guest");
    renderWithProviders(<SiteHeader />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const panel = screen.getByRole("navigation", { name: /mobile/i });

    expect(within(panel).getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/shop"
    );
    expect(within(panel).getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/services"
    );
    expect(within(panel).getByRole("link", { name: "Cart" })).toHaveAttribute(
      "href",
      "/cart"
    );
  });
});
