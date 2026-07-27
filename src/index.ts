#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ObsidianClient } from "./obsidianClient.js";
import { registerTools } from "./tools/index.js";

const VERSION = "1.0.1";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Fail fast with a clear message on stderr (never print the API key).
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const client = new ObsidianClient(config);
  const server = new McpServer({
    name: "vaultwire",
    version: VERSION,
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(
    err instanceof Error ? err.message : `vaultwire failed to start: ${String(err)}`,
  );
  process.exit(1);
});
