// Vitest setup file. Runs before any test imports.
//
// ofetch caches the current `globalThis.fetch` at import time. We need a
// fetch reference to exist *before* ofetch is loaded, otherwise ofetch
// snapshots `node-fetch-native` and MSW (which patches `globalThis.fetch`
// at server.listen() time) won't be able to intercept requests.
//
// Node 18+ ships a built-in `globalThis.fetch`, so we just touch it once
// to make sure ofetch's module-level check succeeds.
if (typeof globalThis.fetch !== "function") {
  // Last-resort fallback; in CI this should already be set by Node.
  throw new Error("globalThis.fetch is not available — Node 18+ is required");
}
