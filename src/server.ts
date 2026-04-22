import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig, type FluxServerConfig } from "./config.js";
import { getFluxModelProfile } from "./profiles/fluxProfiles.js";
import {
  createFluxToolServices,
  type FluxToolServices
} from "./services.js";
import { registerFluxGetJobResultTool } from "./tools/fluxGetJobResult.js";
import { registerFluxGetJobStatusTool } from "./tools/fluxGetJobStatus.js";
import { registerFluxGetModelCapabilitiesTool } from "./tools/fluxGetModelCapabilities.js";
import { registerFluxSubmitEditMultiReferenceTool } from "./tools/fluxSubmitEditMultiReference.js";
import { registerFluxSubmitEditTool } from "./tools/fluxSubmitEdit.js";
import { registerFluxSubmitGenerateTool } from "./tools/fluxSubmitGenerate.js";
import { registerFluxSubmitGenerateWithReferencesTool } from "./tools/fluxSubmitGenerateWithReferences.js";
import { registerFluxSubmitVariantsTool } from "./tools/fluxSubmitVariants.js";
import { createLogger, type FluxLogger } from "./util/logging.js";

export function resolveRegisteredToolNames(config: FluxServerConfig): string[] {
  const profile = getFluxModelProfile(config.flux.defaultModel);
  const toolNames = ["flux_get_model_capabilities"];

  if (profile.supportsTextOnlyGeneration) {
    toolNames.push("flux_submit_generate");
  }

  if (
    profile.supportsReferenceGuidedComposition &&
    profile.maxReferenceImages >= 1
  ) {
    toolNames.push("flux_submit_generate_with_references");
  }

  if (profile.supportsSingleReferenceEdit && profile.maxReferenceImages >= 1) {
    toolNames.push("flux_submit_edit");
  }

  if (profile.supportsMultiReferenceEdit && profile.maxReferenceImages >= 2) {
    toolNames.push("flux_submit_edit_multi_reference");
  }

  toolNames.push(
    "flux_submit_variants",
    "flux_get_job_status",
    "flux_get_job_result"
  );

  return toolNames;
}

export function createConfiguredServer(
  config: FluxServerConfig,
  services: FluxToolServices
) {
  const registeredToolNames = new Set(resolveRegisteredToolNames(config));
  const server = new McpServer(
    {
      name: config.server.name,
      version: config.server.version
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  registerFluxGetModelCapabilitiesTool(server, services);
  if (registeredToolNames.has("flux_submit_generate")) {
    registerFluxSubmitGenerateTool(server, services);
  }

  if (registeredToolNames.has("flux_submit_generate_with_references")) {
    registerFluxSubmitGenerateWithReferencesTool(server, services);
  }

  if (registeredToolNames.has("flux_submit_edit")) {
    registerFluxSubmitEditTool(server, services);
  }

  if (registeredToolNames.has("flux_submit_edit_multi_reference")) {
    registerFluxSubmitEditMultiReferenceTool(server, services);
  }

  registerFluxSubmitVariantsTool(server, services);
  registerFluxGetJobStatusTool(server, services);
  registerFluxGetJobResultTool(server, services);

  return server;
}

export async function buildServer() {
  const config = loadConfig();
  const logger = createLogger();
  const services = await createFluxToolServices(config, logger);

  return buildServerFromServices(config, logger, services);
}

export function buildServerFromServices(
  config: FluxServerConfig,
  logger: FluxLogger,
  services: FluxToolServices
) {
  const server = createConfiguredServer(config, services);

  return {
    config,
    logger,
    server,
    services
  };
}