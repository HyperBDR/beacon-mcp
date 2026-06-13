import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { BeaconClient } from "../src/client.js";

const BASE = "http://beacon.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function newClient(): BeaconClient {
  return new BeaconClient({
    baseUrl: BASE,
    defaultOrg: "default",
    timeoutMs: 5_000,
  });
}

describe("BeaconClient.listOrgs", () => {
  it("returns the org list", async () => {
    server.use(
      http.get(`${BASE}/api/v1/orgs`, () =>
        HttpResponse.json({
          code: 0,
          message: "success",
          data: [
            { id: "default", name: "Default" },
            { id: "team-a", name: "Team A", description: "Acme" },
          ],
        }),
      ),
    );
    const c = newClient();
    const res = await c.listOrgs();
    expect(res.code).toBe(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0]?.id).toBe("default");
  });
});

describe("BeaconClient routing", () => {
  it("targets /api/v1/orgs/:org/... when no override", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/summary/project`, (info) => {
        const req = info.request;
        url = req.url;
        return HttpResponse.json({ code: 0, message: "ok", data: [], meta: { total: 0 } });
      }),
    );
    const c = newClient();
    await c.summary("project", { from: "2026-06-01", to: "2026-06-07" });
    expect(url).toContain("from=2026-06-01");
    expect(url).toContain("to=2026-06-07");
  });

  it("honours explicit `org` override", async () => {
    let path = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/team-a/dashboard/metrics`, (info) => {
        const req = info.request;
        path = new URL(req.url).pathname;
        return HttpResponse.json({ code: 0, message: "ok", data: {} });
      }),
    );
    const c = newClient();
    await c.dashboard("metrics", {}, "team-a");
    expect(path).toBe("/api/v1/orgs/team-a/dashboard/metrics");
  });

  it("encodes path segments", async () => {
    let path = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/sessions/u%20one/s%2Fs/p1`, (info) => {
        const req = info.request;
        path = new URL(req.url).pathname;
        return HttpResponse.json({ code: 0, message: "ok", data: { events: [] } });
      }),
    );
    const c = newClient();
    await c.sessionEvents("u one", "s/s", "p1");
    expect(path).toBe("/api/v1/orgs/default/sessions/u%20one/s%2Fs/p1");
  });

  it("strips empty/undefined query params", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/events`, (info) => {
        const req = info.request;
        url = req.url;
        return HttpResponse.json({ code: 0, message: "ok", data: [] });
      }),
    );
    const c = newClient();
    await c.events({ from: "2026-06-01", project: undefined, model: "", status: "errors_only" });
    const qs = new URL(url).searchParams;
    expect(qs.get("from")).toBe("2026-06-01");
    expect(qs.has("project")).toBe(false);
    expect(qs.has("model")).toBe(false);
    expect(qs.get("status")).toBe("errors_only");
  });
});

describe("BeaconClient error handling", () => {
  it("normalises 4xx errors to readable messages", async () => {
    server.use(
      http.get(`${BASE}/api/v1/orgs/missing/health`, () =>
        HttpResponse.json(
          { code: 404, message: "organization \"missing\" not found" },
          { status: 404 },
        ),
      ),
    );
    const c = newClient();
    await expect(c.health("missing")).rejects.toThrow(/organization/);
  });

  it("propagates 5xx as errors", async () => {
    server.use(
      http.get(`${BASE}/api/v1/orgs/default/dashboard`, () =>
        HttpResponse.json({ code: 500, message: "boom" }, { status: 500 }),
      ),
    );
    const c = newClient();
    await expect(c.dashboard(undefined, {})).rejects.toThrow(/boom/);
  });
});

describe("BeaconClient retry", () => {
  it("retries 503s then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/v1/orgs`, () => {
        calls++;
        if (calls < 2) {
          return HttpResponse.json({ code: 503, message: "down" }, { status: 503 });
        }
        return HttpResponse.json({ code: 0, message: "ok", data: [] });
      }),
    );
    const c = newClient();
    const res = await c.listOrgs();
    expect(calls).toBe(2);
    expect(res.code).toBe(0);
  });
});

describe("BeaconClient proxy option", () => {
  it("accepts a proxy option without breaking normal requests", async () => {
    // We don't have a proxy server in tests; what we verify is that
    // constructing with `proxy` and then issuing a request still works
    // end-to-end through the underlying $Fetch.
    server.use(
      http.get(`${BASE}/api/v1/orgs`, () =>
        HttpResponse.json({ code: 0, message: "ok", data: [] }),
      ),
    );
    const c = new BeaconClient({
      baseUrl: BASE,
      defaultOrg: "default",
      timeoutMs: 5_000,
      proxy: "http://proxy.corp.local:8080",
    });
    const res = await c.listOrgs();
    expect(res.code).toBe(0);
    // In a unit test we cannot confirm ofetch actually uses the proxy
    // (it would only matter for the real network), but the constructor
    // and the request flow must both succeed.
  });

  it("accepts socks5:// schemes", async () => {
    const c = new BeaconClient({
      baseUrl: BASE,
      defaultOrg: "default",
      timeoutMs: 5_000,
      proxy: "socks5://user:pass@tor-exit:9050",
    });
    // No request; just ensure the constructor accepts the value.
    expect(c).toBeDefined();
  });
});
