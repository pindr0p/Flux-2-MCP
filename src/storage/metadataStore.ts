import fs from "node:fs/promises";
import path from "node:path";

import type {
  FluxImageRecord,
  FluxJobRecord,
  MetadataIndex
} from "../types.js";
import { FluxMcpError } from "../util/errors.js";

const EMPTY_INDEX: MetadataIndex = {
  jobs: {},
  images: {},
  nextJobSequence: 1,
  nextImageSequence: 1
};

export class MetadataStore {
  private mutationChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async ensureInitialized(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeIndex(EMPTY_INDEX);
    }
  }

  async getJob(jobId: string): Promise<FluxJobRecord | undefined> {
    const index = await this.readIndex();
    return index.jobs[jobId];
  }

  async getImage(imageId: string): Promise<FluxImageRecord | undefined> {
    const index = await this.readIndex();
    return index.images[imageId];
  }

  async createJob(
    draft: Omit<FluxJobRecord, "jobId" | "createdAt" | "updatedAt">
  ): Promise<FluxJobRecord> {
    return this.withMutation(async (index) => {
      const jobId = `job_${String(index.nextJobSequence).padStart(6, "0")}`;
      const now = new Date().toISOString();
      const job: FluxJobRecord = {
        ...draft,
        jobId,
        createdAt: now,
        updatedAt: now
      };

      index.jobs[jobId] = job;
      index.nextJobSequence += 1;
      return job;
    });
  }

  async updateJob(
    jobId: string,
    updates:
      | Partial<FluxJobRecord>
      | ((current: FluxJobRecord) => FluxJobRecord)
  ): Promise<FluxJobRecord> {
    return this.withMutation(async (index) => {
      const current = index.jobs[jobId];
      if (!current) {
        throw new FluxMcpError("JOB_NOT_FOUND", `Job ${jobId} was not found.`);
      }

      const next =
        typeof updates === "function"
          ? updates(current)
          : ({ ...current, ...updates } as FluxJobRecord);

      const updated: FluxJobRecord = {
        ...next,
        jobId: current.jobId,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };

      index.jobs[jobId] = updated;
      return updated;
    });
  }

  async allocateImageId(): Promise<string> {
    return this.withMutation(async (index) => {
      const imageId = `img_${String(index.nextImageSequence).padStart(6, "0")}`;
      index.nextImageSequence += 1;
      return imageId;
    });
  }

  async putImage(record: FluxImageRecord): Promise<FluxImageRecord> {
    return this.withMutation(async (index) => {
      index.images[record.imageId] = record;
      return record;
    });
  }

  private async readIndex(): Promise<MetadataIndex> {
    await this.ensureInitialized();
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = raw.trim() ? (JSON.parse(raw) as Partial<MetadataIndex>) : {};

    return {
      jobs: parsed.jobs ?? {},
      images: parsed.images ?? {},
      nextJobSequence: parsed.nextJobSequence ?? 1,
      nextImageSequence: parsed.nextImageSequence ?? 1
    };
  }

  private async writeIndex(index: MetadataIndex): Promise<void> {
    const tempFilePath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(index, null, 2));
    await fs.rename(tempFilePath, this.filePath);
  }

  private async withMutation<T>(
    mutate: (index: MetadataIndex) => Promise<T> | T
  ): Promise<T> {
    const run = this.mutationChain.then(async () => {
      const index = await this.readIndex();
      const result = await mutate(index);
      await this.writeIndex(index);
      return result;
    });

    this.mutationChain = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }
}