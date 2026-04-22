import type { FluxModelProfile } from "../profiles/fluxProfiles.js";
import type { ComposeRequest } from "../types.js";
import { FluxMcpError } from "../util/errors.js";

export function buildComposePayload(options: {
  request: ComposeRequest;
  profile: FluxModelProfile;
  referenceImagesBase64: string[];
}): Record<string, unknown> {
  const { request, profile, referenceImagesBase64 } = options;

  if (referenceImagesBase64.length > profile.maxReferenceImages) {
    throw new FluxMcpError(
      "INVALID_REFERENCE_COUNT",
      `${profile.id} supports at most ${profile.maxReferenceImages} reference images.`
    );
  }

  if (request.aspectRatio && (request.width !== undefined || request.height !== undefined)) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      "Specify either aspectRatio or width/height, not both."
    );
  }

  if (
    (request.width !== undefined && request.height === undefined) ||
    (request.width === undefined && request.height !== undefined)
  ) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      "Both width and height are required when overriding output dimensions."
    );
  }

  if (request.guidance !== undefined && !profile.supportsGuidance) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support guidance.`
    );
  }

  if (request.steps !== undefined && !profile.supportsSteps) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support steps.`
    );
  }

  const payload: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt
  };

  if (request.width !== undefined) {
    payload.width = request.width;
    payload.height = request.height;
  }

  if (request.aspectRatio) {
    payload.aspect_ratio = request.aspectRatio;
  }

  if (request.outputFormat) {
    payload.output_format = request.outputFormat;
  }

  if (request.seed !== undefined) {
    payload.seed = request.seed;
  }

  if (request.safetyTolerance !== undefined) {
    payload.safety_tolerance = request.safetyTolerance;
  }

  if (request.guidance !== undefined) {
    payload.guidance = request.guidance;
  }

  if (request.steps !== undefined) {
    payload.steps = request.steps;
  }

  referenceImagesBase64.forEach((reference, index) => {
    const key = index === 0 ? "input_image" : `input_image_${index + 1}`;
    payload[key] = reference;
  });

  return payload;
}