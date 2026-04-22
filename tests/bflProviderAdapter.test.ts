import { afterEach, describe, expect, it, vi } from "vitest";

import { BflProviderAdapter } from "../src/adapters/bflProviderAdapter.js";
import { loadConfig } from "../src/config.js";
import { FluxMcpError } from "../src/util/errors.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("BflProviderAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("enforces FLUX_MAX_PARALLEL_REQUESTS across upstream API calls", async () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key",
      FLUX_MAX_PARALLEL_REQUESTS: "1"
    });
    const adapter = new BflProviderAdapter(
      config,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as never
    );
    const firstResponse = createDeferred<Response>();
    const secondResponse = new Response(JSON.stringify({ status: "Pending" }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;

        if (callCount === 1) {
          return firstResponse.promise;
        }

        return secondResponse;
      })
    );

    const firstRefresh = adapter.refreshJob("https://api.bfl.ai/v1/get_result?id=1");
    await Promise.resolve();

    const secondRefresh = adapter.refreshJob(
      "https://api.bfl.ai/v1/get_result?id=2"
    );
    await Promise.resolve();

    expect(callCount).toBe(1);

    firstResponse.resolve(
      new Response(JSON.stringify({ status: "Pending" }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    await Promise.all([firstRefresh, secondRefresh]);
    expect(callCount).toBe(2);
  });

  it("retries a 429 response before succeeding", async () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key"
    });
    const adapter = new BflProviderAdapter(
      config,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as never
    );

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;

        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              error: "rate_limit_exceeded",
              message: "Too many concurrent requests",
              retry_after: 0
            }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "retry-after": "0"
              }
            }
          );
        }

        return new Response(JSON.stringify({ status: "Pending" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      })
    );

    await expect(
      adapter.refreshJob("https://api.bfl.ai/v1/get_result?id=1")
    ).resolves.toMatchObject({ status: "running" });
    expect(callCount).toBe(2);
  });

  it("times out signed image downloads", async () => {
    vi.useFakeTimers();

    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key",
      FLUX_REQUEST_TIMEOUT_MS: "25"
    });
    const adapter = new BflProviderAdapter(
      config,
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as never
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
            });
          })
      )
    );

    const resultPromise = adapter.fetchReadyResult({
      imageUrl: "https://signed.example/image.png",
      raw: {}
    });
    const assertion = expect(resultPromise).rejects.toEqual(
      new FluxMcpError(
        "UPSTREAM_TIMEOUT",
        "Generated image download timed out after 25ms."
      )
    );

    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });
});