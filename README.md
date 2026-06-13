# beacon-mcp

MCP server for the [beacon](https://github.com/HyperBDR/beacon) log analytics platform.

Exposes beacon's REST API as [Model Context Protocol](https://modelcontextprotocol.io) tools and resources, so any MCP-compatible AI agent (Claude Desktop, Cursor, Cline, Continue, VS Code) can query and analyse AI-assistant usage data through a typed, validated interface.

The MCP server is a thin client over beacon's existing `/api/v1` endpoints — it does **not** duplicate SQL, Parquet, or storage logic. The beacon Go backend is not modified.

---

## Features

- **11 tools** covering organisation discovery, health checks, configuration, full dashboard, dashboard sub-sections, 5 summary dimensions, raw event query, and per-session event chain.
- **3 resources** (`beacon://orgs`, `beacon://config`, `beacon://dashboard`) for context that should be cached client-side.
- **Two transports**: stdio (default) for Claude Desktop / Cursor / Cline, HTTP+SSE (`--http`) for remote agents.
- **Strict types & validation** via [Zod](https://zod.dev/) — every argument is checked at the protocol boundary.
- **Unified filter arguments**: `org`, `from`, `to`, `project`, `model`, `user`, `status`.
- **Smart summaries**: each tool returns a Markdown summary **plus** the raw JSON payload, so LLMs can both skim and re-parse.
- **Zero beacon changes**: works against the public `/api/v1` API; auth via `BEACON_API_KEY` if you front beacon with a reverse proxy.

---

## Quick start

### Option A — `npx` (recommended, no install)

Run directly with `npx` from a beacon checkout or any directory:

```bash
BEACON_BASE_URL=http://127.0.0.1:8080 \
BEACON_ORG=default \
npx -y @beacon/mcp-server
```

The `-y` flag auto-confirms the install prompt. The first invocation downloads the package (~22 kB) and starts the stdio transport immediately. Subsequent invocations are instant.

### Option B — `npm install` (long-lived install)

```bash
npm install -g @beacon/mcp-server
# or, locally inside a project:
npm install @beacon/mcp-server
```

Then run with the `beacon-mcp` binary:

```bash
BEACON_BASE_URL=http://127.0.0.1:8080 \
BEACON_ORG=default \
beacon-mcp
```

### Option C — from source (for development)

```bash
git clone https://github.com/HyperBDR/beacon-mcp.git
cd beacon-mcp
npm install
npm run dev                # stdio, with tsx — no build step
npm run dev:http           # HTTP+SSE on $MCP_HTTP_PORT (default 8765)
```

`npm install` is only required for development. End users never compile anything — the published package ships pre-built `dist/`.

---

## Running modes

| Command | What it does | When to use |
|---|---|---|
| `npx -y @beacon/mcp-server` | stdio transport (JSON-RPC over stdin/stdout) | Claude Desktop / Cursor / Cline / VS Code / Continue |
| `npx -y @beacon/mcp-server --http` | HTTP+SSE transport | Remote agents or browser-based MCP clients |
| `beacon-mcp --help` | Print CLI usage and exit | Sanity check |
| `npm run dev` (from source) | stdio via `tsx` (no build) | Developing the server itself |
| `npm run dev:http` (from source) | HTTP+SSE via `tsx` | Developing the server itself |
| `npm start` (from source, after `npm run build`) | Production stdio from compiled `dist/` | Verifying the published binary locally |

CLI flags:

```
--http                Run HTTP+SSE transport (default: stdio)
--host <addr>         HTTP host (default: 127.0.0.1 or $MCP_HTTP_HOST)
--port <number>       HTTP port (default: 8765 or $MCP_HTTP_PORT)
--help, -h            Show this help
```

---

## Configuration

All settings come from environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `BEACON_BASE_URL` | `http://127.0.0.1:8080` | Beacon REST API base URL |
| `BEACON_ORG` | `default` | Default organisation ID; tools can override per-call via the `org` argument |
| `BEACON_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds |
| `BEACON_API_KEY` | _(unset)_ | Optional bearer token (sent as `Authorization: Bearer …`) |
| `BEACON_PROXY` | _(unset)_ | Optional HTTP proxy for requests to `BEACON_BASE_URL`. Accepts `http://`, `https://`, `socks5://`. Useful for corporate egress proxies. Example: `http://proxy.corp.local:8080`. |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP transport host (only with `--http`) |
| `MCP_HTTP_PORT` | `8765` | HTTP transport port (only with `--http`) |

---

## Client configuration

Below are the most common client integrations. After editing the config, **fully restart the client** (Claude Desktop, Cursor) so it picks up the new MCP server.

### Claude Desktop

Config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

`npx` version (recommended, no global install):

```json
{
  "mcpServers": {
    "beacon": {
      "command": "npx",
      "args": ["-y", "@beacon/mcp-server"],
      "env": {
        "BEACON_BASE_URL": "http://127.0.0.1:8080",
        "BEACON_ORG": "default"
      }
    }
  }
}
```

Globally installed version:

```json
{
  "mcpServers": {
    "beacon": {
      "command": "beacon-mcp",
      "args": [],
      "env": {
        "BEACON_BASE_URL": "http://127.0.0.1:8080",
        "BEACON_ORG": "default"
      }
    }
  }
}
```

Development version (from a beacon-mcp source checkout, with `npm install` already run):

```json
{
  "mcpServers": {
    "beacon-dev": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/beacon-mcp/src/index.ts"],
      "env": {
        "BEACON_BASE_URL": "http://127.0.0.1:8080",
        "BEACON_ORG": "default"
      }
    }
  }
}
```

### Cursor

`Settings → MCP → Add new global MCP server`. Same JSON shape as Claude Desktop (the `mcpServers` map is the standard).

A typical `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "beacon": {
      "command": "npx",
      "args": ["-y", "@beacon/mcp-server"],
      "env": {
        "BEACON_BASE_URL": "http://127.0.0.1:8080",
        "BEACON_ORG": "default"
      }
    }
  }
}
```

### Cline (VS Code)

Open the Cline panel → MCP Servers → "Configure MCP Servers". Same JSON shape.

### Continue (VS Code JetBrains)

Add to `~/.continue/config.json` under `experimental.modelContextProtocolServers`:

```json
[
  {
    "name": "beacon",
    "command": "npx",
    "args": ["-y", "@beacon/mcp-server"],
    "env": {
      "BEACON_BASE_URL": "http://127.0.0.1:8080",
      "BEACON_ORG": "default"
    }
  }
]
```

### Remote agents (HTTP+SSE)

After `npx -y @beacon/mcp-server --http --host 0.0.0.0 --port 8765`, the endpoint is:

```
http://<host>:8765/mcp
```

Use any MCP HTTP client (the SDK ships Python/TS/Go/Kotlin clients). CORS is open by default — set up a reverse proxy with auth in production.

The server is a long-running process. Common deployment patterns:

```bash
# systemd unit
[Service]
ExecStart=/usr/bin/env npx -y @beacon/mcp-server --http --host 0.0.0.0 --port 8765
Environment=BEACON_BASE_URL=http://beacon.internal:8080
Environment=BEACON_ORG=production
Restart=always
```

```yaml
# docker-compose snippet
beacon-mcp:
  image: node:22-alpine
  command: ["npx", "-y", "@beacon/mcp-server", "--http", "--host", "0.0.0.0", "--port", "8765"]
  environment:
    BEACON_BASE_URL: http://beacon:8080
    BEACON_ORG: production
  ports:
    - "8765:8765"
  restart: unless-stopped
```

---

## Tool reference

### Org & config

| Tool | Description |
|---|---|
| `list_organizations` | List all beacon orgs available via the configured API. |
| `health_check` | Probe `GET /health` for an org. |
| `get_config` | Read public dashboard config (model pricing, min session event count). |

### Dashboard

| Tool | Description |
|---|---|
| `get_dashboard` | Fetch the full dashboard payload, **or** a single sub-section (`metrics`, `activity`, `traffic`, `distributions`, `sessions`, `projects`). |

### Summary (5 dimensions)

| Tool | Description |
|---|---|
| `query_project_summary` | Daily per-project token/event rollup. |
| `query_language_summary` | Daily per-language rollup (from session detection). |
| `query_prompt_style_summary` | Daily per-prompt-style rollup. |
| `query_employee_hourly_summary` | Per-user, per-hour breakdown by tool and model. |
| `query_session_summary` | Per-session rollup (heaviest sessions, models, timestamps). |

### Events & sessions

| Tool | Description |
|---|---|
| `query_events` | Raw event query with `from`/`to`/`project`/`model`/`user`/`status` filters and pagination (`limit`, `all`). |
| `get_session_events` | Fetch the full event chain for a single session, given `(user, session_id, project)`. |

### Common arguments

Almost every tool accepts:

- `org` — organisation ID; falls back to `$BEACON_ORG`.
- `from` / `to` — `YYYY-MM-DD` (inclusive).
- `project` — exact project name, or `"all"` to disable.
- `model` — substring match, or `"all"`.
- `user` — substring match against `source_user_name` or `source_user_id`.
- `status` — `"errors_only"` or `"success_only"`.

`query_events` additionally accepts `limit` (1-500, default 100) and `all` (boolean).

---

## Resources

| URI | Description |
|---|---|
| `beacon://orgs` | List of organisations (cacheable). |
| `beacon://config` | Default org's dashboard config. |
| `beacon://dashboard` | Full default-org dashboard payload. |

For per-org resources, call the `get_config` / `get_dashboard` tools with the `org` argument.

---

## Output format

Every tool returns a single MCP `content` block with a Markdown summary followed by a fenced JSON payload. Example:

```markdown
## Summary

### Overview
- Events: **12,480** (requests: 9,201, sessions: 318)
- Tokens: **42.1M** (prompt 30.5M + completion 11.6M)
- ...

### Top projects
| Project | Tokens | Events | Requests | Share |
| --- | --- | --- | --- | --- |
| beacon | 18,205,440 | 4,820 | 3,612 | 43.2% |
| ... |

## Data (JSON)
```json
{ "code": 0, "message": "success", "data": [...], "meta": {...} }
```
```

This dual format lets the model either skim the Markdown (low token cost) or re-parse the JSON (precise). Errors are returned as `isError: true` with a plain-text message.

---

## Troubleshooting

### "Failed to connect to 127.0.0.1 port 8080"

The beacon API isn't running, or `BEACON_BASE_URL` is wrong.

```bash
curl $BEACON_BASE_URL/api/v1/health
# expected: {"code":0,"message":"success","data":{"status":"ok","time":"..."}}
```

### "organization \"X\" not found"

`$BEACON_ORG` (or the `org` argument) is not registered in the beacon API. Run `list_organizations` first to see what's available.

### "context deadline exceeded"

`BEACON_TIMEOUT_MS` is too low for the query. Try increasing it (default 30s) or narrowing the date range / using `section` on `get_dashboard`.

### Claude Desktop: "MCP server disconnected"

1. Check the config file path is correct.
2. Run the command from a terminal first to surface any error output:
   ```bash
   npx -y @beacon/mcp-server
   ```
3. Fully quit and re-open Claude Desktop (config changes do not hot-reload).
4. On macOS, look at the Claude Desktop log: `~/Library/Logs/Claude/mcp*.log`.

### HTTP+SSE: CORS or 401 errors

The server ships with CORS wide open for browser clients. If you front it with nginx/traefik, configure `Authorization: Bearer $BEACON_API_KEY` forwarding at the proxy. The MCP SDK does not enforce auth itself — protect the endpoint with a reverse-proxy in production.

### Behind a corporate proxy

Set `BEACON_PROXY` to route beacon traffic through the proxy. This affects
**only the MCP server → beacon** direction (not the MCP client ↔ MCP server
transport). The agent that runs the MCP client (Claude Desktop, Cursor,
etc.) is unaffected.

```json
{
  "mcpServers": {
    "beacon": {
      "command": "npx",
      "args": ["-y", "@beacon/mcp-server"],
      "env": {
        "BEACON_BASE_URL": "http://beacon.internal:8080",
        "BEACON_ORG": "default",
        "BEACON_PROXY": "http://proxy.corp.local:8080"
      }
    }
  }
}
```

Supported schemes: `http://`, `https://`, `socks5://`. The `socks5://` form
requires Node 18+ which uses undici 5+ under the hood. If the proxy
requires authentication, embed it in the URL: `http://user:pass@host:port`.

To verify the proxy is being used, tail the beacon server's access log
while invoking any tool — requests will arrive from the proxy's IP, not
the agent host.

### Beacon is reachable but everything is empty

Check that the collector + analyzer pipelines have run. Raw events need to be aggregated by the analyzer before the summary endpoints return data. Run `go run ./cmd/analyzer -config testdata/collector.yaml` (in the beacon repo) periodically.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc → dist/ (mirrors what `npm publish` will do via the `prepare` script)
```

Watch mode for tests:

```bash
npm run test:watch
```

### Layout

```
src/
  index.ts          # entry point, CLI parsing, transport selection
  server.ts         # McpServer construction; registers all tool modules
  client.ts         # BeaconClient — typed wrapper over beacon's REST API
  config.ts         # env + CLI arg parsing (zod-validated)
  filters.ts        # shared zod schemas (BaseFilter, EventFilter, SessionKey)
  formatting.ts     # JSON block + Markdown summary helpers
  tools/
    orgs.ts         # list_organizations, health_check, get_config + resources
    dashboard.ts    # get_dashboard + beacon://dashboard
    summary.ts      # 5 query_*_summary tools
    events.ts       # query_events
    session.ts      # get_session_events
tests/
  setup.ts          # vitest setup
  client.test.ts    # BeaconClient unit tests
  config.test.ts    # config + CLI parsing tests
  tools.test.ts     # end-to-end tool tests over an in-memory MCP transport
```

### Adding a new tool

1. Pick or create a file under `src/tools/`.
2. Write a `registerXxxTools(server: McpServer, client: BeaconClient): void` function.
3. Use the shared zod schemas in `filters.ts` for inputs.
4. Format output with `resultBlocks(summary, payload)` from `formatting.ts`.
5. Wire the registration into `server.ts`.
6. Add a test in `tests/tools.test.ts` that mocks the beacon response with `msw`.

### Publish flow

```bash
# Bump version
npm version patch   # or minor / major

# Publish (the `prepare` script auto-runs `tsc` before upload)
npm login
npm publish --access public
```

The published tarball contains only `dist/`, `README.md`, `LICENSE`, and `package.json` (controlled by `package.json#files` and `.npmignore`).

---

## License

MIT — see [LICENSE](./LICENSE).
