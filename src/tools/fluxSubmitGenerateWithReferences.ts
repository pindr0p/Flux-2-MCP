import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FluxToolServices } from "../services.js";
import { toToolErrorResult } from "../util/errors.js";
import {
  createReferenceImageIdsSchema,
  createTextResult,
  generationArgumentShape,
  resolveToolReferences,
  summarizeJob,
  submitToolJob,
  type SharedGenerationArgs
} from "./shared.js";

export function registerFluxSubmitGenerateWithReferencesTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_submit_generate_with_references",
    {
      title: "Submit FLUX Reference-Guided Generation",
      description:
        "Submit a FLUX generation job guided by one or more stored reference images.",
      inputSchema: {
        ...generationArgumentShape,
        reference_image_ids: createReferenceImageIdsSchema(services, {
          min: 1,
          description: "Stored image IDs used as references."
        })
      }
    },
    async (
      args: SharedGenerationArgs & { reference_image_ids: string[] },
      extra
    ) => {
      try {
        const references = await resolveToolReferences(
          services,
          args.reference_image_ids
        );
        const job = await submitToolJob({
          services,
          toolName: "flux_submit_generate_with_references",
          args,
          references,
          sessionId: extra.sessionId
        });

        return createTextResult(summarizeJob(job));
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}