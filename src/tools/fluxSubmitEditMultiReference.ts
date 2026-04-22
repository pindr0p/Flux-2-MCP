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

export function registerFluxSubmitEditMultiReferenceTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_submit_edit_multi_reference",
    {
      title: "Submit FLUX Multi-Reference Edit",
      description:
        "Submit a FLUX refinement job that composes from multiple stored image IDs.",
      inputSchema: {
        ...generationArgumentShape,
        image_ids: createReferenceImageIdsSchema(services, {
          min: 2,
          description: "Two or more stored image IDs used as references."
        })
      }
    },
    async (args: SharedGenerationArgs & { image_ids: string[] }) => {
      try {
        const references = await resolveToolReferences(services, args.image_ids);
        const job = await submitToolJob({
          services,
          toolName: "flux_submit_edit_multi_reference",
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