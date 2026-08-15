import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: path.resolve(import.meta.dirname, '../wrangler.jsonc'),
        environment: 'local',
      },
      miniflare: {
        bindings: {
          LOCAL_OPERATOR_TOKEN: 'worker-test-token-not-for-production',
          TEST_MIGRATIONS: await readD1Migrations(
            path.resolve(import.meta.dirname, '../migrations'),
          ),
        },
      },
    })),
  ],
  test: {
    include: ['worker/test/**/*.test.ts'],
    setupFiles: ['worker/test/apply-migrations.ts'],
    testTimeout: 20_000,
  },
});
