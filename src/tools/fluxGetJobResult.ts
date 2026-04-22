import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getJobOrThrow, refreshComposeJob } from "../flux/compose.js";
import type { FluxToolServices } from "../services.js";
import { FluxMcpError, toToolErrorResult } from "../util/errors.js";
import { createTextResult } from "./shared.js";

export function registerFluxGetJobResultTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_get_job_result",
    {
      title: "Get FLUX Job Result",
      description: "Return the completed image for a FLUX job once it is ready.",
      inputSchema: {
        job_id: z.string().describe("Previously returned FLUX job ID.")
      }
    },
    async ({ job_id }: { job_id: string }) => {
      try {
        const job = await refreshComposeJob(
          services,
          await getJobOrThrow(services, job_id)
        );

        if (job.status !== "ready" || !job.resultImageId) {
          return createTextResult(
            `Job ${job.jobId} is not ready yet. Current status: ${job.status}`,
            true
          );
        }

        const image = await services.metadataStore.getImage(job.resultImageId);
        if (!image) {
          throw new FluxMcpError(
            "IMAGE_NOT_FOUND",
            `Completed image ${job.resultImageId} was not found.`
          );
        }

        const imageBase64 = await services.imageStore.readImageBase64(image.filePath);
        return {
          content: [
            {
              type: "text" as const,
              text: `Completed job ${job.jobId} as image ${image.imageId}.`
            },
            {
              type: "image" as const,
              data: imageBase64,
              mimeType: image.mimeType
            }
          ]
        };
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}