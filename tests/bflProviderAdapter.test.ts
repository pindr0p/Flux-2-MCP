import { afterEach, describe, expect, it, vi } from "vitest";

import { BflProviderAdapter } from "../src/adapters/bflProviderAdapter.js";
import { loadConfig } from "../src/config.js";

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
    vi.unstubAllGlobals();
  });

  it("enforces FLUX_MAX_PARALLEL_REQUESTS across upstream API calls", async () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      FLUX_PROVIDER_BASE_URL: "https://api.bfl.ai",
      FLUX_PROVIDER_API_KEY: "direct-key",
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
});