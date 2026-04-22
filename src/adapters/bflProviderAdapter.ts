import {
  type FluxServerConfig,
  resolveProviderHeaders,
  resolveProviderModelUrl
} from "../config.js";
import { buildComposePayload } from "../flux/payloads.js";
import { getFluxModelProfile } from "../profiles/fluxProfiles.js";
import type {
  ComposeRequest,
  FluxProviderAdapter,
  RefreshedComposeJob,
  SubmittedComposeJob,
  UpstreamReadyResult
} from "../types.js";
import { FluxMcpError } from "../util/errors.js";
import type { FluxLogger } from "../util/logging.js";
import { ConcurrencyLimiter } from "../util/concurrencyLimiter.js";

export class BflProviderAdapter implements FluxProviderAdapter {
  readonly provider;
  private readonly requestLimiter: ConcurrencyLimiter;

  constructor(
    private readonly config: FluxServerConfig,
    private readonly logger: FluxLogger
  ) {
    this.provider = {
      kind: config.provider.kind,
      releaseChannel: config.provider.releaseChannel
    };
    this.requestLimiter = new ConcurrencyLimiter(
      config.flux.maxParallelRequests
    );
  }

  async submitCompose(
    request: ComposeRequest,
    referenceImagesBase64: string[]
  ): Promise<SubmittedComposeJob> {
    const profile = getFluxModelProfile(request.model);
    const payload = buildComposePayload({
      request,
      profile,
      referenceImagesBase64
    });

    const url = resolveProviderModelUrl(this.config, profile.modelPath);
    const response = await this.fetchJson(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...resolveProviderHeaders(this.config),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = response.body as Record<string, unknown>;
    const readyResult = this.extractReadyResult(body);

    if (readyResult) {
      return {
        requestId: stringOrUndefined(body.id),
        raw: body,
        readyResult
      };
    }

    const pollingUrl = stringOrUndefined(body.polling_url);
    if (!pollingUrl && !body.id) {
      throw new FluxMcpError(
        "UPSTREAM_BAD_RESPONSE",
        "Upstream submit response did not include a polling URL or image result.",
        body
      );
    }

    return {
      requestId: stringOrUndefined(body.id),
      pollingUrl,
      raw: body
    };
  }

  async refreshJob(pollingUrl: string): Promise<RefreshedComposeJob> {
    const response = await this.fetchJson(pollingUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...resolveProviderHeaders(this.config)
      }
    });

    const body = response.body as Record<string, unknown>;
    const readyResult = this.extractReadyResult(body);
    if (readyResult) {
      return {
        status: "ready",
        readyResult,
        raw: body
      };
    }

    const status = stringOrUndefined(body.status)?.toLowerCase();
    if (status === "ready") {
      throw new FluxMcpError(
        "UPSTREAM_BAD_RESPONSE",
        "Upstream job reported Ready but no image result was present.",
        body
      );
    }

    if (status === "error" || status === "failed") {
      return {
        status: "failed",
        errorCode: "UPSTREAM_BAD_RESPONSE",
        errorMessage: this.extractErrorMessage(body),
        raw: body
      };
    }

    return {
      status: "running",
      raw: body
    };
  }

  async fetchReadyResult(
    readyResult: UpstreamReadyResult
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (readyResult.imageBase64) {
      return {
        buffer: Buffer.from(readyResult.imageBase64, "base64"),
        mimeType: readyResult.mimeType ?? "image/jpeg"
      };
    }

    if (!readyResult.imageUrl) {
      throw new FluxMcpError(
        "UPSTREAM_BAD_RESPONSE",
        "Ready result did not include a signed image URL or base64 payload."
      );
    }

    const response = await fetch(readyResult.imageUrl);
    if (!response.ok) {
      throw new FluxMcpError(
        "UPSTREAM_BAD_RESPONSE",
        `Failed to download generated image. HTTP ${response.status}.`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType =
      response.headers.get("content-type")?.split(";")[0] ??
      readyResult.mimeType ??
      "image/jpeg";

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType
    };
  }

  private async fetchJson(
    url: string,
    init: RequestInit
  ): Promise<{ status: number; body: unknown }> {
    return this.requestLimiter.run(async () => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        this.config.flux.requestTimeoutMs
      );

      try {
        this.logger.debug(
          {
            method: init.method,
            provider: this.provider.kind,
            url,
            maxParallelRequests: this.config.flux.maxParallelRequests
          },
          "Submitting upstream request."
        );

        const response = await fetch(url, {
          ...init,
          signal: controller.signal
        });
        const text = await response.text();
        const body = parseMaybeJson(text);

        if (!response.ok) {
          const code =
            response.status === 429
              ? "UPSTREAM_RATE_LIMITED"
              : "UPSTREAM_BAD_RESPONSE";
          throw new FluxMcpError(
            code,
            `Upstream request failed with HTTP ${response.status}.`,
            body
          );
        }

        return {
          status: response.status,
          body
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new FluxMcpError(
            "UPSTREAM_TIMEOUT",
            `Upstream request timed out after ${this.config.flux.requestTimeoutMs}ms.`
          );
        }

        throw error;
      } finally {
        clearTimeout(timeoutHandle);
      }
    });
  }

  private extractReadyResult(body: Record<string, unknown>): UpstreamReadyResult | undefined {
    const nestedResult = isObject(body.result) ? body.result : undefined;
    const nestedData = Array.isArray(body.data) ? body.data[0] : undefined;

    const imageUrl =
      stringOrUndefined(nestedResult?.sample) ??
      stringOrUndefined(body.sample) ??
      (isObject(nestedData) ? stringOrUndefined(nestedData.url) : undefined);

    const imageBase64 =
      stringOrUndefined(nestedResult?.b64_json) ??
      stringOrUndefined(nestedResult?.sample_b64) ??
      stringOrUndefined(body.b64_json) ??
      (isObject(nestedData) ? stringOrUndefined(nestedData.b64_json) : undefined);

    if (!imageUrl && !imageBase64) {
      return undefined;
    }

    return {
      imageUrl,
      imageBase64,
      raw: body
    };
  }

  private extractErrorMessage(body: Record<string, unknown>): string {
    const nestedError = isObject(body.error) ? body.error : undefined;
    return (
      stringOrUndefined(nestedError?.message) ??
      stringOrUndefined(body.error) ??
      stringOrUndefined(body.message) ??
      "The upstream job failed."
    );
  }
}

function parseMaybeJson(text: string): unknown {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}