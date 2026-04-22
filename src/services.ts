import type { FluxServerConfig } from "./config.js";
import { BflProviderAdapter } from "./adapters/bflProviderAdapter.js";
import { ImageStore } from "./storage/imageStore.js";
import { MetadataStore } from "./storage/metadataStore.js";
import type { FluxProviderAdapter } from "./types.js";
import type { FluxLogger } from "./util/logging.js";

export interface FluxToolServices {
  config: FluxServerConfig;
  logger: FluxLogger;
  adapter: FluxProviderAdapter;
  imageStore: ImageStore;
  metadataStore: MetadataStore;
}

export async function createFluxToolServices(
  config: FluxServerConfig,
  logger: FluxLogger
): Promise<FluxToolServices> {
  const metadataStore = new MetadataStore(config.storage.metadataFile);
  const imageStore = new ImageStore(config.storage.outputDir);

  await metadataStore.ensureInitialized();
  await imageStore.ensureOutputDir();

  return {
    config,
    logger,
    adapter: createProviderAdapter(config, logger),
    imageStore,
    metadataStore
  };
}

function createProviderAdapter(
  config: FluxServerConfig,
  logger: FluxLogger
): FluxProviderAdapter {
  return new BflProviderAdapter(config, logger);
}