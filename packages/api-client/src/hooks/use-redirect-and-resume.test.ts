// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../api-client", () => ({ default: { request: mocks.request } }));

import { useRedirectAndResume } from "./use-redirect-and-resume";
import type { ResumeFailureReason } from "./use-redirect-and-resume";
import { usePendingActionStore } from "../stores/pending-action-store";

interface SeenLocation {
  pathname: string;
  search: string;
  state: unknown;
}

interface HookApi {
  requireAuth: (action: {
    method: string;
    url: string;
    data?: Record<string, unknown>;
    targetRoute?: string;
  }) => void;
  resumePendingAction: (options?: {
    onError?: (reason: ResumeFailureReason) => void;
  }) => Promise<boolean>;
  clearPendingAction: () => void;
}

const STORAGE_KEY = "pending-action";

let visited: SeenLocation[] = [];
let captured: HookApi | null = null;

/** Records every location the real router commits, so the assertions cover the
 *  navigation that actually happens rather than a spied-on navigator. */
function LocationProbe() {
  const location = useLocation();

  useEffect(() => {
    visited.push({
      pathname: location.pathname,
      search: location.search,
      state: location.state,
    });
  }, [location.pathname, location.search, location.state]);

  return null;
}

function Probe() {
  captured = useRedirectAndResume() as HookApi;
  return null;
}

function mountHook(initialEntry = "/"): HookApi {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(Probe),
      createElement(LocationProbe)
    )
  );
  if (!captured) throw new Error("the hook did not render");
  return captured;
}

/** The location the router settled on after the last navigation. */
function currentPath(): string {
  return visited[visited.length - 1]?.pathname ?? "";
}

function currentState(): unknown {
  return visited[visited.length - 1]?.state;
}

function seedPendingAction(action: {
  targetRoute: string;
  method: string;
  url: string;
  data?: Record<string, unknown>;
}): void {
  usePendingActionStore.getState().setPendingAction(action);
}

describe("useRedirectAndResume", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    visited = [];
    captured = null;
    sessionStorage.clear();
    usePendingActionStore.getState().clearPendingAction();
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes exactly requireAuth, resumePendingAction and clearPendingAction", () => {
    const hook = mountHook();

    expect(Object.keys(hook).sort()).toEqual([
      "clearPendingAction",
      "requireAuth",
      "resumePendingAction",
    ]);
  });

  it("mounts inside a real MemoryRouter, so the router context resolves", () => {
    // A second react-router copy would make `useNavigate()` throw here.
    expect(() => mountHook("/cart")).not.toThrow();
  });

  describe("requireAuth", () => {
    it("stores the target route together with the serialized step data", () => {
      const hook = mountHook("/cart");

      hook.requireAuth({
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
        targetRoute: "/cart",
      });

      expect(usePendingActionStore.getState().pendingAction).toMatchObject({
        targetRoute: "/cart",
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
      });
    });

    it("stamps the action so the store can expire it", () => {
      const hook = mountHook("/cart");

      hook.requireAuth({ method: "POST", url: "/orders", targetRoute: "/cart" });

      const stored = usePendingActionStore.getState().pendingAction;
      expect(typeof stored?.timestamp).toBe("number");
      expect(stored?.timestamp).toBeGreaterThan(0);
    });

    it("persists the pending action to sessionStorage", () => {
      const hook = mountHook("/cart");

      hook.requireAuth({
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
        targetRoute: "/cart",
      });

      const raw = sessionStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).action).toMatchObject({
        targetRoute: "/cart",
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
      });
    });

    it("navigates to /login and carries the target in router state", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({ method: "POST", url: "/orders", targetRoute: "/checkout" });
      });

      expect(currentPath()).toBe("/login");
      expect(currentState()).toEqual({ from: "/checkout" });
    });

    it("uses a bare /login path rather than a /login?next= query string", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({ method: "POST", url: "/orders", targetRoute: "/checkout" });
      });

      expect(visited[visited.length - 1]?.search).toBe("");
      expect(currentPath()).toBe("/login");
    });

    it("falls back to the current pathname when no target is given", () => {
      window.history.replaceState({}, "", "/wishlist");
      const hook = mountHook("/wishlist");

      act(() => {
        hook.requireAuth({ method: "POST", url: "/wishlist/1" });
      });

      expect(usePendingActionStore.getState().pendingAction?.targetRoute).toBe(
        "/wishlist"
      );
      expect(currentState()).toEqual({ from: "/wishlist" });
    });

    it("does not call the API itself; it only defers the action", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({ method: "POST", url: "/orders", targetRoute: "/cart" });
      });

      expect(mocks.request).not.toHaveBeenCalled();
      expect(usePendingActionStore.getState().hasPendingAction()).toBe(true);
    });
  });

  describe("resumePendingAction", () => {
    it("replays the stored request with its original method, url and data", async () => {
      mocks.request.mockResolvedValue({ data: { order: { id: 1 } } });
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
      });

      let resumed = false;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(true);
      expect(mocks.request).toHaveBeenCalledTimes(1);
      expect(mocks.request).toHaveBeenCalledWith({
        method: "POST",
        url: "/orders",
        data: { address_id: 2 },
      });
    });

    it("navigates to the stored target route on success", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
      });

      await act(async () => {
        await hook.resumePendingAction();
      });

      expect(currentPath()).toBe("/order/confirmed");
    });

    it("clears the in-memory and persisted action after resuming", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({ targetRoute: "/order/confirmed", method: "POST", url: "/orders" });

      await act(async () => {
        await hook.resumePendingAction();
      });

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns false and navigates nowhere when nothing is stored", async () => {
      const hook = mountHook("/login");

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(false);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
    });

    it("cannot replay twice: a second resume is a no-op", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({ targetRoute: "/order/confirmed", method: "POST", url: "/orders" });

      await act(async () => {
        expect(await hook.resumePendingAction()).toBe(true);
      });
      const afterFirst = currentPath();
      let second: boolean | null = null;
      await act(async () => {
        second = await hook.resumePendingAction();
      });

      expect(second).toBe(false);
      expect(mocks.request).toHaveBeenCalledTimes(1);
      expect(currentPath()).toBe(afterFirst);
    });

    it("returns false without navigating when the replayed request fails", async () => {
      mocks.request.mockRejectedValue(new Error("422 Validation"));
      const hook = mountHook("/login");
      seedPendingAction({ targetRoute: "/order/confirmed", method: "POST", url: "/orders" });

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(false);
      expect(currentPath()).toBe("/login");
    });

    it("consumes the action even when the replay fails", async () => {
      mocks.request.mockRejectedValue(new Error("500"));
      const hook = mountHook("/login");
      seedPendingAction({ targetRoute: "/order/confirmed", method: "POST", url: "/orders" });

      await act(async () => {
        await hook.resumePendingAction();
      });

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not replay an action older than the 5 minute window", async () => {
      const hook = mountHook("/login");
      seedPendingAction({ targetRoute: "/order/confirmed", method: "POST", url: "/orders" });
      // Age the stored entry past the expiry window.
      const raw = sessionStorage.getItem(STORAGE_KEY) as string;
      const entry = JSON.parse(raw);
      entry.timestamp = Date.now() - 5 * 60 * 1000 - 1;
      usePendingActionStore.setState({
        pendingAction: { ...entry.action, timestamp: entry.timestamp },
      });

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(false);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
    });
  });

  describe("external targetRoute handling", () => {
    it("never stores an absolute external target", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({
          method: "POST",
          url: "/orders",
          targetRoute: "https://evil.test/steal",
        });
      });

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("never stores a protocol-relative target", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({
          method: "POST",
          url: "/orders",
          targetRoute: "//evil.test/steal",
        });
      });

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("navigates to a bare /login without forwarding a rejected target", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({
          method: "POST",
          url: "/orders",
          targetRoute: "https://evil.test/steal",
        });
      });

      expect(currentPath()).toBe("/login");
      expect(currentState()).toBeNull();
    });

    it("rejects an external API url without storing or redirecting", () => {
      const hook = mountHook("/cart");

      act(() => {
        hook.requireAuth({
          method: "POST",
          url: "https://evil.test/steal",
          targetRoute: "/cart",
        });
      });

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(currentPath()).toBe("/login");
      expect(currentState()).toBeNull();
    });

    it("makes no request and navigates nowhere for a stored external target", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      // The store refuses to persist this, so nothing is queued at all.
      seedPendingAction({
        targetRoute: "https://evil.test/steal",
        method: "POST",
        url: "/orders",
      });

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(false);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
      expect(visited.some((entry) => entry.pathname.includes("evil.test"))).toBe(
        false
      );
    });

    it("makes no request for a stored protocol-relative target", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "//evil.test/steal",
        method: "POST",
        url: "/orders",
      });

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(false);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
    });

    it("clears a tampered in-memory action instead of replaying it", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      // Simulates a value injected by an older client or another tab, bypassing
      // the store's own guard.
      usePendingActionStore.setState({
        pendingAction: {
          targetRoute: "https://evil.test/steal",
          method: "POST",
          url: "/orders",
          timestamp: Date.now(),
        },
      });

      const reasons: string[] = [];
      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction({
          onError: (reason) => reasons.push(reason),
        });
      });

      expect(resumed).toBe(false);
      expect(reasons).toEqual(["unsafe"]);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
      expect(usePendingActionStore.getState().pendingAction).toBeNull();
    });

    it("clears a tampered action whose API url points off-site", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      usePendingActionStore.setState({
        pendingAction: {
          targetRoute: "/order/confirmed",
          method: "POST",
          url: "https://evil.test/steal",
          timestamp: Date.now(),
        },
      });

      const reasons: string[] = [];
      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction({
          onError: (reason) => reasons.push(reason),
        });
      });

      expect(resumed).toBe(false);
      expect(reasons).toEqual(["unsafe"]);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(currentPath()).toBe("/login");
    });
  });

  describe("resume failure reporting", () => {
    it("reports replay_failed when the replayed request rejects", async () => {
      mocks.request.mockRejectedValue(new Error("422 Validation"));
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
      });

      const reasons: string[] = [];
      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction({
          onError: (reason) => reasons.push(reason),
        });
      });

      expect(resumed).toBe(false);
      expect(reasons).toEqual(["replay_failed"]);
    });

    it("reports nothing when the resume succeeds", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
      });

      const reasons: string[] = [];
      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction({
          onError: (reason) => reasons.push(reason),
        });
      });

      expect(resumed).toBe(true);
      expect(reasons).toEqual([]);
    });

    it("reports nothing when there is no pending action", async () => {
      const hook = mountHook("/login");

      const reasons: string[] = [];
      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction({
          onError: (reason) => reasons.push(reason),
        });
      });

      expect(resumed).toBe(false);
      expect(reasons).toEqual([]);
    });

    it("never passes raw error text to the reporter", async () => {
      mocks.request.mockRejectedValue(
        new Error("SQLSTATE connection refused for user root")
      );
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
      });

      const reported: unknown[] = [];
      await act(async () => {
        await hook.resumePendingAction({
          onError: (reason) => reported.push(reason),
        });
      });

      expect(reported).toEqual(["replay_failed"]);
      expect(JSON.stringify(reported)).not.toContain("SQLSTATE");
    });

    it("still compiles and works when called with no options", async () => {
      mocks.request.mockResolvedValue({ data: {} });
      const hook = mountHook("/login");
      seedPendingAction({
        targetRoute: "/order/confirmed",
        method: "POST",
        url: "/orders",
      });

      let resumed: boolean | null = null;
      await act(async () => {
        resumed = await hook.resumePendingAction();
      });

      expect(resumed).toBe(true);
      expect(currentPath()).toBe("/order/confirmed");
    });
  });

  describe("clearPendingAction", () => {
    it("clears memory and storage without calling the API", () => {
      const hook = mountHook("/cart");
      seedPendingAction({ targetRoute: "/cart", method: "POST", url: "/orders" });

      hook.clearPendingAction();

      expect(usePendingActionStore.getState().pendingAction).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(mocks.request).not.toHaveBeenCalled();
    });
  });
});
