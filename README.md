# beacon-mcp

MCP server for the [beacon](https://github.com/) log analytics platform.

It exposes beacon's REST API as [Model Context Protocol](https://modelcontextprotocol.io) tools and resources, so any MCP-compatible AI agent (Claude Desktop, Cursor, Cline, etc.) can query and analyse AI-assistant usage data through a typed, validated interface.

The MCP server is a thin client over beacon's existing `/api/v1` endpoints — it does **not** duplicate SQL, Parquet, or storage logic. If the beacon API gains new endpoints, add a new tool to this server.

---

## Features

- **11 tools** covering organisation discovery, health checks, configuration, full dashboard, dashboard sub-sections, 5 summary dimensions, raw event query, and per-session event chain.
- **3 resources** (`beacon://orgs`, `beacon://config`, `beacon://dashboard`) for context that should be cached client-side.
- **stdio** (default) for Claude Desktop / Cursor / Cline / VS Code.
- **HTTP + SSE** (`--http` flag) for remote agents.
- **Strict types & validation** via [Zod](https://zod.dev/) — every argument is checked at the protocol boundary.
- **Filter arguments are unified**: `org`, `from`, `to`, `project`, `model`, `user`, `status`.
- **Smart summaries**: each tool returns a human-readable Markdown summary **plus** the raw JSON payload, so LLMs can both skim and re-parse.
- **No beacon side-changes**: works against the public `/api/v1` API; auth via `BEACON_API_KEY` if you front beacon with a reverse proxy that enforces it.

---

## Quick start

### Prerequisites

- Node.js **18.17+** (Node 20+ recommended)
- A running beacon API (`go run ./cmd/api -config testdata/collector.yaml` from the parent repo)

### Install

```bash
npm install
npm run build
```

### Run (stdio, for Claude Desktop / Cursor)

```bash
BEACON_BASE_URL=http://127.0.0.1:8080 \
BEACON_ORG=default \
node dist/index.js
```

Or in dev mode (no build step):

```bash
npm run dev
```

### Run (HTTP + SSE, for remote agents)

```bash
BEACON_BASE_URL=http://beacon.internal:8080 \
BEACON_ORG=production \
node dist/index.js --http --port 8765
```

The MCP endpoint will be available at `POST/GET/DELETE http://127.0.0.1:8765/mcp`.

---

## Configuration

All settings come from environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `BEACON_BASE_URL` | `http://127.0.0.1:8080` | Beacon REST API base URL |
| `BEACON_ORG` | `default` | Default organisation ID; tools can override per-call via the `org` argument |
| `BEACON_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds |
| `BEACON_API_KEY` | _(unset)_ | Optional bearer token (sent as `Authorization: Bearer …`) |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP transport host (only with `--http`) |
| `MCP_HTTP_PORT` | `8765` | HTTP transport port (only with `--http`) |

CLI flags:

```
--http                Run HTTP+SSE transport (default: stdio)
--host <addr>         Override MCP_HTTP_HOST
--port <number>       Override MCP_HTTP_PORT
--help, -h            Show usage
```

---

## Client configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beacon": {
      "command": "node",
      "args": ["/absolute/path/to/beacon-mcp/dist/index.js"],
      "env": {
        "BEACON_BASE_URL": "http://127.0.0.1:8080",
        "BEACON_ORG": "default"
      }
    }
  }
}
```

For development (no build step):

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

`Settings → MCP → Add new global MCP server` — same JSON structure as above.

### Cline / VS Code / Continue

Use the standard MCP server registration; the server speaks JSON-RPC 2.0 over stdio (default) or HTTP+SSE (`--http`).

### Remote agents (HTTP+SSE)

After `node dist/index.js --http --host 0.0.0.0 --port 8765`, the endpoint is:

```
http://<host>:8765/mcp
```

Use any MCP HTTP client. CORS is open by default — set up a reverse proxy with auth in production.

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
| `get_dashboard` | Fetch full dashboard payload, **or** a single sub-section (`metrics`, `activity`, `traffic`, `distributions`, `sessions`, `projects`). |

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

All tools (except `list_organizations` and `health_check` org arg) accept:

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

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc → dist/
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
  setup.ts          # vitest setup (verifies globalThis.fetch exists)
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

---

## License

MIT
