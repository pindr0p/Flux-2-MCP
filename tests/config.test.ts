import { describe, expect, it } from "vitest";

import {
  loadConfig,
  resolveProviderHeaders,
  resolveProviderModelUrl
} from "../src/config.js";

describe("provider configuration", () => {
  it("keeps Azure BFL as the default provider path", () => {
    const config = loadConfig({
      AZURE_ENDPOINT: "https://example-resource.api.cognitive.microsoft.com",
      AZURE_API_KEY: "azure-key"
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

  it("infers direct BFL routing from BFL credentials", () => {
    const config = loadConfig({
      BFL_API_KEY: "direct-key",
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

  it("allows explicit direct BFL stable routing", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "direct-bfl",
      FLUX_PROVIDER_BASE_URL: "https://api.bfl.ai",
      FLUX_PROVIDER_API_KEY: "direct-key",
      FLUX_PROVIDER_RELEASE_CHANNEL: "stable"
    });

    expect(resolveProviderModelUrl(config, "flux-2-pro")).toBe(
      "https://api.bfl.ai/v1/flux-2-pro"
    );
  });
});