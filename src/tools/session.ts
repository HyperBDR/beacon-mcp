import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "../client.js";
import { SessionKey } from "../filters.js";
import { resultBlocks, fmtInt, renderTable, type Column } from "../formatting.js";

interface EventRow {
  [k: string]: unknown;
}

export function registerSessionTools(server: McpServer, client: BeaconClient): void {
  server.tool(
    "get_session_events",
    "Fetch the full event chain for a single session (compact prompt previews, token usage, errors, model). " +
      "Use after query_session_summary to drill into the heaviest sessions.",
    SessionKey.shape,
    async (args) => {
      const { org, user, session_id, project } = args;
      const res = await client.sessionEvents(user, session_id, project, org);
      const data = (res.data ?? {}) as { events?: EventRow[]; session?: { event_count?: number; total_tokens?: number } };
      const events = data.events ?? [];
      const cols: Column<EventRow>[] = [
        { header: "@timestamp", get: (r) => String(r["@timestamp"] ?? r.ts ?? "-") },
        { header: "Model", get: (r) => String(r.model ?? "-") },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Prompt", get: (r) => fmtInt(r.prompt_tokens as number), align: "right" },
        { header: "Compl.", get: (r) => fmtInt(r.completion_tokens as number), align: "right" },
        { header: "Latency (ms)", get: (r) => fmtInt(r.latency_ms as number), align: "right" },
        { header: "Tools", get: (r) => fmtInt(r.tool_calls_count as number), align: "right" },
        { header: "Err", get: (r) => (r.has_error ? "❌" : ""), align: "right" },
        { header: "Prompt preview", get: (r) => {
          const s = r.user_prompt_preview;
          if (typeof s !== "string") return "-";
          return s.length > 80 ? s.slice(0, 77) + "…" : s;
        } },
      ];
      const sess = data.session;
      const header = sess
        ? `Session: events=${fmtInt(sess.event_count)} total_tokens=${fmtInt(sess.total_tokens)}`
        : "Session detail";
      const summary = events.length === 0
        ? `${header}\n\nNo events found for this session.`
        : `${header}\n\nReturned **${events.length}** events.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(events, cols, 40)}`, res) };
    },
  );
}
