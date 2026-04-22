export const FLUX_MODEL_IDS = [
  "FLUX.2-pro",
  "FLUX.2-flex",
  "FLUX.1-Kontext-pro",
  "FLUX-1.1-pro"
] as const;

export type FluxModelId = (typeof FLUX_MODEL_IDS)[number];

export interface FluxModelProfile {
  id: FluxModelId;
  enabled: boolean;
  apiMode: "bflProvider" | "imageApi" | "both";
  modelPath: string;
  maxReferenceImages: number;
  supportsTextOnlyGeneration: boolean;
  supportsReferenceGuidedComposition: boolean;
  supportsSingleReferenceEdit: boolean;
  supportsMultiReferenceEdit: boolean;
  supportsGuidance: boolean;
  supportsSteps: boolean;
  supportsAspectRatio: boolean;
  supportsWidthHeight: boolean;
  maxOutputMegapixels: number;
}

const FLUX_MODEL_PROFILES: Record<FluxModelId, FluxModelProfile> = {
  "FLUX.2-pro": {
    id: "FLUX.2-pro",
    enabled: true,
    apiMode: "bflProvider",
    modelPath: "flux-2-pro",
    maxReferenceImages: 8,
    supportsTextOnlyGeneration: true,
    supportsReferenceGuidedComposition: true,
    supportsSingleReferenceEdit: true,
    supportsMultiReferenceEdit: true,
    supportsGuidance: true,
    supportsSteps: true,
    supportsAspectRatio: true,
    supportsWidthHeight: true,
    maxOutputMegapixels: 4
  },
  "FLUX.2-flex": {
    id: "FLUX.2-flex",
    enabled: false,
    apiMode: "bflProvider",
    modelPath: "flux-2-flex",
    maxReferenceImages: 10,
    supportsTextOnlyGeneration: true,
    supportsReferenceGuidedComposition: true,
    supportsSingleReferenceEdit: true,
    supportsMultiReferenceEdit: true,
    supportsGuidance: true,
    supportsSteps: true,
    supportsAspectRatio: true,
    supportsWidthHeight: true,
    maxOutputMegapixels: 4
  },
  "FLUX.1-Kontext-pro": {
    id: "FLUX.1-Kontext-pro",
    enabled: false,
    apiMode: "both",
    modelPath: "flux-kontext-pro",
    maxReferenceImages: 1,
    supportsTextOnlyGeneration: true,
    supportsReferenceGuidedComposition: true,
    supportsSingleReferenceEdit: true,
    supportsMultiReferenceEdit: false,
    supportsGuidance: false,
    supportsSteps: false,
    supportsAspectRatio: true,
    supportsWidthHeight: true,
    maxOutputMegapixels: 1
  },
  "FLUX-1.1-pro": {
    id: "FLUX-1.1-pro",
    enabled: false,
    apiMode: "both",
    modelPath: "flux-pro-1.1",
    maxReferenceImages: 0,
    supportsTextOnlyGeneration: true,
    supportsReferenceGuidedComposition: false,
    supportsSingleReferenceEdit: false,
    supportsMultiReferenceEdit: false,
    supportsGuidance: false,
    supportsSteps: false,
    supportsAspectRatio: false,
    supportsWidthHeight: true,
    maxOutputMegapixels: 1.6
  }
};

export function getFluxModelProfile(modelId: FluxModelId): FluxModelProfile {
  return FLUX_MODEL_PROFILES[modelId];
}

export function listFluxModelProfiles(options?: {
  enabledOnly?: boolean;
}): FluxModelProfile[] {
  const enabledOnly = options?.enabledOnly ?? false;
  return Object.values(FLUX_MODEL_PROFILES).filter(
    (profile) => !enabledOnly || profile.enabled
  );
}