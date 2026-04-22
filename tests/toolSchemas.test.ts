import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { FluxToolServices } from "../src/services.js";
import { createReferenceImageIdsSchema } from "../src/tools/shared.js";

function createServices(defaultModel: string): FluxToolServices {
  return {
    config: loadConfig({
      AZURE_ENDPOINT: "https://example-resource.api.cognitive.microsoft.com",
      AZURE_API_KEY: "azure-key",
      FLUX_DEFAULT_MODEL: defaultModel
    })
  } as FluxToolServices;
}

describe("submit tool schemas", () => {
  it("derives multi-reference limits from the configured default model", () => {
    const schema = createReferenceImageIdsSchema(createServices("FLUX.2-flex"), {
      min: 1,
      description: "Stored image IDs used as references."
    });

    expect(schema.safeParse(Array.from({ length: 10 }, (_, index) => `image-${index}`)).success).toBe(true);
    expect(schema.safeParse(Array.from({ length: 11 }, (_, index) => `image-${index}`)).success).toBe(false);
  });

  it("respects single-reference model ceilings", () => {
    const schema = createReferenceImageIdsSchema(
      createServices("FLUX.1-Kontext-pro"),
      {
        min: 1,
        description: "Stored image IDs used as references."
      }
    );

    expect(schema.safeParse(["image-1"]).success).toBe(true);
    expect(schema.safeParse(["image-1", "image-2"]).success).toBe(false);
  });
});