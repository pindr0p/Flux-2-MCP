import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { FluxToolServices } from "../services.js";
import { FluxMcpError, toToolErrorResult } from "../util/errors.js";
import {
  createReferenceImageIdsSchema,
  createTextResult,
  generationArgumentShape,
  resolveToolReferences,
  summarizeJob,
  submitToolJob,
  type ResolvedToolReferences,
  type SharedGenerationArgs
} from "./shared.js";

interface VariantArgs extends SharedGenerationArgs {
  count: number;
  base_seed?: number;
  image_id?: string;
  image_ids?: string[];
}

export function registerFluxSubmitVariantsTool(
  server: McpServer,
  services: FluxToolServices
): void {
  server.registerTool(
    "flux_submit_variants",
    {
      title: "Submit FLUX Variants",
      description:
        "Submit multiple FLUX jobs that vary by seed for prompt-only or reference-guided workflows.",
      inputSchema: {
        ...generationArgumentShape,
        count: z
          .number()
          .int()
          .min(1)
          .describe("Number of variant jobs to submit."),
        base_seed: z
          .number()
          .int()
          .optional()
          .describe("Optional base seed incremented across submitted variants."),
        image_id: z
          .string()
          .optional()
          .describe("Optional stored image ID to refine across variants."),
        image_ids: createReferenceImageIdsSchema(services, {
          min: 2,
          description: "Optional stored image IDs used as references across variants."
        }).optional()
      }
    },
    async (args: VariantArgs, extra) => {
      try {
        if (args.count > services.config.flux.variantsMaxCount) {
          throw new FluxMcpError(
            "INVALID_ARGUMENT",
            `Variant count ${args.count} exceeds FLUX_VARIANTS_MAX_COUNT=${services.config.flux.variantsMaxCount}.`
          );
        }

        const resolvedReferences = await resolveVariantReferences(services, args);
        const seedBase = args.base_seed ?? args.seed;
        const jobs = [] as Array<{ index: number; seed?: number; summary: string }>;

        for (let index = 0; index < args.count; index += 1) {
          const seed = seedBase !== undefined ? seedBase + index : undefined;
          const job = await submitToolJob({
            services,
            toolName: "flux_submit_variants",
            args,
            references: resolvedReferences,
            requestExtras: {
              seed
            },
            sessionId: extra.sessionId
          });

          jobs.push({
            index: index + 1,
            seed,
            summary: summarizeJob(job)
          });
        }

        return createTextResult(
          jobs
            .map((job) =>
              `variant=${job.index}${job.seed !== undefined ? ` seed=${job.seed}` : ""} ${job.summary}`
            )
            .join("\n")
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    }
  );
}

async function resolveVariantReferences(
  services: FluxToolServices,
  args: VariantArgs
): Promise<ResolvedToolReferences> {
  if (args.image_id && args.image_ids?.length) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      "Specify either image_id or image_ids for variants, not both."
    );
  }

  if (args.image_id) {
    return resolveToolReferences(services, [args.image_id]);
  }

  if (args.image_ids?.length) {
    return resolveToolReferences(services, args.image_ids);
  }

  return resolveToolReferences(services);
}