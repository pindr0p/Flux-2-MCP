import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildComposePayload } from "../src/flux/payloads.js";
import { getFluxModelProfile } from "../src/profiles/fluxProfiles.js";
import { loadConfig } from "../src/config.js";
import type { FluxToolServices } from "../src/services.js";
import {
  createGenerationArgumentShape,
  createReferenceImageIdsSchema
} from "../src/tools/shared.js";

function createServices(model: string): FluxToolServices {
  return {
    config: loadConfig({
      FLUX_PROVIDER_KIND: "azure-bfl",
      BASE_URL: "https://example-resource.api.cognitive.microsoft.com",
      API_KEY: "azure-key",
      MODEL: model
    })
  } as FluxToolServices;
}

describe("submit tool schemas", () => {
  it("derives multi-reference limits from the configured model", () => {
    const schema = createReferenceImageIdsSchema(createServices("FLUX.2-flex"), {
      min: 1,
      description: "Stored image IDs used as references."
    });

    expect(schema.safeParse(Array.from({ length: 8 }, (_, index) => `image-${index}`)).success).toBe(true);
    expect(schema.safeParse(Array.from({ length: 9 }, (_, index) => `image-${index}`)).success).toBe(false);
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

  it("does not include the model in direct BFL payloads", () => {
    const payload = buildComposePayload({
      request: {
        model: "FLUX.2-pro",
        prompt: "A mountain landscape"
      },
      profile: getFluxModelProfile("FLUX.2-pro"),
      referenceImagesBase64: []
    });

    expect(payload).toEqual({
      prompt: "A mountain landscape"
    });
  });

  it("keeps the direct BFL Kontext endpoint path aligned with BFL", () => {
    expect(getFluxModelProfile("FLUX.1-Kontext-pro").modelPath).toBe(
      "flux-kontext"
    );
  });

  it("omits unsupported generation fields from the active model schema", () => {
    const flux11Shape = createGenerationArgumentShape(
      createServices("FLUX-1.1-pro")
    );

    expect("aspect_ratio" in flux11Shape).toBe(false);
    expect("guidance" in flux11Shape).toBe(false);
    expect("steps" in flux11Shape).toBe(false);
  });

  it("keeps flex guidance and steps bounded to documented ranges", () => {
    const schema = z.object(
      createGenerationArgumentShape(createServices("FLUX.2-flex"))
    );

    expect(
      schema.safeParse({ prompt: "poster", guidance: 10, steps: 50 }).success
    ).toBe(true);
    expect(
      schema.safeParse({ prompt: "poster", guidance: 10.5 }).success
    ).toBe(false);
    expect(schema.safeParse({ prompt: "poster", steps: 51 }).success).toBe(false);
  });

  it("rejects explicit dimensions that violate BFL constraints", () => {
    expect(() =>
      buildComposePayload({
        request: {
          model: "FLUX.2-pro",
          prompt: "A mountain landscape",
          width: 1001,
          height: 1008
        },
        profile: getFluxModelProfile("FLUX.2-pro"),
        referenceImagesBase64: []
      })
    ).toThrow(/multiples of 16/);
  });

  it("rejects unsupported steps and guidance on non-flex models", () => {
    expect(() =>
      buildComposePayload({
        request: {
          model: "FLUX.2-pro",
          prompt: "A mountain landscape",
          guidance: 4
        },
        profile: getFluxModelProfile("FLUX.2-pro"),
        referenceImagesBase64: []
      })
    ).toThrow(/does not support guidance/);

    expect(() =>
      buildComposePayload({
        request: {
          model: "FLUX.2-pro",
          prompt: "A mountain landscape",
          steps: 10
        },
        profile: getFluxModelProfile("FLUX.2-pro"),
        referenceImagesBase64: []
      })
    ).toThrow(/does not support steps/);
  });

  it("rejects out-of-range safety tolerance", () => {
    expect(() =>
      buildComposePayload({
        request: {
          model: "FLUX.2-pro",
          prompt: "A mountain landscape",
          safetyTolerance: 6
        },
        profile: getFluxModelProfile("FLUX.2-pro"),
        referenceImagesBase64: []
      })
    ).toThrow(/safety_tolerance must be between 0 and 5/);
  });
});