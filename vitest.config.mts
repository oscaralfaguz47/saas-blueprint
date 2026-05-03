import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    server: {
      deps: {
        /** Prefer Node resolution for `@prisma/client` (avoid browser stub) */
        external: ["@prisma/client"],
      },
    },
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", ".next", "src/test/integration/**"],
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      DATABASE_DIRECT_URL: "postgresql://test:test@127.0.0.1:5432/test",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "01234567890123456789012345678901",
      /** Cron route auth in unit tests */
      CRON_SECRET: "vitest-cron-secret",
      /** Test-only 32-byte key as 64 hex chars — must match WEBHOOK_SECRET_ENCRYPTION_KEY validation */
      WEBHOOK_SECRET_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1536",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "node_modules",
        ".next",
        "src/test/**",
        "**/*.d.ts",
        "src/components/**",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
      ],
    },
  },
});
