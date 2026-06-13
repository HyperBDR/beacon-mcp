import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BeaconClient } from "../src/client.js";
import { buildServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const BASE = "http://beacon.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Helper: build a connected (server, client) pair over in-memory transport. */
async function makePair() {
  const beacon = new BeaconClient({
    baseUrl: BASE,
    defaultOrg: "default",
    timeoutMs: 5_000,
  });
  const mcpServer = buildServer(beacon, { name: "beacon-mcp-test", version: "test" });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [t1, t2] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcpServer.connect(t1), client.connect(t2)]);
  return { mcpServer, client, beacon };
}

describe("tools registration", () => {
  it("registers the expected set of tools", async () => {
    const { client, mcpServer } = await makePair();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "get_config",
        "get_dashboard",
        "get_session_events",
        "health_check",
        "list_organizations",
        "query_employee_hourly_summary",
        "query_events",
        "query_language_summary",
        "query_prompt_style_summary",
        "query_project_summary",
        "query_session_summary",
      ].sort(),
    );
    await mcpServer.close();
  });

  it("exposes org and dashboard resources", async () => {
    const { client, mcpServer } = await makePair();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toContain("beacon://orgs");
    expect(uris).toContain("beacon://config");
    expect(uris).toContain("beacon://dashboard");
    await mcpServer.close();
  });
});

describe("tool execution against mocked beacon", () => {
  it("list_organizations returns human-readable summary", async () => {
    server.use(
      http.get(`${BASE}/api/v1/orgs`, () =>
        HttpResponse.json({
          code: 0,
          message: "success",
          data: [
            { id: "default", name: "Default" },
            { id: "team-a", name: "Team A" },
          ],
        }),
      ),
    );
    const { client, mcpServer } = await makePair();
    const result = await client.callTool({ name: "list_organizations", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Found 2 organization/);
    expect(text).toMatch(/default/);
    expect(text).toMatch(/team-a/);
    await mcpServer.close();
  });

  it("query_project_summary forwards filter params and renders table", async () => {
    let path = "";
    let search = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/summary/project`, (info) => {
        const req = info.request;
        const u = new URL(req.url);
        path = u.pathname;
        search = u.search;
        return HttpResponse.json({
          code: 0,
          message: "ok",
          data: [
            { dt: "2026-06-10", project_name: "beacon", event_count: 12, request_count: 10, total_tokens: 5000, prompt_tokens: 3000, completion_tokens: 2000, error_count: 1, latency_ms: 9000 },
          ],
          meta: { from: "2026-06-01", to: "2026-06-13", total: 1 },
        });
      }),
    );
    const { client, mcpServer } = await makePair();
    const result = await client.callTool({
      name: "query_project_summary",
      arguments: { from: "2026-06-01", to: "2026-06-13", project: "beacon" },
    });
    expect(path).toBe("/api/v1/orgs/default/summary/project");
    expect(search).toContain("project=beacon");
    const text = (result.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Returned \*\*1\*\* project-day rows/);
    expect(text).toMatch(/beacon/);
    expect(text).toMatch(/5,000/);
    await mcpServer.close();
  });

  it("query_events includes limit by default and skips it with all=true", async () => {
    let search = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/events`, (info) => {
        const req = info.request;
        search = new URL(req.url).search;
        return HttpResponse.json({ code: 0, message: "ok", data: [], meta: { total: 0 } });
      }),
    );
    const { client, mcpServer } = await makePair();
    await client.callTool({ name: "query_events", arguments: { limit: 50 } });
    expect(search).toContain("limit=50");
    expect(search).not.toContain("all=true");

    await client.callTool({ name: "query_events", arguments: { all: true } });
    expect(search).toContain("all=true");
    expect(search).not.toContain("limit=");
    await mcpServer.close();
  });

  it("propagates beacon errors as tool errors", async () => {
    server.use(
      http.get(`${BASE}/api/v1/orgs/missing/health`, () =>
        HttpResponse.json(
          { code: 404, message: "organization \"missing\" not found" },
          { status: 404 },
        ),
      ),
    );
    const { client, mcpServer } = await makePair();
    const result = await client.callTool({
      name: "health_check",
      arguments: { org: "missing" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/organization/);
    await mcpServer.close();
  });
});
