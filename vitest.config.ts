import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tests that talk to the real Postgres (no mocked db client). Most provision
// throwaway tenant schemas, i.e. run every tenant migration via
// `prisma migrate deploy` against the remote server -- 10-20s each over
// Tailscale, and some files provision two tenants in one beforeAll.
const DB_INTEGRATION_TESTS = [
  "src/lib/db/public-client.test.ts",
  "src/lib/db/tenant-client.test.ts",
  "src/lib/tenant/tenant-user-email.test.ts",
  "scripts/**/*.test.ts",
];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["e2e/**", "node_modules/**", ".next/**", ...DB_INTEGRATION_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: DB_INTEGRATION_TESTS,
          // One file at a time: concurrent `prisma migrate deploy` runs against
          // the same server time out (P1002 / advisory lock). And timeouts
          // sized for provisioning, not for unit tests -- both test bodies
          // (testTimeout) and beforeAll hooks (hookTimeout) provision.
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
