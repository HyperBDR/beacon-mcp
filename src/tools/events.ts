import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "../client.js";
import { EventFilter, baseFilterToQuery } from "../filters.js";
import { resultBlocks, fmtInt, renderTable, type Column } from "../formatting.js";

interface Row {
  [k: string]: unknown;
}

export function registerEventsTools(server: McpServer, client: BeaconClient): void {
  server.tool(
    "query_events",
    "Raw event query with date range, project/model/status/user filters and pagination. " +
      "Use for inspecting individual events (errors, specific users, model behaviour, prompt previews). " +
      "By default returns up to 100 rows; pass `all: true` to disable the limit (use sparingly).",
    EventFilter.shape,
    async (args) => {
      const { limit, all, ...rest } = args;
      const query = {
        ...baseFilterToQuery(rest),
        ...(all ? { all: "true" } : { limit: String(limit) }),
      };
      const res = await client.events(query, rest.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "@timestamp", get: (r) => String(r["@timestamp"] ?? "-") },
        { header: "Project", get: (r) => String(r.project_name ?? "-") },
        { header: "User", get: (r) => String(r.source_user_name ?? r.source_user_id ?? "-") },
        { header: "Tool", get: (r) => String(r.tool ?? "-") },
        { header: "Model", get: (r) => String(r.model ?? "-") },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Latency (ms)", get: (r) => fmtInt(r.latency_ms as number), align: "right" },
        { header: "Err", get: (r) => (r.has_error ? "❌" : ""), align: "right" },
        { header: "Prompt preview", get: (r) => {
          const s = r.user_prompt_preview;
          if (typeof s !== "string") return "-";
          return s.length > 80 ? s.slice(0, 77) + "…" : s;
        } },
      ];
      const summary = all
        ? `Returned **${rows.length}** events (no limit).`
        : `Returned **${rows.length}** events (limit=${limit}). ` +
          (rows.length === limit ? "Hit the limit — increase `limit` or set `all: true` to see more." : "");
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 30)}`, res) };
    },
  );
}
