import type { FluxToolServices } from "../services.js";
import type {
  ComposeRequest,
  FluxImageRecord,
  FluxJobRecord,
  StoredImage,
  UpstreamReadyResult
} from "../types.js";
import { FluxMcpError } from "../util/errors.js";

export async function resolveReferenceImages(
  services: FluxToolServices,
  imageIds: string[]
): Promise<{ records: FluxImageRecord[]; base64Images: string[] }> {
  const records = await Promise.all(
    imageIds.map(async (imageId) => {
      const record = await services.metadataStore.getImage(imageId);
      if (!record) {
        throw new FluxMcpError(
          "IMAGE_NOT_FOUND",
          `Image ${imageId} was not found in the local image store.`
        );
      }

      return record;
    })
  );

  const base64Images = await Promise.all(
    records.map(async (record) => {
      try {
        return await services.imageStore.readImageBase64(record.filePath);
      } catch (error) {
        throw new FluxMcpError(
          "IMAGE_DECODE_FAILED",
          `Failed to load reference image ${record.imageId}.`,
          error
        );
      }
    })
  );

  return {
    records,
    base64Images
  };
}

export async function submitComposeJob(options: {
  services: FluxToolServices;
  toolName: string;
  request: ComposeRequest;
  parentImageIds: string[];
  referenceImagesBase64: string[];
}): Promise<FluxJobRecord> {
  const { parentImageIds, referenceImagesBase64, request, services, toolName } =
    options;
  const submission = await services.adapter.submitCompose(
    request,
    referenceImagesBase64
  );

  const createdJob = await services.metadataStore.createJob({
    toolName,
    status: submission.readyResult ? "ready" : "submitted",
    model: request.model,
    provider: services.adapter.provider,
    request,
    parentImageIds,
    upstream: {
      requestId: submission.requestId,
      pollingUrl: submission.pollingUrl,
      status: submission.readyResult ? "ready" : "submitted",
      submittedResponse: submission.raw,
      lastResponse: submission.raw
    }
  });

  if (submission.readyResult) {
    return materializeComposeResult(
      services,
      createdJob,
      submission.readyResult,
      submission.raw
    );
  }

  return createdJob;
}

export async function refreshComposeJob(
  services: FluxToolServices,
  job: FluxJobRecord
): Promise<FluxJobRecord> {
  if (job.status === "ready" || job.status === "failed" || !job.upstream.pollingUrl) {
    return job;
  }

  const refreshed = await services.adapter.refreshJob(job.upstream.pollingUrl);
  if (refreshed.status === "ready" && refreshed.readyResult) {
    const syncedJob = await services.metadataStore.updateJob(job.jobId, (current) => ({
      ...current,
      status: "ready",
      upstream: {
        ...current.upstream,
        status: "ready",
        lastResponse: refreshed.raw
      }
    }));

    return materializeComposeResult(
      services,
      syncedJob,
      refreshed.readyResult,
      refreshed.raw
    );
  }

  return services.metadataStore.updateJob(job.jobId, (current) => ({
    ...current,
    status: refreshed.status,
    errorCode: refreshed.errorCode,
    errorMessage: refreshed.errorMessage,
    upstream: {
      ...current.upstream,
      status: refreshed.status,
      lastResponse: refreshed.raw
    }
  }));
}

export async function getJobOrThrow(
  services: FluxToolServices,
  jobId: string
): Promise<FluxJobRecord> {
  const job = await services.metadataStore.getJob(jobId);
  if (!job) {
    throw new FluxMcpError("JOB_NOT_FOUND", `Job ${jobId} was not found.`);
  }

  return job;
}

async function materializeComposeResult(
  services: FluxToolServices,
  job: FluxJobRecord,
  readyResult: UpstreamReadyResult,
  rawResponse: unknown
): Promise<FluxJobRecord> {
  if (job.resultImageId) {
    return job;
  }

  const readyAsset = await services.adapter.fetchReadyResult(readyResult);
  const imageId = await services.metadataStore.allocateImageId();
  const outputFormat = normalizeOutputFormat(job.request.outputFormat, readyAsset);
  const storedImage = await services.imageStore.saveImage(
    imageId,
    readyAsset.buffer,
    readyAsset.mimeType,
    outputFormat
  );

  await services.metadataStore.putImage(
    buildImageRecord(job, imageId, storedImage, outputFormat)
  );

  return services.metadataStore.updateJob(job.jobId, (current) => ({
    ...current,
    status: "ready",
    resultImageId: imageId,
    upstream: {
      ...current.upstream,
      status: "ready",
      lastResponse: rawResponse
    }
  }));
}

function buildImageRecord(
  job: FluxJobRecord,
  imageId: string,
  storedImage: StoredImage,
  outputFormat: "png" | "jpeg"
): FluxImageRecord {
  return {
    imageId,
    assetType: "generated",
    createdAt: new Date().toISOString(),
    model: job.model,
    provider: job.provider,
    prompt: job.request.prompt,
    seed: job.request.seed,
    outputFormat,
    width: job.request.width,
    height: job.request.height,
    parentImageIds: job.parentImageIds,
    sha256: storedImage.sha256,
    mimeType: storedImage.mimeType,
    filePath: storedImage.filePath,
    sourceJobId: job.jobId,
    request: job.request
  };
}

function normalizeOutputFormat(
  preferredFormat: ComposeRequest["outputFormat"],
  readyAsset: { mimeType: string }
): "png" | "jpeg" {
  if (preferredFormat) {
    return preferredFormat;
  }

  return readyAsset.mimeType === "image/png" ? "png" : "jpeg";
}