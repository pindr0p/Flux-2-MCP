import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { assertProviderConfigured, loadConfig } from "../src/config.js";
import { BflProviderAdapter } from "../src/adapters/bflProviderAdapter.js";
import { ImageStore } from "../src/storage/imageStore.js";
import { createLogger } from "../src/util/logging.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const adapter = new BflProviderAdapter(config, logger);
  const imageStore = new ImageStore(config.storage.outputDir);
  const [referenceOne, referenceTwo] = process.argv.slice(2);

  if (!referenceOne) {
    throw new Error(
      "Usage: npm run probe:compose -- /absolute/path/to/reference-1.jpg [/absolute/path/to/reference-2.jpg]"
    );
  }

  assertProviderConfigured(config);
  await imageStore.ensureOutputDir();
  process.stderr.write(
    `Provider=${config.provider.kind} release_channel=${config.provider.releaseChannel} model=${config.flux.defaultModel}\n`
  );

  const referenceImagesBase64 = await Promise.all(
    [referenceOne, referenceTwo]
      .filter((value): value is string => Boolean(value))
      .map(async (filePath) => {
        const resolvedPath = path.resolve(process.cwd(), filePath);
        const buffer = await fs.readFile(resolvedPath);
        return buffer.toString("base64");
      })
  );

  const submitted = await adapter.submitCompose(
    {
      model: config.flux.defaultModel,
      prompt: "Create a new composition that preserves the identity and style cues from the reference images.",
      outputFormat: "jpeg"
    },
    referenceImagesBase64
  );
  process.stderr.write(
    `Submitted request_id=${submitted.requestId ?? "n/a"} polling_url=${submitted.pollingUrl ?? "ready-inline"}\n`
  );

  const readyResult =
    submitted.readyResult ??
    (submitted.pollingUrl
      ? await waitForReady(adapter, submitted.pollingUrl, config.flux.requestTimeoutMs)
      : undefined);

  if (!readyResult) {
    throw new Error("Composition probe did not produce a ready result.");
  }

  const asset = await adapter.fetchReadyResult(readyResult);
  const probeId = `probe_compose_${config.provider.kind.replace(/-/g, "_")}_${Date.now()}`;
  const stored = await imageStore.saveImage(probeId, asset.buffer, asset.mimeType, "jpeg");
  process.stderr.write(`Saved composed image to ${stored.filePath}\n`);
}

async function waitForReady(
  adapter: BflProviderAdapter,
  pollingUrl: string,
  timeoutMs: number
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const refreshed = await adapter.refreshJob(pollingUrl);
    if (refreshed.status === "ready") {
      return refreshed.readyResult;
    }

    if (refreshed.status === "failed") {
      throw new Error(refreshed.errorMessage ?? "Composition probe failed.");
    }

    await delay(1000);
  }

  throw new Error(`Composition probe timed out after ${timeoutMs}ms.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Probe failed:", error);
  process.exit(1);
});