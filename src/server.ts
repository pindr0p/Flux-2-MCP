import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig } from "./config.js";
import { createFluxToolServices } from "./services.js";
import { registerFluxGetJobResultTool } from "./tools/fluxGetJobResult.js";
import { registerFluxGetJobStatusTool } from "./tools/fluxGetJobStatus.js";
import { registerFluxGetModelCapabilitiesTool } from "./tools/fluxGetModelCapabilities.js";
import { registerFluxSubmitEditMultiReferenceTool } from "./tools/fluxSubmitEditMultiReference.js";
import { registerFluxSubmitEditTool } from "./tools/fluxSubmitEdit.js";
import { registerFluxSubmitGenerateTool } from "./tools/fluxSubmitGenerate.js";
import { registerFluxSubmitGenerateWithReferencesTool } from "./tools/fluxSubmitGenerateWithReferences.js";
import { registerFluxSubmitVariantsTool } from "./tools/fluxSubmitVariants.js";
import { createLogger } from "./util/logging.js";

export async function buildServer() {
  const config = loadConfig();
  const logger = createLogger();
  const services = await createFluxToolServices(config, logger);

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

  return {
    config,
    logger,
    server,
    services
  };
}