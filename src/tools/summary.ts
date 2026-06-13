import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BeaconClient } from "../client.js";
import { BaseFilter, baseFilterToQuery } from "../filters.js";
import { resultBlocks, fmtInt, renderTable, type Column } from "../formatting.js";

type SummaryKind = "project" | "language" | "prompt-style" | "employee-hourly" | "session";

const SummaryInput = BaseFilter;

interface Row {
  [k: string]: unknown;
}

export function registerSummaryTools(server: McpServer, client: BeaconClient): void {
  server.tool(
    "query_project_summary",
    "Daily rollup per project: event/request counts and token usage. " +
      "Use for 'which project uses the most tokens this week' questions.",
    SummaryInput.shape,
    async (args) => {
      const res = await client.summary("project", baseFilterToQuery(args), args.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "Date", get: (r) => String(r.dt ?? "-") },
        { header: "Project", get: (r) => String(r.project_name ?? "-") },
        { header: "Events", get: (r) => fmtInt(r.event_count as number), align: "right" },
        { header: "Requests", get: (r) => fmtInt(r.request_count as number), align: "right" },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Prompt", get: (r) => fmtInt(r.prompt_tokens as number), align: "right" },
        { header: "Completion", get: (r) => fmtInt(r.completion_tokens as number), align: "right" },
        { header: "Errors", get: (r) => fmtInt(r.error_count as number), align: "right" },
        { header: "Latency (ms)", get: (r) => fmtInt(r.latency_ms as number), align: "right" },
      ];
      const summary = rows.length === 0
        ? "No project summary data in this range."
        : `Returned **${rows.length}** project-day rows.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 25)}`, res) };
    },
  );

  server.tool(
    "query_language_summary",
    "Daily rollup per programming language (from session language detection). " +
      "Use to identify which languages AI assistants are most often working in.",
    SummaryInput.shape,
    async (args) => {
      const res = await client.summary("language", baseFilterToQuery(args), args.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "Date", get: (r) => String(r.dt ?? "-") },
        { header: "Language", get: (r) => String(r.language_primary ?? "-") },
        { header: "Events", get: (r) => fmtInt(r.event_count as number), align: "right" },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Avg conf.", get: (r) => {
          const v = r.avg_language_confidence as number | null | undefined;
          return v === null || v === undefined ? "-" : v.toFixed(2);
        }, align: "right" },
        { header: "Users", get: (r) => fmtInt(r.source_user_count as number), align: "right" },
      ];
      const summary = rows.length === 0
        ? "No language summary data in this range."
        : `Returned **${rows.length}** language-day rows.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 25)}`, res) };
    },
  );

  server.tool(
    "query_prompt_style_summary",
    "Daily rollup per prompt style (rule-classified). Useful for understanding how users phrase their requests.",
    SummaryInput.shape,
    async (args) => {
      const res = await client.summary("prompt-style", baseFilterToQuery(args), args.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "Date", get: (r) => String(r.dt ?? "-") },
        { header: "Style", get: (r) => String(r.prompt_style_rule ?? "-") },
        { header: "Events", get: (r) => fmtInt(r.event_count as number), align: "right" },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Avg chars", get: (r) => {
          const v = r.avg_prompt_chars as number | null | undefined;
          return v === null || v === undefined ? "-" : Math.round(v).toString();
        }, align: "right" },
        { header: "Avg msgs", get: (r) => {
          const v = r.avg_messages_count as number | null | undefined;
          return v === null || v === undefined ? "-" : v.toFixed(1);
        }, align: "right" },
        { header: "Code blocks", get: (r) => fmtInt(r.code_block_count as number), align: "right" },
        { header: "File paths", get: (r) => fmtInt(r.file_path_count as number), align: "right" },
      ];
      const summary = rows.length === 0
        ? "No prompt-style summary data in this range."
        : `Returned **${rows.length}** prompt-style-day rows.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 25)}`, res) };
    },
  );

  server.tool(
    "query_employee_hourly_summary",
    "Per-user, per-hour usage broken down by tool and model. " +
      "Use to find power users, peak hours, and per-model consumption.",
    SummaryInput.shape,
    async (args) => {
      const res = await client.summary("employee-hourly", baseFilterToQuery(args), args.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "Date", get: (r) => String(r.dt ?? "-") },
        { header: "Hour", get: (r) => String(r.hour_start ?? "-") },
        { header: "User", get: (r) => String(r.source_user_name ?? r.source_user_id ?? "-") },
        { header: "Tool", get: (r) => String(r.tool ?? "-") },
        { header: "Model", get: (r) => String(r.model ?? "-") },
        { header: "Ops", get: (r) => fmtInt(r.operation_count as number), align: "right" },
        { header: "Requests", get: (r) => fmtInt(r.request_count as number), align: "right" },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "Errors", get: (r) => fmtInt(r.error_count as number), align: "right" },
      ];
      const summary = rows.length === 0
        ? "No employee-hourly data in this range."
        : `Returned **${rows.length}** employee-hour rows.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 25)}`, res) };
    },
  );

  server.tool(
    "query_session_summary",
    "Per-session rollup: which sessions used the most tokens, their models, timestamps, etc. " +
      "Use to find the heaviest sessions before drilling in with get_session_events.",
    SummaryInput.shape,
    async (args) => {
      const res = await client.summary("session", baseFilterToQuery(args), args.org);
      const rows = (res.data ?? []) as Row[];
      const cols: Column<Row>[] = [
        { header: "First day", get: (r) => String(r.first_dt ?? "-") },
        { header: "User", get: (r) => String(r.source_user_name ?? r.source_user_id ?? "-") },
        { header: "Project", get: (r) => String(r.project_name ?? "-") },
        { header: "Session", get: (r) => String(r.session_id_masked ?? "-") },
        { header: "Events", get: (r) => fmtInt(r.event_count as number), align: "right" },
        { header: "Models", get: (r) => fmtInt(r.model_count as number), align: "right" },
        { header: "Tokens", get: (r) => fmtInt(r.total_tokens as number), align: "right" },
        { header: "First seen", get: (r) => String(r.first_seen ?? "-") },
        { header: "Last seen", get: (r) => String(r.last_seen ?? "-") },
      ];
      const summary = rows.length === 0
        ? "No session summary data in this range."
        : `Returned **${rows.length}** sessions.`;
      return { content: resultBlocks(`${summary}\n\n${renderTable(rows, cols, 25)}`, res) };
    },
  );
}
