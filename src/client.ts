import { ofetch, type $Fetch, FetchError } from "ofetch";

/**
 * Beacon REST response envelope.
 *   { code, message, data, meta?: { from, to, total } }
 */
export interface BeaconResponse<T> {
  code: number;
  message: string;
  data: T;
  meta?: { from?: string; to?: string; total?: number };
}

/** Organization entry returned by /api/v1/orgs. */
export interface Organization {
  id: string;
  name: string;
  description?: string;
}

/** Convert any thrown value into a clean, LLM-friendly Error message. */
function normalizeError(err: unknown, fallback: string): Error {
  if (err instanceof FetchError) {
    const body = err.data as { message?: string; code?: number } | undefined;
    const msg = body?.message ?? err.message;
    return new Error(`beacon ${err.status ?? "?"}: ${msg}`);
  }
  if (err instanceof Error) return err;
  return new Error(`${fallback}: ${String(err)}`);
}

export interface BeaconClientOptions {
  baseUrl: string;
  defaultOrg: string;
  timeoutMs: number;
  apiKey?: string;
  /** Optional HTTP proxy used for requests to `baseUrl`. */
  proxy?: string;
  /** Optional fetch implementation (defaults to ofetch with global fetch). Mainly for tests. */
  fetcher?: $Fetch;
}

/**
 * Thin async client over beacon's REST API.
 * Always targets the /api/v1/orgs/:org_id/* routes so the org scope is explicit;
 * a tool that wants the legacy default-org endpoints simply passes `org: "default"`.
 */
export class BeaconClient {
  private readonly fetch: $Fetch;
  private readonly baseUrl: string;
  private readonly defaultOrg: string;
  private readonly defaultTimeout: number;
  private readonly apiKey?: string;
  private readonly proxy?: string;

  constructor(opts: BeaconClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.defaultOrg = opts.defaultOrg;
    this.defaultTimeout = opts.timeoutMs;
    this.apiKey = opts.apiKey;
    this.proxy = opts.proxy;
    this.fetch =
      opts.fetcher ??
      ofetch.create({
        retry: 2,
        retryDelay: 250,
        retryStatusCodes: [408, 429, 500, 502, 503, 504],
        timeout: opts.timeoutMs,
        headers: this.authHeaders(),
        ...(this.proxy ? { proxy: this.proxy } : {}),
        onResponseError({ response }) {
          void response;
        },
      });
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" }
      : { Accept: "application/json" };
  }

  private orgPath(org: string | undefined, suffix: string): string {
    const useOrg = (org ?? this.defaultOrg).trim();
    if (!useOrg) throw new Error("organization id is empty");
    return `/api/v1/orgs/${encodeURIComponent(useOrg)}${suffix}`;
  }

  private url(path: string, org?: string): string {
    return `${this.baseUrl}${this.orgPath(org, path)}`;
  }

  /** Strip undefined/empty values so ofetch doesn't send `?foo=` in the query. */
  private cleanQuery(params?: Record<string, unknown>): Record<string, string | number | boolean> {
    if (!params) return {};
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.length === 0) continue;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
        out[k] = v;
      }
    }
    return out;
  }

  private async get<T>(
    path: string,
    opts: { org?: string; query?: Record<string, unknown>; timeoutMs?: number } = {},
  ): Promise<BeaconResponse<T>> {
    try {
      return await this.fetch<BeaconResponse<T>>(this.url(path, opts.org), {
        method: "GET",
        query: this.cleanQuery(opts.query),
        timeout: opts.timeoutMs ?? this.defaultTimeout,
      });
    } catch (err) {
      throw normalizeError(err, "beacon request failed");
    }
  }

  // ---------- Endpoints ----------

  /** GET /api/v1/orgs — list available organizations. */
  async listOrgs(): Promise<BeaconResponse<Organization[]>> {
    try {
      return await this.fetch<BeaconResponse<Organization[]>>(
        `${this.baseUrl}/api/v1/orgs`,
        { method: "GET", timeout: this.defaultTimeout },
      );
    } catch (err) {
      throw normalizeError(err, "beacon listOrgs failed");
    }
  }

  /** GET /api/v1/health — basic health check (default org). */
  async health(org?: string): Promise<BeaconResponse<{ status: string; time: string }>> {
    return this.get("/health", { org });
  }

  /** GET /api/v1/orgs/{org}/config — public dashboard config. */
  async config(org?: string): Promise<BeaconResponse<unknown>> {
    return this.get("/config", { org });
  }

  /** GET /api/v1/orgs/{org}/dashboard[?section] — full or single-section dashboard. */
  async dashboard(
    section: string | undefined,
    query: Record<string, unknown>,
    org?: string,
  ): Promise<BeaconResponse<unknown>> {
    const path = section ? `/dashboard/${section}` : "/dashboard";
    return this.get(path, { org, query });
  }

  /** GET /api/v1/orgs/{org}/summary/{kind} — project | language | prompt-style | employee-hourly | session. */
  async summary(
    kind: "project" | "language" | "prompt-style" | "employee-hourly" | "session",
    query: Record<string, unknown>,
    org?: string,
  ): Promise<BeaconResponse<unknown>> {
    return this.get(`/summary/${kind}`, { org, query });
  }

  /** GET /api/v1/orgs/{org}/events — raw event query. */
  async events(
    query: Record<string, unknown>,
    org?: string,
  ): Promise<BeaconResponse<unknown>> {
    return this.get("/events", { org, query });
  }

  /**
   * GET /api/v1/orgs/{org}/sessions/{user}/{session}/{project} — full session event chain.
   * The "project" segment can be "-" per the API (sessions are org-scoped).
   */
  async sessionEvents(
    user: string,
    sessionId: string,
    project: string,
    org?: string,
  ): Promise<BeaconResponse<unknown>> {
    const path =
      `/sessions/${encodeURIComponent(user)}/` +
      `${encodeURIComponent(sessionId)}/` +
      `${encodeURIComponent(project || "-")}`;
    return this.get(path, { org });
  }
}
