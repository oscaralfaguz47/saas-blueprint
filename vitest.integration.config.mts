import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    server: {
      deps: {
        external: ["@prisma/client"],
      },
    },
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/integration/_harness/setup.ts"],
    include: ["src/test/integration/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: "forks",
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    env: {
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "01234567890123456789012345678901",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1536",
    },
  },
});
