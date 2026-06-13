#!/usr/bin/env node
/**
 * beacon-mcp entry point.
 *
 *   beacon-mcp                     # stdio transport (default; for Claude Desktop / Cursor / Cline)
 *   beacon-mcp --http              # HTTP+SSE transport on $MCP_HTTP_HOST:$MCP_HTTP_PORT
 *   beacon-mcp --http --port 9000  # custom port
 *
 * All beacon connectivity is configured via environment variables
 * (BEACON_BASE_URL, BEACON_ORG, BEACON_TIMEOUT_MS, BEACON_API_KEY).
 */
import { BeaconClient } from "./client.js";
import { buildServer } from "./server.js";
import { loadConfig, parseCli, printUsage } from "./config.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "node:http";

async function main(): Promise<void> {
  // parseCli handles --help, so argv is mutated only for known flags.
  const cli = parseCli(process.argv.slice(2));
  const cfg = loadConfig();

  const client = new BeaconClient({
    baseUrl: cfg.BEACON_BASE_URL,
    defaultOrg: cfg.BEACON_ORG,
    timeoutMs: cfg.BEACON_TIMEOUT_MS,
    apiKey: cfg.BEACON_API_KEY,
  });

  const server = buildServer(client);

  if (cli.http) {
    await runHttp(server, {
      host: cli.host ?? cfg.MCP_HTTP_HOST,
      port: cli.port ?? cfg.MCP_HTTP_PORT,
    });
  } else {
    await runStdio(server);
  }
}

async function runStdio(server: ReturnType<typeof buildServer>): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log a tiny startup hint to stderr so it doesn't pollute the stdio JSON channel.
  process.stderr.write("[beacon-mcp] stdio transport ready\n");
}

async function runHttp(
  server: ReturnType<typeof buildServer>,
  opts: { host: string; port: number },
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    // CORS preflight for browser-based agents.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`[beacon-mcp] http handler error: ${(err as Error).message}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(opts.port, opts.host, () => resolve()),
  );
  process.stderr.write(
    `[beacon-mcp] HTTP transport listening on http://${opts.host}:${opts.port}\n` +
      `[beacon-mcp] MCP endpoint: POST/GET/DELETE http://${opts.host}:${opts.port}/mcp\n`,
  );

  const shutdown = (): void => {
    process.stderr.write("[beacon-mcp] shutting down…\n");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[beacon-mcp] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
