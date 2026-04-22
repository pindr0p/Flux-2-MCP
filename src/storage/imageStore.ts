import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { FluxOutputFormat, StoredImage } from "../types.js";

export class ImageStore {
  constructor(private readonly outputDir: string) {}

  async ensureOutputDir(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async saveImage(
    imageId: string,
    buffer: Uint8Array,
    mimeType: string,
    preferredFormat?: FluxOutputFormat
  ): Promise<StoredImage> {
    await this.ensureOutputDir();

    const normalizedMimeType = normalizeMimeType(mimeType, preferredFormat);
    const extension = mimeTypeToExtension(normalizedMimeType);
    const filePath = path.join(this.outputDir, `${imageId}.${extension}`);

    await fs.writeFile(filePath, buffer);

    return {
      filePath,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      mimeType: normalizedMimeType
    };
  }

  async readImageBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString("base64");
  }
}

function normalizeMimeType(
  mimeType: string,
  preferredFormat?: FluxOutputFormat
): string {
  const normalized = mimeType.split(";")[0]?.trim();

  if (normalized === "image/png" || normalized === "image/jpeg") {
    return normalized;
  }

  if (preferredFormat === "png") {
    return "image/png";
  }

  return "image/jpeg";
}

function mimeTypeToExtension(mimeType: string): string {
  return mimeType === "image/png" ? "png" : "jpg";
}