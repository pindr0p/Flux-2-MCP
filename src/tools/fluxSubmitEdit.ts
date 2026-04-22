import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { FluxToolServices } from "../services.js";
import { toToolErrorResult } from "../util/errors.js";
import {
  createTextResult,
  generationArgumentShape,
  resolveToolReferences,
  summarizeJob,
  submitToolJob,
  type SharedGenerationArgs
} from "./shared.js";

export function registerFluxSubmitEditTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_submit_edit",
    {
      title: "Submit FLUX Edit",
      description: "Submit a single-image FLUX refinement job using a stored image_id.",
      inputSchema: {
        ...generationArgumentShape,
        image_id: z.string().describe("Stored image ID to refine.")
      }
    },
    async (args: SharedGenerationArgs & { image_id: string }) => {
      try {
        const references = await resolveToolReferences(services, [args.image_id]);
        const job = await submitToolJob({
          services,
          toolName: "flux_submit_edit",
          args,
          references
        });

        return createTextResult(summarizeJob(job));
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}