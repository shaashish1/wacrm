import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Live-Supabase or Next-request-scope tests; they fail in CI without
      // a running DB / cookies() request store (Next 16).
      "src/lib/auth/rls-isolation.test.ts",
      "src/lib/auth/account.test.ts",
      "src/lib/auth/api-context.test.ts",
      "src/lib/broadcasts/plain-broadcast.test.ts",
      "src/lib/ai/auto-reply.test.ts",
      "src/lib/ai/config.test.ts",
      "src/lib/contacts/tag-events.test.ts",
      "src/lib/webhooks/deliver.test.ts",
      "src/app/api/whatsapp/send/route.test.ts",
      "src/app/api/contacts/[id]/tags/route.test.ts",
    ],
    env: {
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      META_APP_SECRET: "test-meta-app-secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://ci.example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-dummy-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "ci-dummy-service-role-key",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    },
    clearMocks: true,
  },
});
