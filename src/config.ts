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

const DEFAULT_DIRECT_BFL_BASE_URL = "https://api.bfl.ai";
const DIRECT_BFL_PREVIEW_MODEL_PATHS = new Set(["flux-2-pro"]);

const EnvSchema = z.object({
  FLUX_SERVER_NAME: z.string().default("librechat-flux-mcp"),
  FLUX_SERVER_VERSION: z.string().default("0.1.0"),
  FLUX_HTTP_HOST: z.string().default("127.0.0.1"),
  FLUX_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  FLUX_HTTP_MCP_PATH: z.string().default("/mcp"),
  FLUX_PROVIDER_KIND: z.enum(["azure-bfl", "direct-bfl"]).optional(),
  FLUX_PROVIDER_BASE_URL: z.string().optional(),
  BFL_API_BASE_URL: z.string().optional(),
  AZURE_ENDPOINT: z.string().optional(),
  FLUX_PROVIDER_API_VERSION: z.string().default("preview"),
  FLUX_PROVIDER_PATH_PREFIX: z
    .string()
    .default("/providers/blackforestlabs/v1"),
  FLUX_PROVIDER_AUTH_STRATEGY: z
    .enum(["authorization-bearer", "x-key"])
    .optional(),
  FLUX_PROVIDER_AUTH_MODE: z
    .enum(["apiKey", "bearerToken"])
    .optional(),
  FLUX_PROVIDER_API_KEY: z.string().optional(),
  BFL_API_KEY: z.string().optional(),
  AZURE_API_KEY: z.string().optional(),
  FLUX_PROVIDER_BEARER_TOKEN: z.string().optional(),
  FLUX_PROVIDER_RELEASE_CHANNEL: z
    .enum(["stable", "preview"])
    .default("stable"),
  FLUX_DEFAULT_MODEL: z.enum(FLUX_MODEL_IDS).default("FLUX.2-pro"),
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
  };
  provider: {
    kind: FluxProviderKind;
    baseUrl?: string;
    apiVersion: string;
    pathPrefix: string;
    authStrategy: FluxProviderAuthStrategy;
    apiKey?: string;
    bearerToken?: string;
    releaseChannel: FluxReleaseChannel;
  };
  flux: {
    defaultModel: FluxModelId;
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
  const providerKind = inferProviderKind(parsed);
  const providerBaseUrl =
    parsed.FLUX_PROVIDER_BASE_URL ??
    (providerKind === "azure-bfl"
      ? parsed.AZURE_ENDPOINT
      : parsed.BFL_API_BASE_URL ?? DEFAULT_DIRECT_BFL_BASE_URL);
  const providerApiKey =
    parsed.FLUX_PROVIDER_API_KEY ?? parsed.BFL_API_KEY ?? parsed.AZURE_API_KEY;
  const authStrategy =
    parsed.FLUX_PROVIDER_AUTH_STRATEGY ??
    inferAuthStrategy(parsed.FLUX_PROVIDER_AUTH_MODE, providerKind);

  return {
    server: {
      name: parsed.FLUX_SERVER_NAME,
      version: parsed.FLUX_SERVER_VERSION
    },
    http: {
      host: parsed.FLUX_HTTP_HOST,
      port: parsed.FLUX_HTTP_PORT,
      mcpPath: normalizeMcpPath(parsed.FLUX_HTTP_MCP_PATH)
    },
    provider: {
      kind: providerKind,
      baseUrl: providerBaseUrl,
      apiVersion: parsed.FLUX_PROVIDER_API_VERSION,
      pathPrefix: normalizePathPrefix(parsed.FLUX_PROVIDER_PATH_PREFIX),
      authStrategy,
      apiKey: providerApiKey,
      bearerToken: parsed.FLUX_PROVIDER_BEARER_TOKEN,
      releaseChannel: parsed.FLUX_PROVIDER_RELEASE_CHANNEL
    },
    flux: {
      defaultModel: parsed.FLUX_DEFAULT_MODEL,
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
      "FLUX provider base URL is not configured. Set FLUX_PROVIDER_BASE_URL or AZURE_ENDPOINT."
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
        "FLUX_PROVIDER_API_KEY or BFL_API_KEY is required when using x-key authentication."
      );
    }

    return {
      "x-key": config.provider.apiKey
    };
  }

  if (config.provider.bearerToken) {
    return {
      Authorization: `Bearer ${config.provider.bearerToken}`
    };
  }

  if (!config.provider.apiKey) {
    throw new FluxMcpError(
      "CONFIG_MISSING",
      "FLUX_PROVIDER_API_KEY, AZURE_API_KEY, or FLUX_PROVIDER_BEARER_TOKEN is required when using bearer authorization."
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

function inferProviderKind(parsed: z.infer<typeof EnvSchema>): FluxProviderKind {
  if (parsed.FLUX_PROVIDER_KIND) {
    return parsed.FLUX_PROVIDER_KIND;
  }

  const explicitBaseUrl = parsed.FLUX_PROVIDER_BASE_URL ?? parsed.BFL_API_BASE_URL;
  if (
    parsed.BFL_API_KEY ||
    explicitBaseUrl?.includes("api.bfl.ai")
  ) {
    return "direct-bfl";
  }

  return "azure-bfl";
}

function inferAuthStrategy(
  legacyAuthMode: z.infer<typeof EnvSchema>["FLUX_PROVIDER_AUTH_MODE"],
  providerKind: FluxProviderKind
): FluxProviderAuthStrategy {
  if (legacyAuthMode === "bearerToken") {
    return "authorization-bearer";
  }

  if (legacyAuthMode === "apiKey") {
    return providerKind === "direct-bfl" ? "x-key" : "authorization-bearer";
  }

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