import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "../client.js";
import { resultBlocks } from "../formatting.js";

const ListOrgsInput = z.object({});

const HealthInput = z.object({
  org: z
    .string()
    .min(1)
    .optional()
    .describe("Organization to check. Omit to use the default org."),
});

const GetConfigInput = z.object({
  org: z.string().min(1).optional().describe("Organization to read config for."),
});

export function registerOrgsTools(server: McpServer, client: BeaconClient): void {
  server.tool(
    "list_organizations",
    "List all beacon organizations (tenants) available via the configured beacon API. " +
      "Call this first if you don't know which org to query.",
    ListOrgsInput.shape,
    async () => {
      const res = await client.listOrgs();
      const orgs = res.data ?? [];
      const summary = orgs.length === 0
        ? "No organizations registered."
        : `Found ${orgs.length} organization(s):\n\n` +
          orgs.map((o) => `- **${o.id}**${o.name ? ` (${o.name})` : ""}${o.description ? ` — ${o.description}` : ""}`).join("\n");
      return { content: resultBlocks(summary, res) };
    },
  );

  server.tool(
    "health_check",
    "Check whether the beacon API is reachable and the (optional) org is healthy.",
    HealthInput.shape,
    async (args) => {
      const res = await client.health(args.org);
      const status = (res.data as { status?: string })?.status ?? "unknown";
      const summary = `beacon is **${status}** (org=${args.org ?? "default"}).`;
      return { content: resultBlocks(summary, res) };
    },
  );

  server.tool(
    "get_config",
    "Read the public beacon configuration for an org (min session event count, model pricing).",
    GetConfigInput.shape,
    async (args) => {
      const res = await client.config(args.org);
      const cfg = (res.data ?? {}) as Record<string, unknown>;
      const dash = (cfg.dashboard ?? {}) as Record<string, unknown>;
      const minSession = dash.min_session_event_count ?? "n/a";
      const summary = `Dashboard config: min_session_event_count=${minSession}.`;
      return { content: resultBlocks(summary, res) };
    },
  );

  // Static resources — LLM can read beacon://orgs to discover tenants and
  // beacon://config for the default org's dashboard configuration. For per-org
  // config, agents should call the `get_config` tool with the `org` argument.
  server.resource(
    "orgs",
    "beacon://orgs",
    async (uri) => {
      const res = await client.listOrgs();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(res.data ?? [], null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "config",
    "beacon://config",
    async (uri) => {
      const res = await client.config();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(res.data ?? {}, null, 2),
          },
        ],
      };
    },
  );
}
