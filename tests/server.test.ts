import { describe, expect, it } from "vitest";

import { resolveRegisteredToolNames } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("createConfiguredServer", () => {
  it("registers only the tools supported by the env-selected model", () => {
    const config = loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key",
      MODEL: "FLUX-1.1-pro"
    });
    const toolNames = resolveRegisteredToolNames(config).sort();

    expect(toolNames).toEqual([
      "flux_get_job_result",
      "flux_get_job_status",
      "flux_get_model_capabilities",
      "flux_submit_generate",
      "flux_submit_variants"
    ]);
  });
});