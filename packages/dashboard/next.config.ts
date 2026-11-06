import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Server-side pages (registry, agent profile) read public chain config from the repo .env. No keys are used here.
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  transpilePackages: ["@mandate/core", "@mandate/arkiv"],
  agentRules: false,
  turbopack: {
    root: resolve(__dirname, "../.."),
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};

export default nextConfig;
