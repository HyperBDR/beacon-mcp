/**
 * Output formatting helpers. Every tool returns a JSON payload plus a short
 * human-readable summary so LLMs get both machine-precise data and a quick read.
 */

export interface ToolResult {
  data: unknown;
  meta?: { from?: string; to?: string; total?: number; [k: string]: unknown };
}

/** Build a JSON text content block for the MCP `content` array. */
export function jsonBlock(value: unknown): { type: "text"; text: string } {
  return { type: "text", text: JSON.stringify(value, null, 2) };
}

/** Build a plain text content block. */
export function textBlock(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

/**
 * Standard "result envelope" for tools: a `## Summary` markdown header plus
 * the raw JSON in a fenced block. LLM-friendly, easy to skim, easy to parse.
 */
export function resultBlocks(summary: string, payload: unknown): Array<{ type: "text"; text: string }> {
  return [
    textBlock(`## Summary\n\n${summary.trim()}\n\n## Data (JSON)\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``),
  ];
}

/* ---------- small number helpers ---------- */

export function fmtInt(n: number | bigint | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("en-US");
}

export function fmtFloat(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0%";
  return `${Number(n).toFixed(digits)}%`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtCNY(n: number | null | undefined): string {
  if (n === null || n === undefined) return "¥0";
  return `¥${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/* ---------- table rendering (used by summary tools) ---------- */

export interface Column<T> {
  header: string;
  /** Extract a cell value. Return null/undefined to render "-". */
  get: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
}

export function renderTable<T>(rows: T[], cols: Column<T>[], maxRows = 20): string {
  if (rows.length === 0) return "_(no rows)_";
  const head = cols.map((c) => c.header).join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const lines: string[] = [`| ${head} |`, `| ${sep} |`];
  for (const r of rows.slice(0, maxRows)) {
    const cells = cols.map((c) => {
      const v = c.get(r);
      if (v === null || v === undefined) return "-";
      return String(v);
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }
  if (rows.length > maxRows) {
    lines.push(`\n_… ${rows.length - maxRows} more rows truncated_`);
  }
  return lines.join("\n");
}
