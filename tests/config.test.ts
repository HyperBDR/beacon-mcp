import { describe, it, expect } from "vitest";
import { loadConfig, parseCli } from "../src/config.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const cfg = loadConfig({});
    expect(cfg.BEACON_BASE_URL).toBe("http://127.0.0.1:8080");
    expect(cfg.BEACON_ORG).toBe("default");
    expect(cfg.BEACON_TIMEOUT_MS).toBe(30_000);
    expect(cfg.MCP_HTTP_PORT).toBe(8765);
  });

  it("coerces numeric env vars", () => {
    const cfg = loadConfig({
      BEACON_TIMEOUT_MS: "5000",
      MCP_HTTP_PORT: "9999",
    });
    expect(cfg.BEACON_TIMEOUT_MS).toBe(5_000);
    expect(cfg.MCP_HTTP_PORT).toBe(9_999);
  });

  it("rejects invalid URL", () => {
    expect(() => loadConfig({ BEACON_BASE_URL: "not a url" })).toThrow(/Invalid environment/);
  });

  it("rejects non-positive timeout", () => {
    expect(() => loadConfig({ BEACON_TIMEOUT_MS: "0" })).toThrow();
  });
});

describe("parseCli", () => {
  it("defaults to stdio", () => {
    expect(parseCli([]).http).toBe(false);
  });

  it("recognises --http and --port", () => {
    const opts = parseCli(["--http", "--port", "9123"]);
    expect(opts.http).toBe(true);
    expect(opts.port).toBe(9123);
  });

  it("captures --host", () => {
    const opts = parseCli(["--http", "--host", "0.0.0.0"]);
    expect(opts.host).toBe("0.0.0.0");
  });
});
