import type { FluxModelProfile } from "../profiles/fluxProfiles.js";
import type { ComposeRequest } from "../types.js";
import { FluxMcpError } from "../util/errors.js";

const MIN_IMAGE_DIMENSION = 64;
const DIMENSION_MULTIPLE = 16;
const SAFETY_TOLERANCE_MIN = 0;
const SAFETY_TOLERANCE_MAX = 5;
const ONE_MEGAPIXEL = 1_000_000;

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

  if (request.aspectRatio && !profile.supportsAspectRatio) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support aspect_ratio.`
    );
  }

  if (
    (request.width !== undefined || request.height !== undefined) &&
    !profile.supportsWidthHeight
  ) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support explicit width and height overrides.`
    );
  }

  if (request.width !== undefined && request.height !== undefined) {
    validateDimensions(request.width, request.height, profile);
  }

  if (
    request.safetyTolerance !== undefined &&
    (request.safetyTolerance < SAFETY_TOLERANCE_MIN ||
      request.safetyTolerance > SAFETY_TOLERANCE_MAX)
  ) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `safety_tolerance must be between ${SAFETY_TOLERANCE_MIN} and ${SAFETY_TOLERANCE_MAX}.`
    );
  }

  if (request.guidance !== undefined && !profile.supportsGuidance) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support guidance.`
    );
  }

  if (
    request.guidance !== undefined &&
    profile.guidanceRange &&
    (request.guidance < profile.guidanceRange.min ||
      request.guidance > profile.guidanceRange.max)
  ) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `guidance must be between ${profile.guidanceRange.min} and ${profile.guidanceRange.max} for ${profile.id}.`
    );
  }

  if (request.steps !== undefined && !profile.supportsSteps) {
    throw new FluxMcpError(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `${profile.id} does not support steps.`
    );
  }

  if (
    request.steps !== undefined &&
    profile.stepsRange &&
    (request.steps < profile.stepsRange.min ||
      request.steps > profile.stepsRange.max)
  ) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `steps must be between ${profile.stepsRange.min} and ${profile.stepsRange.max} for ${profile.id}.`
    );
  }

  const payload: Record<string, unknown> = {
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

function validateDimensions(
  width: number,
  height: number,
  profile: FluxModelProfile
): void {
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `width and height must both be at least ${MIN_IMAGE_DIMENSION}px.`
    );
  }

  if (width % DIMENSION_MULTIPLE !== 0 || height % DIMENSION_MULTIPLE !== 0) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `width and height must both be multiples of ${DIMENSION_MULTIPLE}.`
    );
  }

  if (width * height > profile.maxOutputMegapixels * ONE_MEGAPIXEL) {
    throw new FluxMcpError(
      "INVALID_ARGUMENT",
      `${profile.id} supports up to ${profile.maxOutputMegapixels} megapixels.`
    );
  }
}