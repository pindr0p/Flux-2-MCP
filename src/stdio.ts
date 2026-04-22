#!/usr/bin/env node

import process from "node:process";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildServer } from "./server.js";

let activeServer: Awaited<ReturnType<typeof buildServer>>["server"] | undefined;

async function main(): Promise<void> {
  const built = await buildServer();
  activeServer = built.server;

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  built.logger.info(
    { model: built.config.flux.model },
    "FLUX MCP server listening on stdio."
  );
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  try {
    if (activeServer) {
      await activeServer.close();
    }
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch((error) => {
  console.error("Fatal error starting FLUX MCP server:", error);
  process.exit(1);
});