import { act, render } from "@testing-library/react";
import { useAuthStore } from "@ecommerce/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionBootstrap, resetSessionBootstrap } from "./SessionBootstrap";

/**
 * Replaces only the network-facing action on the real store, so the component
 * is exercised against the real store instance it reads at mount. No mock of
 * react-router or of the module under test.
 */
function stubFetchUser() {
  const fetchUser = vi.fn(async () => {});
  const original = useAuthStore.getState().fetchUser;
  useAuthStore.setState({ fetchUser });
  return {
    fetchUser,
    restore: () => useAuthStore.setState({ fetchUser: original }),
  };
}

describe("SessionBootstrap", () => {
  let stub: ReturnType<typeof stubFetchUser>;

  beforeEach(() => {
    resetSessionBootstrap();
    stub = stubFetchUser();
  });

  afterEach(() => {
    stub.restore();
    vi.useRealTimers();
  });

  it("renders nothing at all", () => {
    const { container } = render(<SessionBootstrap />);

    expect(container).toBeEmptyDOMElement();
  });

  it("calls fetchUser once on mount", () => {
    render(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("does not call fetchUser again on re-render", () => {
    const { rerender } = render(<SessionBootstrap />);

    rerender(<SessionBootstrap />);
    rerender(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("stays at one call when a second instance mounts (StrictMode double invoke)", () => {
    render(<SessionBootstrap />);
    render(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("does not call fetchUser during the render pass, only from the effect", () => {
    // Rendered inside act, so any render-phase call would already be recorded.
    render(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("issues no further calls when the auth store state changes", () => {
    const { rerender } = render(<SessionBootstrap />);

    act(() => {
      useAuthStore.setState({ isSessionChecked: true, isAuthenticated: true });
    });
    rerender(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(1);
  });

  it("calls fetchUser again after the bootstrap latch is reset", () => {
    render(<SessionBootstrap />);
    resetSessionBootstrap();
    render(<SessionBootstrap />);

    expect(stub.fetchUser).toHaveBeenCalledTimes(2);
  });
});
