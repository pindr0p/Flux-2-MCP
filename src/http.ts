#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import process from "node:process";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.js";
import {
  createRedisResumableStreamSupport,
  type ResumableStreamSupport
} from "./http/redisEventStore.js";
import { SessionRegistry } from "./http/sessionRegistry.js";
import type { FluxJobNotificationPublisher } from "./monitor/jobMonitor.js";
import { createFluxToolServices } from "./services.js";
import { createConfiguredServer } from "./server.js";
import { createLogger } from "./util/logging.js";

interface HttpSession {
  server: Awaited<ReturnType<typeof createConfiguredServer>>;
  transport: StreamableHTTPServerTransport;
}

const sessions = new SessionRegistry<HttpSession>();

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const resumableStreams = await createRedisResumableStreamSupport(
    config.http.resumableStreams,
    logger
  );
  const services = await createFluxToolServices(config, logger, {
    jobNotifications: createHttpJobNotificationPublisher(logger)
  });
  const sessionReaper = startSessionReaper(config, logger, services);

  const httpServer = createServer((req, res) => {
    void handleHttpRequest(req, res, {
      config,
      logger,
      services,
      resumableStreams
    }).catch(
      (error) => {
        logger.error({ error }, "Failed to handle MCP HTTP request.");
        writeJsonRpcError(res, 500, -32603, "Internal server error");
      }
    );
  });

  httpServer.listen(config.http.port, config.http.host, () => {
    logger.info(
      {
        host: config.http.host,
        port: config.http.port,
        path: config.http.mcpPath,
        model: config.flux.model
      },
      "FLUX MCP server listening on Streamable HTTP."
    );
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    httpServer.close();
    clearInterval(sessionReaper);
    await Promise.all(
      sessions.entries().map(([sessionId, session]) =>
        closeSession(sessionId, session, logger, services.jobMonitor)
      )
    );
    await resumableStreams?.close();
    await services.jobMonitor.close();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: {
    config: ReturnType<typeof loadConfig>;
    logger: ReturnType<typeof createLogger>;
    services: Awaited<ReturnType<typeof createFluxToolServices>>;
    resumableStreams?: ResumableStreamSupport;
  }
): Promise<void> {
  const { config, logger, services, resumableStreams } = context;
  const requestPath = new URL(req.url ?? "/", "http://localhost").pathname;

  if (requestPath === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (requestPath !== config.http.mcpPath) {
    res.writeHead(404).end();
    return;
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const sessionId = readSessionId(req);

    if (sessionId) {
      const session = sessions.touch(sessionId);
      if (!session) {
        writeJsonRpcError(
          res,
          404,
          -32000,
          `Session ${sessionId} was not found.`
        );
        return;
      }

      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      writeJsonRpcError(
        res,
        400,
        -32000,
        "Bad Request: No valid session ID provided."
      );
      return;
    }

    let initializedSession: HttpSession | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (createdSessionId) => {
        if (!initializedSession) {
          return;
        }

        sessions.set(createdSessionId, initializedSession);
      },
      onsessionclosed: (closedSessionId) => {
        const existingSession = sessions.delete(closedSessionId);
        if (!existingSession) {
          return;
        }

        void closeSession(
          closedSessionId,
          existingSession,
          logger,
          services.jobMonitor,
          { closeTransport: false, deleteSession: false }
        );
      },
      eventStore: resumableStreams?.eventStore,
      retryInterval: resumableStreams?.retryIntervalMs
    });
    const server = createConfiguredServer(config, services);
    initializedSession = { server, transport };

    transport.onerror = (error) => {
      logger.error({ error }, "Streamable HTTP transport error.");
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  if (req.method === "GET") {
    const sessionId = readSessionId(req);
    if (!sessionId) {
      writeJsonRpcError(
        res,
        400,
        -32000,
        "Bad Request: Missing MCP session ID header."
      );
      return;
    }

    const session = sessions.touch(sessionId);
    if (!session) {
      writeJsonRpcError(
        res,
        404,
        -32000,
        `Session ${sessionId} was not found.`
      );
      return;
    }

    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    const sessionId = readSessionId(req);
    if (!sessionId) {
      res.writeHead(400).end();
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404).end();
      return;
    }

    await session.transport.handleRequest(req, res);
    return;
  }

  res.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
}

async function closeSession(
  sessionId: string,
  session: HttpSession,
  logger: ReturnType<typeof createLogger>,
  jobMonitor: Awaited<ReturnType<typeof createFluxToolServices>>["jobMonitor"],
  options: {
    closeTransport?: boolean;
    deleteSession?: boolean;
  } = {}
): Promise<void> {
  if (options.deleteSession !== false) {
    sessions.delete(sessionId);
  }
  jobMonitor.dropSession(sessionId);

  const closeOperations: Array<Promise<unknown>> = [session.server.close()];
  if (options.closeTransport !== false) {
    closeOperations.push(session.transport.close());
  }

  await Promise.allSettled(closeOperations);
  logger.debug({ sessionId }, "Closed MCP HTTP session.");
}

function createHttpJobNotificationPublisher(
  logger: ReturnType<typeof createLogger>
): FluxJobNotificationPublisher {
  return {
    async publishJobUpdate({ job, sessionId }) {
      const session = sessions.touch(sessionId);
      if (!session) {
        return;
      }

      const level = job.status === "failed" ? "error" : "info";
      const data =
        job.status === "ready"
          ? `FLUX job ${job.jobId} completed with image_id=${job.resultImageId ?? "unknown"}.`
          : `FLUX job ${job.jobId} failed${job.errorCode ? ` error_code=${job.errorCode}` : ""}${job.errorMessage ? ` message=${job.errorMessage}` : ""}.`;

      try {
        await session.server.sendLoggingMessage({ level, data });
      } catch (error) {
        logger.warn(
          { error, jobId: job.jobId, sessionId },
          "Failed to publish FLUX job notification."
        );
      }
    }
  };
}

function startSessionReaper(
  config: ReturnType<typeof loadConfig>,
  logger: ReturnType<typeof createLogger>,
  services: Awaited<ReturnType<typeof createFluxToolServices>>
): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    const expiredSessions = sessions.reapIdle(config.http.sessionIdleTimeoutMs);
    for (const [sessionId, session] of expiredSessions) {
      logger.info(
        {
          sessionId,
          idleTimeoutMs: config.http.sessionIdleTimeoutMs
        },
        "Closing idle MCP HTTP session."
      );

      void closeSession(sessionId, session, logger, services.jobMonitor, {
        deleteSession: false
      });
    }
  }, config.http.sessionSweepIntervalMs);

  timer.unref();
  return timer;
}

function readSessionId(req: IncomingMessage): string | undefined {
  const headerValue = req.headers["mcp-session-id"];

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return headerValue;
}

const MAX_JSON_BODY_BYTES = 1024 * 1024;

class JsonBodyReadError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: number
  ) {
    super(message);
    this.name = "JsonBodyReadError";
  }
}

function readContentLength(req: IncomingMessage): number | undefined {
  const headerValue = req.headers["content-length"];
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (rawValue === undefined) {
    return undefined;
  }

  const contentLength = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new JsonBodyReadError(
      "Invalid Content-Length header.",
      400,
      -32600
    );
  }

  return contentLength;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declaredContentLength = readContentLength(req);
  if (
    declaredContentLength !== undefined &&
    declaredContentLength > MAX_JSON_BODY_BYTES
  ) {
    throw new JsonBodyReadError("Request body too large.", 413, -32600);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new JsonBodyReadError("Request body too large.", 413, -32600);
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks, totalBytes).toString("utf8").trim();
  if (!rawBody) {
    throw new Error("Expected a JSON request body.");
  }

  return JSON.parse(rawBody) as unknown;
}

function writeJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string
): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code,
        message
      },
      id: null
    })
  );
}

main().catch((error) => {
  console.error("Fatal error starting FLUX MCP HTTP server:", error);
  process.exit(1);
});