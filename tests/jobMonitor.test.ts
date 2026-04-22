import { describe, expect, it, vi } from "vitest";

import {
  FluxJobMonitor,
  type FluxJobNotificationPublisher
} from "../src/monitor/jobMonitor.js";
import type { FluxJobRecord } from "../src/types.js";
import type { FluxLogger } from "../src/util/logging.js";

describe("FluxJobMonitor", () => {
  it("publishes a terminal job update for watched sessions", async () => {
    let resolvePublished: (() => void) | undefined;
    const published = new Promise<void>((resolve) => {
      resolvePublished = resolve;
    });

    const notifications: FluxJobNotificationPublisher = {
      publishJobUpdate: vi.fn().mockImplementation(async () => {
        resolvePublished?.();
      })
    };

    const refreshJob = vi.fn(async (job: FluxJobRecord) => ({
      ...job,
      status: "ready" as const,
      resultImageId: "img_000001",
      upstream: {
        ...job.upstream,
        status: "ready",
        lastResponse: { status: "ready" }
      }
    }));

    const monitor = new FluxJobMonitor({
      logger: createLoggerStub(),
      pollIntervalMs: 1,
      refreshJob,
      notifications
    });

    monitor.watch(createJobRecord(), { sessionId: "session-1" });

    await published;

    expect(refreshJob).toHaveBeenCalledTimes(1);
    expect(notifications.publishJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        job: expect.objectContaining({
          jobId: "job_000001",
          status: "ready",
          resultImageId: "img_000001"
        })
      })
    );

    await monitor.close();
  });
});

function createLoggerStub(): FluxLogger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: "info"
  } as unknown as FluxLogger;
}

function createJobRecord(): FluxJobRecord {
  return {
    jobId: "job_000001",
    toolName: "flux_submit_generate",
    status: "submitted",
    model: "FLUX.2-pro",
    provider: {
      kind: "azure-bfl",
      releaseChannel: "stable"
    },
    request: {
      model: "FLUX.2-pro",
      prompt: "A lighthouse at dusk"
    },
    parentImageIds: [],
    upstream: {
      pollingUrl: "https://example.com/jobs/job_000001",
      status: "submitted",
      submittedResponse: { status: "submitted" },
      lastResponse: { status: "submitted" }
    },
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z"
  };
}