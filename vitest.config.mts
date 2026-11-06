import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
});
