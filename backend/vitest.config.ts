import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Allow ESM ".js" import specifiers to resolve to their ".ts" sources.
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
