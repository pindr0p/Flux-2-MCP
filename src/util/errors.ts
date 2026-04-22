type FluxErrorCode =
  | "CONFIG_MISSING"
  | "JOB_NOT_FOUND"
  | "IMAGE_NOT_FOUND"
  | "INVALID_REFERENCE_COUNT"
  | "MODEL_CAPABILITY_UNSUPPORTED"
  | "INVALID_ARGUMENT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_BAD_RESPONSE"
  | "IMAGE_DECODE_FAILED";

export class FluxMcpError extends Error {
  constructor(
    public readonly code: FluxErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "FluxMcpError";
  }
}

export function asFluxError(error: unknown): FluxMcpError {
  if (error instanceof FluxMcpError) {
    return error;
  }

  if (error instanceof Error) {
    return new FluxMcpError("UPSTREAM_BAD_RESPONSE", error.message, error);
  }

  return new FluxMcpError(
    "UPSTREAM_BAD_RESPONSE",
    "An unknown error occurred.",
    error
  );
}

export function toToolErrorResult(error: unknown) {
  const fluxError = asFluxError(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `${fluxError.code}: ${fluxError.message}`
      }
    ],
    isError: true
  };
}