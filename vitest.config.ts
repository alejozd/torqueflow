import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // Several test files provision real Postgres schemas concurrently (each running
    // `prisma migrate deploy` via execSync against the same remote server); under
    // that contention a single provisioning call can exceed Vitest's defaults.
    // Provisioning happens in both test bodies (testTimeout) and beforeAll hooks
    // (hookTimeout) — both must be raised, or the hook-based calls stay capped low.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
