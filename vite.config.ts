import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

// Inject git SHA at build time so AppInfoPanel can display the build hash.
// Falls back to "dev" when git is unavailable (fresh checkout, CI without git).
function getBuildHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "dev";
  }
}

// Atomic-rollback deploy ID. CI sets VITE_DEPLOY_ID to the streamvault
// rollback manifest's deploy_id (`deploy-YYYYMMDDHHmmss-fe-be`). Local
// builds fall back to the build hash so we always have a value to embed
// in the <meta name="sv-deploy-id"> tag in index.html.
function getDeployId(): string {
  return process.env.VITE_DEPLOY_ID || `dev-${getBuildHash()}`;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(getBuildHash()),
    "import.meta.env.VITE_DEPLOY_ID": JSON.stringify(getDeployId()),
  },
  envPrefix: ["VITE_"],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/primitives/**", "src/api/**"],
    },
  },
});
