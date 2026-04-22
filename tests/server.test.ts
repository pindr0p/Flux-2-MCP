import { describe, expect, it } from "vitest";

import { resolveRegisteredToolNames } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("createConfiguredServer", () => {
  it("registers only the tools supported by the env-selected default model", () => {
    const config = loadConfig({
      AZURE_ENDPOINT: "https://example-resource.api.cognitive.microsoft.com",
      AZURE_API_KEY: "azure-key",
      FLUX_DEFAULT_MODEL: "FLUX-1.1-pro"
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