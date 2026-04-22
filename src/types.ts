import type { FluxModelId } from "./profiles/fluxProfiles.js";

export type FluxOutputFormat = "png" | "jpeg";
export type FluxJobStatus = "submitted" | "running" | "ready" | "failed";
export type FluxAssetType = "generated" | "reference";
export type FluxProviderKind = "azure-bfl" | "direct-bfl";
export type FluxProviderAuthStrategy = "authorization-bearer" | "x-key";
export type FluxReleaseChannel = "stable" | "preview";

export interface FluxProviderSnapshot {
  kind: FluxProviderKind;
  releaseChannel: FluxReleaseChannel;
}

export interface ComposeRequest {
  model: FluxModelId;
  prompt: string;
  referenceImageIds?: string[];
  referenceImagesBase64?: string[];
  width?: number;
  height?: number;
  aspectRatio?: string;
  outputFormat?: FluxOutputFormat;
  seed?: number;
  safetyTolerance?: number;
  guidance?: number;
  steps?: number;
}

export interface UpstreamReadyResult {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  raw: unknown;
}

export interface FluxProviderAdapter {
  readonly provider: FluxProviderSnapshot;
  submitCompose(
    request: ComposeRequest,
    referenceImagesBase64: string[]
  ): Promise<SubmittedComposeJob>;
  refreshJob(pollingUrl: string): Promise<RefreshedComposeJob>;
  fetchReadyResult(
    readyResult: UpstreamReadyResult
  ): Promise<{ buffer: Uint8Array; mimeType: string }>;
}

export interface SubmittedComposeJob {
  requestId?: string;
  pollingUrl?: string;
  readyResult?: UpstreamReadyResult;
  raw: unknown;
}

export interface RefreshedComposeJob {
  status: FluxJobStatus;
  readyResult?: UpstreamReadyResult;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export interface FluxJobRecord {
  jobId: string;
  toolName: string;
  status: FluxJobStatus;
  model: FluxModelId;
  provider: FluxProviderSnapshot;
  request: ComposeRequest;
  parentImageIds: string[];
  resultImageId?: string;
  errorCode?: string;
  errorMessage?: string;
  upstream: {
    requestId?: string;
    pollingUrl?: string;
    status?: string;
    submittedResponse?: unknown;
    lastResponse?: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FluxImageRecord {
  imageId: string;
  assetType: FluxAssetType;
  createdAt: string;
  model: FluxModelId;
  provider: FluxProviderSnapshot;
  prompt: string;
  seed?: number;
  outputFormat: FluxOutputFormat;
  width?: number;
  height?: number;
  parentImageIds: string[];
  sha256: string;
  mimeType: string;
  filePath: string;
  sourceJobId?: string;
  request: ComposeRequest;
}

export interface MetadataIndex {
  jobs: Record<string, FluxJobRecord>;
  images: Record<string, FluxImageRecord>;
  nextJobSequence: number;
  nextImageSequence: number;
}

export interface StoredImage {
  filePath: string;
  sha256: string;
  mimeType: string;
}