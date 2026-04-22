import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig, type FluxServerConfig } from "./config.js";
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

export function createConfiguredServer(
  config: FluxServerConfig,
  services: FluxToolServices
) {
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
  registerFluxSubmitGenerateTool(server, services);
  registerFluxSubmitGenerateWithReferencesTool(server, services);
  registerFluxSubmitEditTool(server, services);
  registerFluxSubmitEditMultiReferenceTool(server, services);
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