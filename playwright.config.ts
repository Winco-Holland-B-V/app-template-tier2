import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// De testomgeving wordt geschreven door `pnpm env:local` en staat niet in git.
if (existsSync(".env.test")) process.loadEnvFile(".env.test");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bewust de gebouwde app, niet de dev-server: je test wat er ook echt live gaat.
    // De poort staat in het preview-script; hier niet nog eens meegeven, want dan
    // krijgt Vite de vlag dubbel en bindt hij op een andere poort.
    command: "pnpm build && pnpm preview",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
