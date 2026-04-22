import { describe, expect, it } from "vitest";

import {
  loadConfig,
  resolveProviderHeaders,
  resolveProviderModelUrl
} from "../src/config.js";

describe("provider configuration", () => {
  it("uses the canonical Azure provider variables", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key"
    });

    expect(config.provider.kind).toBe("azure-bfl");
    expect(config.provider.authStrategy).toBe("authorization-bearer");
    expect(resolveProviderHeaders(config)).toEqual({
      Authorization: "Bearer azure-key"
    });
    expect(resolveProviderModelUrl(config, "flux-2-pro")).toBe(
      "https://example-resource.api.cognitive.microsoft.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview"
    );
  });

  it("uses the canonical direct BFL provider variables", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key",
      FLUX_PROVIDER_RELEASE_CHANNEL: "preview"
    });

    expect(config.provider.kind).toBe("direct-bfl");
    expect(config.provider.baseUrl).toBe("https://api.bfl.ai");
    expect(config.provider.authStrategy).toBe("x-key");
    expect(resolveProviderHeaders(config)).toEqual({
      "x-key": "direct-key"
    });
    expect(resolveProviderModelUrl(config, "flux-2-pro")).toBe(
      "https://api.bfl.ai/v1/flux-2-pro-preview"
    );
  });

  it("requires an explicit provider kind", () => {
    expect(() =>
      loadConfig({
        BASE_URL: "https://api.bfl.ai",
        API_KEY: "direct-key"
      })
    ).toThrow();
  });

  it("requires BASE_URL and API_KEY", () => {
    expect(() =>
      loadConfig({
        FLUX_PROVIDER_KIND: "direct-bfl",
        API_KEY: "direct-key"
      })
    ).toThrow();

    expect(() =>
      loadConfig({
        FLUX_PROVIDER_KIND: "direct-bfl",
        BASE_URL: "https://api.bfl.ai"
      })
    ).toThrow();
  });

  it("uses MODEL as the active configured model", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key",
      MODEL: "FLUX-1.1-pro"
    });

    expect(config.flux.model).toBe("FLUX-1.1-pro");
  });

  it("allows explicit direct BFL stable routing", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      BASE_URL: "https://api.bfl.ai",
      API_KEY: "direct-key",
      FLUX_PROVIDER_RELEASE_CHANNEL: "stable"
    });

    expect(resolveProviderModelUrl(config, "flux-2-pro")).toBe(
      "https://api.bfl.ai/v1/flux-2-pro"
    );
  });

  it("enables resumable stream config only when Redis is configured", () => {
    const disabledConfig = loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key"
    });
    const enabledConfig = loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key",
      FLUX_REDIS_URL: "redis://redis:6379/0",
      FLUX_HTTP_SSE_RETRY_INTERVAL_MS: "2500",
      FLUX_HTTP_EVENT_TTL_SECONDS: "1800",
      FLUX_HTTP_EVENT_MAX_STREAM_LENGTH: "250",
      FLUX_HTTP_EVENT_KEY_PREFIX: "custom:flux:mcp"
    });

    expect(disabledConfig.http.resumableStreams).toBeUndefined();
    expect(enabledConfig.http.resumableStreams).toEqual({
      redisUrl: "redis://redis:6379/0",
      retryIntervalMs: 2500,
      eventTtlSeconds: 1800,
      maxEventsPerStream: 250,
      keyPrefix: "custom:flux:mcp"
    });
  });

  it("parses HTTP session cleanup settings", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key",
      FLUX_HTTP_SESSION_IDLE_TIMEOUT_MS: "120000",
      FLUX_HTTP_SESSION_SWEEP_INTERVAL_MS: "15000"
    });

    expect(config.http.sessionIdleTimeoutMs).toBe(120000);
    expect(config.http.sessionSweepIntervalMs).toBe(15000);
  });
});