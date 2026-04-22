import type { FluxServerConfig } from "./config.js";
import { BflProviderAdapter } from "./adapters/bflProviderAdapter.js";
import { refreshComposeJob } from "./flux/compose.js";
import {
  FluxJobMonitor,
  type FluxJobNotificationPublisher
} from "./monitor/jobMonitor.js";
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
  jobMonitor: FluxJobMonitor;
}

export interface FluxToolServiceOptions {
  jobNotifications?: FluxJobNotificationPublisher;
}

export async function createFluxToolServices(
  config: FluxServerConfig,
  logger: FluxLogger,
  options: FluxToolServiceOptions = {}
): Promise<FluxToolServices> {
  const metadataStore = new MetadataStore(config.storage.metadataFile);
  const imageStore = new ImageStore(config.storage.outputDir);

  await metadataStore.ensureInitialized();
  await imageStore.ensureOutputDir();

  const services = {
    config,
    logger,
    adapter: createProviderAdapter(config, logger),
    imageStore,
    metadataStore,
    jobMonitor: undefined as unknown as FluxJobMonitor
  } satisfies FluxToolServices;

  services.jobMonitor = new FluxJobMonitor({
    logger,
    refreshJob: (job) => refreshComposeJob(services, job),
    notifications: options.jobNotifications
  });

  return services;
}

function createProviderAdapter(
  config: FluxServerConfig,
  logger: FluxLogger
): FluxProviderAdapter {
  return new BflProviderAdapter(config, logger);
}