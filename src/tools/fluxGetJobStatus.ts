import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getJobOrThrow, refreshComposeJob } from "../flux/compose.js";
import type { FluxToolServices } from "../services.js";
import { toToolErrorResult } from "../util/errors.js";
import { createTextResult, summarizeJob } from "./shared.js";

export function registerFluxGetJobStatusTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_get_job_status",
    {
      title: "Get FLUX Job Status",
      description: "Refresh and return the status of a previously submitted FLUX job.",
      inputSchema: {
        job_id: z.string().describe("Previously returned FLUX job ID.")
      }
    },
    async ({ job_id }: { job_id: string }) => {
      try {
        const job = await getJobOrThrow(services, job_id);
        const refreshedJob = await refreshComposeJob(services, job);
        return createTextResult(summarizeJob(refreshedJob));
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}