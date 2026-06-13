import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Make sure ofetch is loaded with globalThis.fetch in place.
    deps: {
      interopDefault: true,
    },
  },
});
