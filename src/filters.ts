import { z } from "zod";

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .describe("Date in YYYY-MM-DD format (inclusive).");

/** Base filter applied to nearly every tool: org + date range + project/model/user/status. */
export const BaseFilter = z.object({
  org: z
    .string()
    .min(1)
    .optional()
    .describe("Organization (tenant) ID. Omit to use the default org from $BEACON_ORG."),
  from: DateString.optional().describe("Start date inclusive (YYYY-MM-DD)."),
  to: DateString.optional().describe("End date inclusive (YYYY-MM-DD)."),
  project: z
    .string()
    .min(1)
    .optional()
    .describe("Project name to filter by (exact match). Use 'all' to disable."),
  model: z
    .string()
    .min(1)
    .optional()
    .describe("Model name to filter by (substring match). Use 'all' to disable."),
  user: z
    .string()
    .min(1)
    .optional()
    .describe("User name or id to filter by (substring match). Accepts source_user_name or source_user_id."),
  status: z
    .enum(["errors_only", "success_only"])
    .optional()
    .describe("Restrict to error or success events only."),
});

export type BaseFilterInput = z.infer<typeof BaseFilter>;

/** Filter extended with pagination for raw event queries. */
export const EventFilter = BaseFilter.extend({
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Max rows to return (1-500). Ignored when `all` is true."),
  all: z
    .boolean()
    .default(false)
    .describe("If true, return every matching row without a limit. Use carefully — may return large payloads."),
});

export type EventFilterInput = z.infer<typeof EventFilter>;

/** Filter for session-detail lookup. */
export const SessionKey = z.object({
  org: BaseFilter.shape.org,
  user: z
    .string()
    .min(1)
    .describe("source_user_id of the session owner."),
  session_id: z
    .string()
    .min(1)
    .describe("Masked session id (from a previous summary/dashboard result)."),
  project: z
    .string()
    .min(1)
    .describe("Project key associated with the session (e.g. 'beacon'). Use '-' if unknown."),
});

export type SessionKeyInput = z.infer<typeof SessionKey>;

/** Convert a BaseFilter into the query parameters beacon expects. */
export function baseFilterToQuery(f: BaseFilterInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.project) out.project = f.project;
  if (f.model) out.model = f.model;
  if (f.user) out.user = f.user;
  if (f.status) out.status = f.status;
  return out;
}
