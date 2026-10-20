import { act, render, screen, waitFor } from "@testing-library/react";
import { useAuthStore, type User } from "@ecommerce/api-client";
import {
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RequireAuth, { buildLoginRedirectState } from "./require-auth";

const user: User = {
  id: 7,
  name: "Ada",
  email: "ada@example.test",
  role: null,
};

function LoginRoute() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? null;
  return (
    <div>
      <h1>Sign in</h1>
      <p data-testid="from">{from === null ? "none" : from}</p>
    </div>
  );
}

function CartRoute() {
  return <h1>Cart</h1>;
}

function OrdersRoute() {
  return <h1>Orders</h1>;
}

function routes(children: RouteObject[]): RouteObject[] {
  return [
      {
        path: "/",
        element: <RequireAuth />,
        children,
      },
    { path: "/login", element: <LoginRoute /> },
  ];
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    routes([
      { path: "cart", element: <CartRoute /> },
      { path: "account/orders", element: <OrdersRoute /> },
    ]),
    { initialEntries: [path] }
  );

  render(<RouterProvider router={router} />);

  return router;
}

describe("RequireAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isSessionChecked: false,
    });
  });

  afterEach(() => {
    useAuthStore.setState({ isSessionChecked: true });
  });

  describe("session not checked", () => {
    it("shows an accessible loading status", () => {
      renderAt("/cart");

      const status = screen.getByRole("status");
      expect(status).toBeInTheDocument();
      expect(status).toHaveAccessibleName("Checking your session");
    });

    it("does not flash protected content", () => {
      renderAt("/cart");

      expect(screen.queryByRole("heading", { name: "Cart" })).toBeNull();
    });

    it("does not redirect yet", () => {
      const router = renderAt("/cart");

      expect(router.state.location.pathname).toBe("/cart");
      expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    });
  });

  describe("checked guest", () => {
    beforeEach(() => {
      useAuthStore.setState({ isSessionChecked: true, isAuthenticated: false });
    });

    it("lands on /login with state.from set to /cart", async () => {
      const router = renderAt("/cart");

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(screen.getByTestId("from")).toHaveTextContent("/cart");
    });

    it("preserves the query string in state.from", async () => {
      const router = renderAt("/account/orders?page=2");

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(screen.getByTestId("from")).toHaveTextContent(
        "/account/orders?page=2"
      );
    });

    it("replaces the history entry so Back does not loop through the guard", async () => {
      const router = renderAt("/cart");

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(router.state.historyAction).toBe("REPLACE");
    });
  });

  describe("checked and authenticated", () => {
    beforeEach(() => {
      useAuthStore.setState({
        isSessionChecked: true,
        isAuthenticated: true,
        user,
      });
    });

    it("renders the protected child", () => {
      renderAt("/cart");

      expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
    });

    it("renders a nested protected child", () => {
      renderAt("/account/orders?page=2");

      expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    });

    it("does not render the loading status", () => {
      renderAt("/cart");

      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("transitions", () => {
    it("moves from the loading status to a redirect when the check settles as guest", async () => {
      const router = renderAt("/cart");

      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        useAuthStore.setState({
          isSessionChecked: true,
          isAuthenticated: false,
        });
      });

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    });

    it("moves from the loading status to the child when the check settles as signed in", async () => {
      renderAt("/cart");

      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        useAuthStore.setState({
          isSessionChecked: true,
          isAuthenticated: true,
          user,
        });
      });

      expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("buildLoginRedirectState", () => {
    it("keeps a plain internal path", () => {
      expect(
        buildLoginRedirectState({ pathname: "/cart", search: "" })
      ).toEqual({ from: "/cart" });
    });

    it("keeps the query string", () => {
      expect(
        buildLoginRedirectState({
          pathname: "/account/orders",
          search: "?page=2",
        })
      ).toEqual({ from: "/account/orders?page=2" });
    });

    // The router cannot produce these, so they are covered here rather than
    // through a rendered navigation. A leak would be an open redirect on
    // /login, which consumes state.from as a destination.
    it.each([
      ["protocol-relative", { pathname: "//evil.test", search: "" }],
      ["absolute URL", { pathname: "https://evil.test/steal", search: "" }],
      ["backslash", { pathname: "/cart\\..\\evil", search: "" }],
      ["empty", { pathname: "", search: "" }],
    ])("omits from for a %s path", (_label, location) => {
      expect(buildLoginRedirectState(location)).toBeUndefined();
    });
  });
});
