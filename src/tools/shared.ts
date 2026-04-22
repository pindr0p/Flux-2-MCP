import { z } from "zod";

import { assertProviderConfigured } from "../config.js";
import { resolveReferenceImages, submitComposeJob } from "../flux/compose.js";
import { getFluxModelProfile } from "../profiles/fluxProfiles.js";
import type { FluxToolServices } from "../services.js";
import type { FluxModelId } from "../profiles/fluxProfiles.js";
import type { ComposeRequest, FluxJobRecord } from "../types.js";

export const generationArgumentShape = {
  prompt: z.string().min(1).describe("Prompt used for generation or composition."),
  aspect_ratio: z
    .string()
    .optional()
    .describe("Optional aspect ratio such as 1:1, 16:9, or 4:5."),
  width: z.number().int().min(64).optional().describe("Optional output width."),
  height: z.number().int().min(64).optional().describe("Optional output height."),
  output_format: z
    .enum(["png", "jpeg"])
    .optional()
    .describe("Output image format."),
  guidance: z.number().optional().describe("Optional FLUX guidance value."),
  steps: z.number().int().positive().optional().describe("Optional inference step count."),
  seed: z.number().int().optional().describe("Optional seed for reproducibility."),
  safety_tolerance: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Optional moderation tolerance level.")
};

export interface SharedGenerationArgs {
  prompt: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  output_format?: "png" | "jpeg";
  guidance?: number;
  steps?: number;
  seed?: number;
  safety_tolerance?: number;
}

export interface ResolvedToolReferences {
  parentImageIds: string[];
  referenceImageIds?: string[];
  referenceImagesBase64: string[];
}

export function createReferenceImageIdsSchema(
  services: FluxToolServices,
  options: {
    min: number;
    description: string;
  }
) {
  return z
    .array(z.string())
    .min(options.min)
    .max(getDefaultModelProfile(services).maxReferenceImages)
    .describe(options.description);
}

export function buildComposeRequest(
  model: FluxModelId,
  args: SharedGenerationArgs,
  extras?: Partial<ComposeRequest>
): ComposeRequest {
  return {
    model,
    prompt: args.prompt,
    aspectRatio: args.aspect_ratio,
    width: args.width,
    height: args.height,
    outputFormat: args.output_format,
    guidance: args.guidance,
    steps: args.steps,
    seed: args.seed,
    safetyTolerance: args.safety_tolerance,
    ...extras
  };
}

export async function resolveToolReferences(
  services: FluxToolServices,
  imageIds?: string[]
): Promise<ResolvedToolReferences> {
  if (!imageIds?.length) {
    return {
      parentImageIds: [],
      referenceImagesBase64: []
    };
  }

  const { base64Images, records } = await resolveReferenceImages(services, imageIds);

  return {
    parentImageIds: records.map((record) => record.imageId),
    referenceImageIds: imageIds,
    referenceImagesBase64: base64Images
  };
}

export async function submitToolJob(options: {
  services: FluxToolServices;
  toolName: string;
  args: SharedGenerationArgs;
  references?: ResolvedToolReferences;
  requestExtras?: Partial<ComposeRequest>;
  sessionId?: string;
}): Promise<FluxJobRecord> {
  const { args, requestExtras, services, toolName } = options;
  const references = options.references ?? {
    parentImageIds: [],
    referenceImagesBase64: []
  };

  assertProviderConfigured(services.config);

  const job = await submitComposeJob({
    services,
    toolName,
    request: buildComposeRequest(services.config.flux.defaultModel, args, {
      referenceImageIds: references.referenceImageIds,
      ...requestExtras
    }),
    parentImageIds: references.parentImageIds,
    referenceImagesBase64: references.referenceImagesBase64
  });

  services.jobMonitor.watch(job, {
    sessionId: options.sessionId
  });

  return job;
}

export function createTextResult(text: string, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ],
    ...(isError ? { isError: true } : {})
  };
}

export function summarizeJob(job: FluxJobRecord): string {
  const fields = [
    `job_id=${job.jobId}`,
    `status=${job.status}`,
    `model=${job.model}`,
    `provider=${job.provider.kind}`
  ];

  if (job.provider.kind === "direct-bfl") {
    fields.push(`release_channel=${job.provider.releaseChannel}`);
  }

  if (job.upstream.requestId) {
    fields.push(`upstream_id=${job.upstream.requestId}`);
  }

  if (job.resultImageId) {
    fields.push(`image_id=${job.resultImageId}`);
  }

  if (job.errorCode) {
    fields.push(`error_code=${job.errorCode}`);
  }

  return fields.join(" ");
}

function getDefaultModelProfile(services: FluxToolServices) {
  return getFluxModelProfile(services.config.flux.defaultModel);
}