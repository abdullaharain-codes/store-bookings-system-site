import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const csrfClient = { get: vi.fn() };
  return {
    csrfClient,
    axiosCreate: vi.fn(
      (_config: { baseURL?: string; withCredentials?: boolean }) => csrfClient
    ),
    get: vi.fn(),
    post: vi.fn(),
  };
});

vi.mock("axios", () => ({ default: { create: mocks.axiosCreate } }));
vi.mock("../api-client", () => ({
  default: { get: mocks.get, post: mocks.post },
}));

import { useAuthStore } from "./auth-store";
import type { User } from "./auth-store";

const user: User = {
  id: 4,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 1, name: "Customer", slug: "customer" },
};

const adminUser: User = { ...user, id: 9, role: { id: 2, name: "Admin", slug: "admin" } };

// Captured after the static import has evaluated the module-level
// `axios.create` call, because beforeEach clears the mock's call record.
const csrfClientConfig = mocks.axiosCreate.mock.calls[0]?.[0] as {
  baseURL: string;
  withCredentials: boolean;
};

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: false,
  });
}

describe("useAuthStore", () => {
  beforeEach(() => {
    mocks.csrfClient.get.mockReset();
    mocks.axiosCreate.mockClear();
    mocks.get.mockReset();
    mocks.post.mockReset();
    resetStore();
  });

  it("starts unauthenticated with no error, no field errors and no loading flag", () => {
    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.fieldErrors).toBeNull();
  });

  it("creates the CSRF client against the server origin, not the /api/v1 base", () => {
    expect(csrfClientConfig).toEqual({
      baseURL: "http://localhost:8000",
      withCredentials: true,
    });
  });

  describe("login", () => {
    it("fetches the CSRF cookie, posts credentials, then reads the user", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().login("ada@example.test", "secret");

      expect(mocks.csrfClient.get).toHaveBeenCalledWith("/sanctum/csrf-cookie");
      expect(mocks.post).toHaveBeenCalledWith("/auth/login", {
        email: "ada@example.test",
        password: "secret",
      });
      expect(mocks.get).toHaveBeenCalledWith("/auth/user");
    });

    it("runs the CSRF step before the login request", async () => {
      const order: string[] = [];
      mocks.csrfClient.get.mockImplementation(async () => {
        order.push("csrf");
        return {};
      });
      mocks.post.mockImplementation(async () => {
        order.push("login");
        return { data: {} };
      });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().login("ada@example.test", "secret");

      expect(order).toEqual(["csrf", "login"]);
    });

    it("stores the user and marks the session authenticated", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().login("ada@example.test", "secret");

      const state = useAuthStore.getState();
      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("stores the role from the session payload", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user: adminUser } });

      await useAuthStore.getState().login("admin@example.test", "secret");

      expect(useAuthStore.getState().user?.role).toEqual({
        id: 2,
        name: "Admin",
        slug: "admin",
      });
    });

    it("toggles isLoading off after a successful login", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });
      const seen: boolean[] = [];
      const unsubscribe = useAuthStore.subscribe((state) => seen.push(state.isLoading));

      await useAuthStore.getState().login("ada@example.test", "secret");
      unsubscribe();

      expect(seen).toContain(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("keeps the user null, sets the error and rethrows on a 401", async () => {
      const failure = Object.assign(new Error("Request failed with status code 401"), {
        response: { status: 401, data: { message: "Invalid credentials." } },
        isAxiosError: true,
      });
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(failure);

      await expect(
        useAuthStore.getState().login("ada@example.test", "wrong")
      ).rejects.toBe(failure);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Invalid email or password");
    });

    it("keeps the user null, sets the error and rethrows on a 422", async () => {
      const failure = Object.assign(new Error("Request failed with status code 422"), {
        response: { status: 422, data: { message: "The email field is required." } },
        isAxiosError: true,
      });
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(failure);

      await expect(
        useAuthStore.getState().login("ada@example.test", "wrong")
      ).rejects.toBe(failure);

      expect(useAuthStore.getState().error).toBe("Invalid email or password");
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("does not read the session when the login request fails", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(new Error("network"));

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toThrow();

      expect(mocks.get).not.toHaveBeenCalled();
    });

    it("surfaces the generic message when the CSRF step fails", async () => {
      mocks.csrfClient.get.mockRejectedValue(new Error("csrf unavailable"));

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toThrow("csrf unavailable");

      // A preflight failure is not a credential problem.
      expect(useAuthStore.getState().error).toBe(
        "Something went wrong. Please try again."
      );
      expect(mocks.post).not.toHaveBeenCalled();
    });

    it("reports the rate limit message on a 429", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Too Many Attempts"), {
          response: { status: 429, data: { message: "Too many attempts." } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBe(
        "Too many login attempts. Please wait a moment and try again."
      );
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it("reports the generic message on a network error with no response", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      const failure = Object.assign(new Error("Network Error"), {
        code: "ERR_NETWORK",
        isAxiosError: true,
      });
      mocks.post.mockRejectedValue(failure);

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toBe(failure);

      expect(useAuthStore.getState().error).toBe(
        "Something went wrong. Please try again."
      );
    });

    it("reports the generic message on a 500", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Server Error"), {
          response: { status: 500, data: { message: "Server Error" } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toThrow();

      expect(useAuthStore.getState().error).toBe(
        "Something went wrong. Please try again."
      );
    });

    it("never leaks the server error text into the message", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("SQLSTATE[HY000] connection refused"), {
          response: { status: 500, data: { message: "SQLSTATE[HY000] ..." } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore.getState().login("ada@example.test", "secret")
      ).rejects.toThrow();

      expect(useAuthStore.getState().error).not.toContain("SQLSTATE");
    });

    it("clears a previous error before retrying", async () => {
      useAuthStore.setState({ error: "Invalid email or password" });
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().login("ada@example.test", "secret");

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("register", () => {
    it("fetches the CSRF cookie, posts the snake_cased payload, then reads the user", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore
        .getState()
        .register("Ada Lovelace", "ada@example.test", "secret", "secret");

      expect(mocks.csrfClient.get).toHaveBeenCalledWith("/sanctum/csrf-cookie");
      expect(mocks.post).toHaveBeenCalledWith("/auth/register", {
        name: "Ada Lovelace",
        email: "ada@example.test",
        password: "secret",
        password_confirmation: "secret",
      });
      expect(mocks.get).toHaveBeenCalledWith("/auth/user");
    });

    it("authenticates the user on success", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore
        .getState()
        .register("Ada Lovelace", "ada@example.test", "secret", "secret");

      const state = useAuthStore.getState();
      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("keeps the user null and sets a registration error on 422", async () => {
      const failure = Object.assign(new Error("Request failed with status code 422"), {
        response: { status: 422, data: { errors: { email: ["already taken"] } } },
        isAxiosError: true,
      });
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(failure);

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toBe(failure);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(
        "Registration failed. Please check your details and try again."
      );
    });

    it("stores Laravel field errors from a 422", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 422"), {
          response: {
            status: 422,
            data: {
              message: "The given data was invalid.",
              errors: {
                email: ["The email has already been taken."],
                password: ["The password must be at least 8 characters."],
              },
            },
          },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "short", "short")
      ).rejects.toThrow();

      expect(useAuthStore.getState().fieldErrors).toEqual({
        email: ["The email has already been taken."],
        password: ["The password must be at least 8 characters."],
      });
    });

    it("stores null field errors when a 422 carries no errors object", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 422"), {
          response: { status: 422, data: { message: "The given data was invalid." } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      expect(useAuthStore.getState().fieldErrors).toBeNull();
      expect(useAuthStore.getState().error).toBe(
        "Registration failed. Please check your details and try again."
      );
    });

    it("ignores a malformed errors payload", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 422"), {
          response: { status: 422, data: { errors: { email: "not-an-array" } } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      expect(useAuthStore.getState().fieldErrors).toBeNull();
    });

    it("reports the registration rate limit message on a 429 without field errors", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Too Many Attempts"), {
          response: { status: 429, data: { message: "Too many attempts." } },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBe(
        "Too many attempts. Please wait a moment and try again."
      );
      expect(state.fieldErrors).toBeNull();
    });

    it("reports the generic message on a 500", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Server Error"), {
          response: { status: 500, data: {} },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBe("Something went wrong. Please try again.");
      expect(state.fieldErrors).toBeNull();
    });

    it("clears stale field errors when a new attempt starts", async () => {
      useAuthStore.setState({
        error: "Registration failed. Please check your details and try again.",
        fieldErrors: { email: ["The email has already been taken."] },
      });
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore
        .getState()
        .register("Ada", "ada@example.test", "secret", "secret");

      const state = useAuthStore.getState();
      expect(state.fieldErrors).toBeNull();
      expect(state.error).toBeNull();
    });

    it("replaces the previous field errors on a second failed attempt", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValueOnce(
        Object.assign(new Error("422"), {
          response: { status: 422, data: { errors: { email: ["taken"] } } },
          isAxiosError: true,
        })
      );
      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();
      expect(useAuthStore.getState().fieldErrors).toEqual({ email: ["taken"] });

      mocks.post.mockRejectedValueOnce(
        Object.assign(new Error("422"), {
          response: { status: 422, data: { errors: { name: ["too short"] } } },
          isAxiosError: true,
        })
      );
      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      expect(useAuthStore.getState().fieldErrors).toEqual({ name: ["too short"] });
    });

    it("clears field errors on a successful retry", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValueOnce(
        Object.assign(new Error("422"), {
          response: { status: 422, data: { errors: { email: ["taken"] } } },
          isAxiosError: true,
        })
      );
      await expect(
        useAuthStore
          .getState()
          .register("Ada", "ada@example.test", "secret", "secret")
      ).rejects.toThrow();

      mocks.post.mockResolvedValueOnce({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });
      await useAuthStore
        .getState()
        .register("Ada", "new@example.test", "secret", "secret");

      const state = useAuthStore.getState();
      expect(state.fieldErrors).toBeNull();
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe("isSessionChecked", () => {
    it("starts false before any session lookup", () => {
      expect(useAuthStore.getState().isSessionChecked).toBe(false);
    });

    it("becomes true after fetchUser succeeds", async () => {
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
    });

    it("becomes true after fetchUser gets a 401", async () => {
      mocks.get.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 401"), {
          response: { status: 401 },
          isAxiosError: true,
        })
      );

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("becomes true after fetchUser fails without a response", async () => {
      mocks.get.mockRejectedValue(new Error("Network Error"));

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("becomes true after a successful login", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().login("ada@example.test", "secret");

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
    });

    it("becomes true after a successful register", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockResolvedValue({ data: {} });
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore
        .getState()
        .register("Ada", "ada@example.test", "secret", "secret");

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
    });

    it("stays false when login fails before a session is established", async () => {
      mocks.csrfClient.get.mockResolvedValue({});
      mocks.post.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 401"), {
          response: { status: 401 },
          isAxiosError: true,
        })
      );

      await expect(
        useAuthStore.getState().login("ada@example.test", "wrong")
      ).rejects.toThrow();

      expect(useAuthStore.getState().isSessionChecked).toBe(false);
    });

    it("stays true after logout and clearAuth", async () => {
      useAuthStore.setState({ user, isAuthenticated: true, isSessionChecked: true });
      mocks.post.mockResolvedValue({ data: {} });

      await useAuthStore.getState().logout();
      expect(useAuthStore.getState().isSessionChecked).toBe(true);

      useAuthStore.setState({ user, isAuthenticated: true });
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().isSessionChecked).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe("fetchUser", () => {
    it("sets the user and authenticated flag from the session endpoint", async () => {
      mocks.get.mockResolvedValue({ data: { user } });

      await useAuthStore.getState().fetchUser();

      expect(mocks.get).toHaveBeenCalledWith("/auth/user");
      const state = useAuthStore.getState();
      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it("toggles isLoading off after success", async () => {
      mocks.get.mockResolvedValue({ data: { user } });
      const seen: boolean[] = [];
      const unsubscribe = useAuthStore.subscribe((state) => seen.push(state.isLoading));

      await useAuthStore.getState().fetchUser();
      unsubscribe();

      expect(seen).toContain(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("clears the user on a 401 without throwing", async () => {
      useAuthStore.setState({ user, isAuthenticated: true });
      mocks.get.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 401"), {
          response: { status: 401 },
          isAxiosError: true,
        })
      );

      await expect(useAuthStore.getState().fetchUser()).resolves.toBeUndefined();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it("leaves the error field untouched when the session is missing", async () => {
      useAuthStore.setState({ error: "previous" });
      mocks.get.mockRejectedValue(new Error("Unauthorized"));

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().error).toBe("previous");
    });
  });

  describe("logout", () => {
    it("posts to /auth/logout and clears the session", async () => {
      useAuthStore.setState({ user, isAuthenticated: true });
      mocks.post.mockResolvedValue({ data: {} });

      await useAuthStore.getState().logout();

      expect(mocks.post).toHaveBeenCalledWith("/auth/logout");
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it("still clears the session when the logout request fails", async () => {
      useAuthStore.setState({ user, isAuthenticated: true });
      mocks.post.mockRejectedValue(new Error("network down"));

      await expect(useAuthStore.getState().logout()).rejects.toThrow("network down");

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe("clearAuth", () => {
    it("resets the user without calling the API", () => {
      useAuthStore.setState({ user, isAuthenticated: true });

      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(mocks.post).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    });
  });
});
