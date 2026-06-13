import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "../client.js";
import { BaseFilter, baseFilterToQuery } from "../filters.js";
import { resultBlocks, jsonBlock, textBlock, fmtInt, fmtFloat, fmtPct, fmtCNY, fmtMs, renderTable, type Column } from "../formatting.js";

const DashboardInput = BaseFilter.extend({
  section: z
    .enum(["metrics", "activity", "traffic", "distributions", "sessions", "projects"])
    .optional()
    .describe("Optional sub-module. Omit to fetch the full payload."),
});

export function registerDashboardTools(server: McpServer, client: BeaconClient): void {
  server.tool(
    "get_dashboard",
    "Fetch the beacon dashboard payload (or a single sub-section) for the given date range. " +
      "Returns metrics, activity, traffic, prompt/distribution breakdowns, and the top projects/sessions.",
    DashboardInput.shape,
    async (args) => {
      const { section, ...rest } = args;
      const res = await client.dashboard(section, baseFilterToQuery(rest), rest.org);
      const summary = summarizeDashboard(res.data, section);
      return { content: resultBlocks(summary, res) };
    },
  );

  // Resource: full dashboard for default-org quick access
  server.resource(
    "dashboard",
    "beacon://dashboard",
    async (uri) => {
      const res = await client.dashboard(undefined, {});
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

/* ---------- summary formatters ---------- */

interface DashboardPayload {
  metrics?: {
    event_count?: number;
    request_count?: number;
    session_count?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    tool_calls_count?: number;
    error_count?: number;
    project_count?: number;
    success_rate?: number;
    avg_latency_sec?: number;
    cost_cny?: number;
    top_project?: string;
    main_languages?: string[];
    top_user_by_tokens?: string;
    top_user_tokens?: number;
  };
  activity?: { days?: unknown[]; active_days?: number; total?: number };
  traffic?: { peak_hour?: number; peak_count?: number };
  distributions?: {
    task_types?: Array<{ name: string; value: number }>;
    prompt_styles?: Array<{ name: string; value: number }>;
    languages?: Array<{ name: string; value: number }>;
    tools?: Array<{ name: string; value: number }>;
  };
  projects?: Array<{ project_name?: string; total_tokens?: number; event_count?: number; request_count?: number; share?: number }>;
  sessions?: Array<{ session_id_masked?: string; source_user_name?: string; total_tokens?: number; event_count?: number; model_count?: number }>;
}

function summarizeDashboard(data: unknown, section: string | undefined): string {
  if (!data || typeof data !== "object") return "Empty dashboard payload.";
  const d = data as DashboardPayload;
  if (section) {
    const sec = (d as Record<string, unknown>)[section];
    return `Fetched dashboard section \`${section}\`.\n\n\`\`\`json\n${JSON.stringify(sec, null, 2)}\n\`\`\``;
  }
  const m = d.metrics ?? {};
  const a = d.activity ?? {};
  const t = d.traffic ?? {};
  const lines: string[] = [];
  lines.push(`### Overview`);
  lines.push(`- Events: **${fmtInt(m.event_count)}** (requests: ${fmtInt(m.request_count)}, sessions: ${fmtInt(m.session_count)})`);
  lines.push(`- Tokens: **${fmtInt(m.total_tokens)}** (prompt ${fmtInt(m.prompt_tokens)} + completion ${fmtInt(m.completion_tokens)})`);
  lines.push(`- Tool calls: ${fmtInt(m.tool_calls_count)} · Errors: ${fmtInt(m.error_count)} · Success rate: ${fmtPct(m.success_rate)}`);
  lines.push(`- Avg latency: ${fmtMs((m.avg_latency_sec ?? 0) * 1000)} · Estimated cost: ${fmtCNY(m.cost_cny)}`);
  lines.push(`- Projects: ${fmtInt(m.project_count)} · Top project: \`${m.top_project ?? "-"}\``);
  if (m.main_languages && m.main_languages.length) {
    lines.push(`- Main languages: ${m.main_languages.join(", ")}`);
  }
  if (m.top_user_by_tokens) {
    lines.push(`- Top user: ${m.top_user_by_tokens} (${fmtInt(m.top_user_tokens)} tokens)`);
  }
  lines.push("");
  lines.push(`### Activity`);
  lines.push(`- Active days: **${fmtInt(a.active_days)}** / Total days in range: ${fmtInt(a.total)}`);
  lines.push("");
  lines.push(`### Traffic`);
  lines.push(`- Peak hour: **${fmtInt(t.peak_hour)}:00** with ${fmtInt(t.peak_count)} events`);
  if (d.projects && d.projects.length) {
    lines.push("");
    lines.push(`### Top projects`);
    const cols: Column<NonNullable<DashboardPayload["projects"]>[number]>[] = [
      { header: "Project", get: (r) => r.project_name ?? "-" },
      { header: "Tokens", get: (r) => fmtInt(r.total_tokens), align: "right" },
      { header: "Events", get: (r) => fmtInt(r.event_count), align: "right" },
      { header: "Requests", get: (r) => fmtInt(r.request_count), align: "right" },
      { header: "Share", get: (r) => fmtPct(r.share), align: "right" },
    ];
    lines.push(renderTable(d.projects, cols, 10));
  }
  if (d.sessions && d.sessions.length) {
    lines.push("");
    lines.push(`### Top sessions`);
    const cols: Column<NonNullable<DashboardPayload["sessions"]>[number]>[] = [
      { header: "User", get: (r) => r.source_user_name ?? "-" },
      { header: "Session", get: (r) => r.session_id_masked ?? "-" },
      { header: "Models", get: (r) => fmtInt(r.model_count), align: "right" },
      { header: "Events", get: (r) => fmtInt(r.event_count), align: "right" },
      { header: "Tokens", get: (r) => fmtInt(r.total_tokens), align: "right" },
    ];
    lines.push(renderTable(d.sessions, cols, 10));
  }
  return lines.join("\n");
}
