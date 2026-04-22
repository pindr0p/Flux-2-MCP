import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getFluxModelProfile } from "../profiles/fluxProfiles.js";
import type { FluxToolServices } from "../services.js";

export function registerFluxGetModelCapabilitiesTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_get_model_capabilities",
    {
      title: "FLUX Model Capabilities",
      description: "Return the active FLUX model capability profile.",
      inputSchema: {}
    },
    async () => {
      const profile = getFluxModelProfile(services.config.flux.model);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                activeProvider: services.adapter.provider,
                activeModel: services.config.flux.model,
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