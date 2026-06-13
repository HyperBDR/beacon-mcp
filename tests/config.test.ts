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

describe("loadConfig BEACON_PROXY", () => {
  it("accepts empty/undefined BEACON_PROXY", () => {
    const cfg = loadConfig({});
    expect(cfg.BEACON_PROXY).toBeUndefined();
  });

  it("accepts an http:// proxy URL", () => {
    const cfg = loadConfig({ BEACON_PROXY: "http://proxy.corp.local:8080" });
    expect(cfg.BEACON_PROXY).toBe("http://proxy.corp.local:8080");
  });

  it("accepts an https:// proxy URL", () => {
    const cfg = loadConfig({ BEACON_PROXY: "https://internal-proxy:8443" });
    expect(cfg.BEACON_PROXY).toBe("https://internal-proxy:8443");
  });

  it("accepts a socks5:// proxy URL", () => {
    const cfg = loadConfig({ BEACON_PROXY: "socks5://user:pass@tor:9050" });
    expect(cfg.BEACON_PROXY).toBe("socks5://user:pass@tor:9050");
  });

  it("rejects an unsupported scheme", () => {
    expect(() => loadConfig({ BEACON_PROXY: "ftp://x" })).toThrow(/Invalid environment/);
  });

  it("rejects a malformed value", () => {
    expect(() => loadConfig({ BEACON_PROXY: "not a url" })).toThrow(/Invalid environment/);
  });
});
