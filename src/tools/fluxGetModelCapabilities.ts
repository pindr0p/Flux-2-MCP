import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  FLUX_MODEL_IDS,
  getFluxModelProfile
} from "../profiles/fluxProfiles.js";
import type { FluxToolServices } from "../services.js";

export function registerFluxGetModelCapabilitiesTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_get_model_capabilities",
    {
      title: "FLUX Model Capabilities",
      description: "Return the active or requested FLUX model capability profile.",
      inputSchema: {
        model: z.enum(FLUX_MODEL_IDS).optional().describe("Optional model to inspect.")
      }
    },
    async ({ model }: { model?: (typeof FLUX_MODEL_IDS)[number] }) => {
      const profile = getFluxModelProfile(model ?? services.config.flux.defaultModel);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                activeProvider: services.adapter.provider,
                activeModel: model ?? services.config.flux.defaultModel,
                profile
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}