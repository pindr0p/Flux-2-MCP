import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import { z } from "zod";

import {
  FLUX_MODEL_IDS,
  type FluxModelId
} from "./profiles/fluxProfiles.js";
import type {
  FluxProviderAuthStrategy,
  FluxProviderKind,
  FluxReleaseChannel
} from "./types.js";
import { FluxMcpError } from "./util/errors.js";

dotenv.config();

const AZURE_BFL_PATH_PREFIX = "/providers/blackforestlabs/v1";
const DIRECT_BFL_PREVIEW_MODEL_PATHS = new Set(["flux-2-pro"]);

const OptionalStringEnv = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const EnvSchema = z.object({
  FLUX_SERVER_NAME: z.string().default("librechat-flux-mcp"),
  FLUX_SERVER_VERSION: z.string().default("0.1.0"),
  FLUX_HTTP_HOST: z.string().default("127.0.0.1"),
  FLUX_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  FLUX_HTTP_MCP_PATH: z.string().default("/mcp"),
  FLUX_HTTP_SESSION_IDLE_TIMEOUT_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  FLUX_HTTP_SESSION_SWEEP_INTERVAL_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),
  FLUX_REDIS_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  FLUX_HTTP_SSE_RETRY_INTERVAL_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(1000),
  FLUX_HTTP_EVENT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  FLUX_HTTP_EVENT_MAX_STREAM_LENGTH: z
    .coerce
    .number()
    .int()
    .positive()
    .default(1000),
  FLUX_HTTP_EVENT_KEY_PREFIX: z.string().default("flux:mcp:sse"),
  FLUX_PROVIDER_KIND: z.enum(["azure-bfl", "direct-bfl"]),
  BASE_URL: z.string().trim().min(1),
  API_KEY: z.string().trim().min(1),
  MODEL: z.enum(FLUX_MODEL_IDS).default("FLUX.2-pro"),
  FLUX_PROVIDER_API_VERSION: z.string().default("preview"),
  FLUX_PROVIDER_RELEASE_CHANNEL: z
    .enum(["stable", "preview"])
    .default("stable"),
  FLUX_OUTPUT_DIR: z.string().default("./data/flux/images"),
  FLUX_METADATA_FILE: z.string().default("./data/flux/metadata.json"),
  FLUX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(240000),
  FLUX_MAX_PARALLEL_REQUESTS: z.coerce.number().int().positive().default(2),
  FLUX_VARIANTS_MAX_COUNT: z.coerce.number().int().min(1).max(8).default(4),
  FLUX_ENABLE_IMAGE_IMPORT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export interface FluxServerConfig {
  server: {
    name: string;
    version: string;
  };
  http: {
    host: string;
    port: number;
    mcpPath: string;
    sessionIdleTimeoutMs: number;
    sessionSweepIntervalMs: number;
    resumableStreams?: {
      redisUrl: string;
      retryIntervalMs: number;
      eventTtlSeconds: number;
      maxEventsPerStream: number;
      keyPrefix: string;
    };
  };
  provider: {
    kind: FluxProviderKind;
    baseUrl?: string;
    apiVersion: string;
    pathPrefix: string;
    authStrategy: FluxProviderAuthStrategy;
    apiKey?: string;
    releaseChannel: FluxReleaseChannel;
  };
  flux: {
    model: FluxModelId;
    requestTimeoutMs: number;
    maxParallelRequests: number;
    variantsMaxCount: number;
    enableImageImport: boolean;
  };
  storage: {
    outputDir: string;
    metadataFile: string;
  };
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): FluxServerConfig {
  const parsed = EnvSchema.parse(env);
  const resumableStreams = parsed.FLUX_REDIS_URL
    ? {
        redisUrl: parsed.FLUX_REDIS_URL,
        retryIntervalMs: parsed.FLUX_HTTP_SSE_RETRY_INTERVAL_MS,
        eventTtlSeconds: parsed.FLUX_HTTP_EVENT_TTL_SECONDS,
        maxEventsPerStream: parsed.FLUX_HTTP_EVENT_MAX_STREAM_LENGTH,
        keyPrefix: parsed.FLUX_HTTP_EVENT_KEY_PREFIX
      }
    : undefined;
  const providerKind = parsed.FLUX_PROVIDER_KIND;

  return {
    server: {
      name: parsed.FLUX_SERVER_NAME,
      version: parsed.FLUX_SERVER_VERSION
    },
    http: {
      host: parsed.FLUX_HTTP_HOST,
      port: parsed.FLUX_HTTP_PORT,
      mcpPath: normalizeMcpPath(parsed.FLUX_HTTP_MCP_PATH),
      sessionIdleTimeoutMs: parsed.FLUX_HTTP_SESSION_IDLE_TIMEOUT_MS,
      sessionSweepIntervalMs: parsed.FLUX_HTTP_SESSION_SWEEP_INTERVAL_MS,
      resumableStreams
    },
    provider: {
      kind: providerKind,
      baseUrl: parsed.BASE_URL,
      apiVersion: parsed.FLUX_PROVIDER_API_VERSION,
      pathPrefix: resolveProviderPathPrefix(providerKind),
      authStrategy: resolveProviderAuthStrategy(providerKind),
      apiKey: parsed.API_KEY,
      releaseChannel: parsed.FLUX_PROVIDER_RELEASE_CHANNEL
    },
    flux: {
      model: parsed.MODEL,
      requestTimeoutMs: parsed.FLUX_REQUEST_TIMEOUT_MS,
      maxParallelRequests: parsed.FLUX_MAX_PARALLEL_REQUESTS,
      variantsMaxCount: parsed.FLUX_VARIANTS_MAX_COUNT,
      enableImageImport: parsed.FLUX_ENABLE_IMAGE_IMPORT
    },
    storage: {
      outputDir: path.resolve(process.cwd(), parsed.FLUX_OUTPUT_DIR),
      metadataFile: path.resolve(process.cwd(), parsed.FLUX_METADATA_FILE)
    }
  };
}

export function assertProviderConfigured(config: FluxServerConfig): void {
  if (!config.provider.baseUrl) {
    throw new FluxMcpError(
      "CONFIG_MISSING",
      "FLUX provider base URL is not configured. Set BASE_URL."
    );
  }

  resolveProviderHeaders(config);
}

export function resolveProviderModelUrl(
  config: FluxServerConfig,
  modelPath: string
): string {
  if (!config.provider.baseUrl) {
    throw new FluxMcpError(
      "CONFIG_MISSING",
      "FLUX provider base URL is not configured."
    );
  }

  const baseUrl = config.provider.baseUrl.replace(/\/$/, "");

  if (config.provider.kind === "direct-bfl") {
    const endpointPath = resolveDirectBflEndpointPath(
      modelPath,
      config.provider.releaseChannel
    );
    return `${baseUrl}/v1/${endpointPath}`;
  }

  const pathPrefix = config.provider.pathPrefix.replace(/\/$/, "");

  return `${baseUrl}${pathPrefix}/${modelPath}?api-version=${encodeURIComponent(
    config.provider.apiVersion
  )}`;
}

export function resolveProviderHeaders(
  config: FluxServerConfig
): Record<string, string> {
  if (config.provider.authStrategy === "x-key") {
    if (!config.provider.apiKey) {
      throw new FluxMcpError(
        "CONFIG_MISSING",
        "FLUX provider API key is not configured. Set API_KEY."
      );
    }

    return {
      "x-key": config.provider.apiKey
    };
  }

  if (!config.provider.apiKey) {
    throw new FluxMcpError(
      "CONFIG_MISSING",
      "FLUX provider API key is not configured. Set API_KEY."
    );
  }

  return {
    Authorization: `Bearer ${config.provider.apiKey}`
  };
}

function normalizePathPrefix(value: string): string {
  if (!value.startsWith("/")) {
    return `/${value}`;
  }

  return value;
}

function normalizeMcpPath(value: string): string {
  const normalized = normalizePathPrefix(value).replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/mcp";
}

function resolveProviderPathPrefix(providerKind: FluxProviderKind): string {
  return providerKind === "azure-bfl" ? AZURE_BFL_PATH_PREFIX : "/v1";
}

function resolveProviderAuthStrategy(
  providerKind: FluxProviderKind
): FluxProviderAuthStrategy {
  return providerKind === "direct-bfl" ? "x-key" : "authorization-bearer";
}

function resolveDirectBflEndpointPath(
  modelPath: string,
  releaseChannel: FluxReleaseChannel
): string {
  if (
    releaseChannel === "preview" &&
    DIRECT_BFL_PREVIEW_MODEL_PATHS.has(modelPath)
  ) {
    return `${modelPath}-preview`;
  }

  return modelPath;
}