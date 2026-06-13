import { z } from "zod";

/**
 * Validate a proxy URL. Accepts http://, https://, socks://, socks5://.
 * Empty/undefined is OK (no proxy = direct connection).
 */
const ProxyUrl = z
  .string()
  .optional()
  .refine(
    (v) => !v || /^(https?|socks5?):\/\/.+/.test(v),
    { message: "must be empty or an http(s):// / socks5:// URL" },
  );

const EnvSchema = z.object({
  BEACON_BASE_URL: z.string().url().default("http://127.0.0.1:8080"),
  BEACON_ORG: z.string().min(1).default("default"),
  BEACON_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  BEACON_API_KEY: z.string().optional(),
  /** Optional HTTP proxy used when talking to BEACON_BASE_URL. */
  BEACON_PROXY: ProxyUrl,
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(8765),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export interface CliOptions {
  http: boolean;
  host?: string;
  port?: number;
}

/**
 * Parse argv into CLI options. Recognised flags:
 *   --http                Run HTTP+SSE transport instead of stdio.
 *   --host <addr>         Override MCP_HTTP_HOST.
 *   --port <number>       Override MCP_HTTP_PORT.
 *   --help / -h           Print usage and exit.
 */
export function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = { http: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--http") {
      opts.http = true;
    } else if (a === "--host") {
      opts.host = argv[++i];
    } else if (a === "--port") {
      opts.port = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return opts;
}

export function printUsage(): void {
  process.stdout.write(`beacon-mcp — MCP server for the beacon analytics platform

Usage:
  beacon-mcp [options]

Options:
  --http                Run HTTP+SSE transport (default: stdio)
  --host <addr>         HTTP host (default: 127.0.0.1 or $MCP_HTTP_HOST)
  --port <number>       HTTP port (default: 8765 or $MCP_HTTP_PORT)
  --help, -h            Show this help

Environment:
  BEACON_BASE_URL       Beacon REST base URL        (default: http://127.0.0.1:8080)
  BEACON_ORG            Default organization ID     (default: default)
  BEACON_TIMEOUT_MS     Request timeout in ms       (default: 30000)
  BEACON_API_KEY        Optional bearer token
  BEACON_PROXY          Optional proxy for beacon requests  (e.g. http://corp:8080)
  MCP_HTTP_HOST         HTTP host                   (default: 127.0.0.1)
  MCP_HTTP_PORT         HTTP port                   (default: 8765)
`);
}
