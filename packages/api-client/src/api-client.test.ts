import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const instance = {
    defaults: {
      baseURL: undefined as string | undefined,
      headers: {} as Record<string, string>,
      withCredentials: false,
    },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    instance,
    create: vi.fn(
      (_config: {
        baseURL?: string;
        withCredentials?: boolean;
        headers?: Record<string, string>;
      }) => instance
    ),
  };
});

vi.mock("axios", () => ({ default: { create: mocks.create } }));

interface CreateConfig {
  baseURL: string;
  withCredentials: boolean;
  headers: Record<string, string>;
}

type Interceptor = (config: { headers: Record<string, string> }) => {
  headers: Record<string, string>;
};

/** The suite runs in the `node` environment, so the interceptor's
 *  `document.cookie` read needs a minimal stand-in. */
function stubDocumentCookie(cookie: string): void {
  (globalThis as { document?: { cookie: string } }).document = { cookie };
}

async function loadApiClient() {
  const module = await import("./api-client");
  return {
    apiClient: module.default,
    createConfig: mocks.create.mock.calls[0]?.[0] as CreateConfig,
  };
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.create.mockClear();
    mocks.instance.interceptors.request.use.mockClear();
    mocks.instance.interceptors.response.use.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { document?: unknown }).document;
  });

  it("uses VITE_API_URL as the base URL when it is set", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    const { createConfig } = await loadApiClient();

    expect(createConfig.baseURL).toBe("https://api.example.test/api/v1");
  });

  it("falls back to http://localhost:8000/api/v1 when VITE_API_URL is absent", async () => {
    vi.stubEnv("VITE_API_URL", undefined as unknown as string);

    const { createConfig } = await loadApiClient();

    expect(createConfig.baseURL).toBe("http://localhost:8000/api/v1");
  });

  it("sends credentials so the Sanctum session cookie is included", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    const { createConfig } = await loadApiClient();

    expect(createConfig.withCredentials).toBe(true);
  });

  it("negotiates JSON via Content-Type and Accept headers", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    const { createConfig } = await loadApiClient();

    expect(createConfig.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  it("registers exactly one request interceptor and no response interceptor", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    await loadApiClient();

    expect(mocks.instance.interceptors.request.use).toHaveBeenCalledTimes(1);
    // No response interceptor means no global 401/500 handler; rejections
    // surface as the original axios errors.
    expect(mocks.instance.interceptors.response.use).not.toHaveBeenCalled();
  });

  it("registers the request interceptor without a rejection handler", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    await loadApiClient();

    expect(mocks.instance.interceptors.request.use.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("decodes the XSRF-TOKEN cookie and sends it as X-XSRF-TOKEN", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    await loadApiClient();
    const interceptor = mocks.instance.interceptors.request.use.mock
      .calls[0]?.[0] as Interceptor;
    stubDocumentCookie("XSRF-TOKEN=abc%3D123%3D; session=zzz");

    const result = interceptor({ headers: {} });

    expect(result.headers["X-XSRF-TOKEN"]).toBe("abc=123=");
  });

  it("ignores other cookies when looking for the CSRF token", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    await loadApiClient();
    const interceptor = mocks.instance.interceptors.request.use.mock
      .calls[0]?.[0] as Interceptor;
    stubDocumentCookie("session=zzz; XSRF-SESSION=not-the-token");

    const result = interceptor({ headers: {} });

    expect(result.headers["X-XSRF-TOKEN"]).toBeUndefined();
  });

  it("returns the config unchanged when no XSRF-TOKEN cookie exists", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    await loadApiClient();
    const interceptor = mocks.instance.interceptors.request.use.mock
      .calls[0]?.[0] as Interceptor;
    stubDocumentCookie("");

    const config = { headers: {} as Record<string, string> };
    const result = interceptor(config);

    expect(result).toBe(config);
    expect(result.headers["X-XSRF-TOKEN"]).toBeUndefined();
  });

  it("exposes no csrf-cookie preflight helper; the auth store owns that step", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");

    const { apiClient } = await loadApiClient();

    expect(
      Object.keys(apiClient).filter((key) => /csrf/i.test(key))
    ).toEqual([]);
  });
});
