import process from "node:process";

import pino from "pino";

export function createLogger() {
  return pino(
    {
      name: "librechat-flux-mcp",
      level: process.env.LOG_LEVEL ?? "info"
    },
    pino.destination(2)
  );
}

export type FluxLogger = ReturnType<typeof createLogger>;