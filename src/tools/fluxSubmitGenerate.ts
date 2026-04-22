import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FluxToolServices } from "../services.js";
import { toToolErrorResult } from "../util/errors.js";
import {
  createTextResult,
  generationArgumentShape,
  summarizeJob,
  submitToolJob,
  type SharedGenerationArgs
} from "./shared.js";

export function registerFluxSubmitGenerateTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_submit_generate",
    {
      title: "Submit FLUX Generation",
      description: "Submit a text-only FLUX generation job and return its job handle.",
      inputSchema: generationArgumentShape
    },
    async (args: SharedGenerationArgs) => {
      try {
        const job = await submitToolJob({
          services,
          toolName: "flux_submit_generate",
          args
        });

        return createTextResult(summarizeJob(job));
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}