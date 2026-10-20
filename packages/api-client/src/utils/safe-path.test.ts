import { describe, expect, it } from "vitest";
import { isSafeApiUrl, isSafeInternalPath } from "./safe-path";

const guards = [
  ["isSafeInternalPath", isSafeInternalPath],
  ["isSafeApiUrl", isSafeApiUrl],
] as const;

describe.each(guards)("%s", (_name, guard) => {
  it("accepts a simple absolute path", () => {
    expect(guard("/cart")).toBe(true);
  });

  it("accepts the root path", () => {
    expect(guard("/")).toBe(true);
  });

  it("accepts a nested path with a query string", () => {
    expect(guard("/shop/category/laptops?x=1")).toBe(true);
  });

  it("accepts a relative API path", () => {
    expect(guard("/cart/items")).toBe(true);
  });

  it("accepts a path with a hash fragment", () => {
    expect(guard("/order/confirmed#top")).toBe(true);
  });

  it("accepts a path containing a percent-encoded space", () => {
    expect(guard("/shop/office%20printers")).toBe(true);
  });

  it("accepts a path of exactly the maximum length", () => {
    const path = `/${"a".repeat(2047)}`;

    expect(path).toHaveLength(2048);
    expect(guard(path)).toBe(true);
  });

  it("rejects an absolute URL with a scheme", () => {
    expect(guard("https://evil.test")).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(guard("//evil.test")).toBe(false);
  });

  it("rejects a backslash-prefixed path", () => {
    expect(guard("/\\evil.test")).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    expect(guard("javascript:alert(1)")).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(guard("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects an embedded scheme separator", () => {
    expect(guard("/redirect?next=https://evil.test")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(guard("")).toBe(false);
  });

  it("rejects a relative path without a leading slash", () => {
    expect(guard("cart/items")).toBe(false);
  });

  it.each([
    ["number", 42],
    ["null", null],
    ["undefined", undefined],
    ["boolean", true],
    ["object", { pathname: "/cart" }],
    ["array", ["/cart"]],
  ])("rejects a %s value", (_label, value) => {
    expect(guard(value)).toBe(false);
  });

  it.each([
    ["null byte", "/cart\u0000"],
    ["newline", "/cart\n"],
    ["carriage return", "/cart\r"],
    ["tab", "/cart\t"],
    ["escape character", "/cart\u001B"],
    ["delete character", "/cart\u007F"],
  ])("rejects a path containing a %s", (_label, value) => {
    expect(guard(value)).toBe(false);
  });

  it("rejects a path longer than 2048 characters", () => {
    const path = `/${"a".repeat(2048)}`;

    expect(path).toHaveLength(2049);
    expect(guard(path)).toBe(false);
  });
});

describe("isSafeInternalPath", () => {
  it("accepts a protected-route path used by redirect-and-resume", () => {
    expect(isSafeInternalPath("/account/orders")).toBe(true);
  });
});

describe("isSafeApiUrl", () => {
  it("accepts the order replay endpoint", () => {
    expect(isSafeApiUrl("/orders")).toBe(true);
  });
});
