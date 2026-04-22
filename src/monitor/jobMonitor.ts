import type { FluxJobRecord } from "../types.js";
import type { FluxLogger } from "../util/logging.js";

export interface FluxJobNotification {
  sessionId: string;
  job: FluxJobRecord;
}

export interface FluxJobNotificationPublisher {
  publishJobUpdate(notification: FluxJobNotification): Promise<void>;
}

interface FluxJobMonitorOptions {
  logger: FluxLogger;
  pollIntervalMs?: number;
  refreshJob: (job: FluxJobRecord) => Promise<FluxJobRecord>;
  notifications?: FluxJobNotificationPublisher;
}

interface ActiveMonitor {
  promise: Promise<void>;
  sessionIds: Set<string>;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;

export class FluxJobMonitor {
  private readonly activeMonitors = new Map<string, ActiveMonitor>();
  private readonly pollIntervalMs: number;
  private closed = false;

  constructor(private readonly options: FluxJobMonitorOptions) {
    this.pollIntervalMs =
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  watch(job: FluxJobRecord, options?: { sessionId?: string }): void {
    if (this.closed) {
      return;
    }

    const existingMonitor = this.activeMonitors.get(job.jobId);
    if (options?.sessionId) {
      existingMonitor?.sessionIds.add(options.sessionId);
    }

    if (
      existingMonitor ||
      job.status === "ready" ||
      job.status === "failed" ||
      !job.upstream.pollingUrl
    ) {
      return;
    }

    const sessionIds = new Set<string>();
    if (options?.sessionId) {
      sessionIds.add(options.sessionId);
    }

    const promise = this.monitorJob(job, sessionIds).finally(() => {
      this.activeMonitors.delete(job.jobId);
    });

    this.activeMonitors.set(job.jobId, {
      promise,
      sessionIds
    });
  }

  dropSession(sessionId: string): void {
    for (const monitor of this.activeMonitors.values()) {
      monitor.sessionIds.delete(sessionId);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled(
      Array.from(this.activeMonitors.values(), (monitor) => monitor.promise)
    );
  }

  private async monitorJob(
    initialJob: FluxJobRecord,
    sessionIds: Set<string>
  ): Promise<void> {
    let job = initialJob;

    while (!this.closed) {
      await delay(this.pollIntervalMs);

      try {
        job = await this.options.refreshJob(job);
      } catch (error) {
        this.options.logger.warn(
          { error, jobId: job.jobId },
          "Background FLUX job refresh failed."
        );
        continue;
      }

      if (job.status !== "ready" && job.status !== "failed") {
        continue;
      }

      await this.publishTerminalUpdate(job, sessionIds);
      return;
    }
  }

  private async publishTerminalUpdate(
    job: FluxJobRecord,
    sessionIds: Set<string>
  ): Promise<void> {
    if (!this.options.notifications || sessionIds.size === 0) {
      return;
    }

    await Promise.allSettled(
      Array.from(sessionIds, (sessionId) =>
        this.options.notifications!.publishJobUpdate({
          sessionId,
          job
        })
      )
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}