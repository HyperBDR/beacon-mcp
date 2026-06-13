import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "./client.js";
import { registerOrgsTools } from "./tools/orgs.js";
import { registerDashboardTools } from "./tools/dashboard.js";
import { registerSummaryTools } from "./tools/summary.js";
import { registerEventsTools } from "./tools/events.js";
import { registerSessionTools } from "./tools/session.js";

export interface BuildServerOptions {
  name?: string;
  version?: string;
}

export function buildServer(client: BeaconClient, opts: BuildServerOptions = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? "beacon-mcp",
    version: opts.version ?? "0.1.0",
  });

  registerOrgsTools(server, client);
  registerDashboardTools(server, client);
  registerSummaryTools(server, client);
  registerEventsTools(server, client);
  registerSessionTools(server, client);

  return server;
}
