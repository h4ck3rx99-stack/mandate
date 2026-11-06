import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadServiceConfig } from "@mandate/core";
import { writeReceipt } from "@mandate/arkiv";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "./app";
import { sepoliaChain } from "./chain";
import { openDb } from "./db";
import { reconcile, type Deps } from "./execute";
import { migrateWorld, realOidc, worldRouter, type WorldConfig } from "./world";

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const cfg = loadServiceConfig();
const deps: Deps = {
  cfg,
  db: openDb(resolve(import.meta.dirname, "../../..", cfg.SERVICE_DB_PATH)),
  chain: sepoliaChain(cfg),
  now: () => BigInt(Math.floor(Date.now() / 1000)),
  events: new EventEmitter().setMaxListeners(100),
  // Decision receipts on Arkiv, owned by the service wallet (enabled when ARKIV_ACCESS_KEY is set).
  publishReceipt: process.env.ARKIV_ACCESS_KEY ? (job) => writeReceipt(privateKeyToAccount(cfg.SERVICE_PRIVATE_KEY), job) : undefined,
};

const tick = () => reconcile(deps).catch((e) => console.error("reconcile:", e));
await tick();
setInterval(tick, 15_000);

migrateWorld(deps.db);
let world;
if (cfg.WORLD_ISSUER && cfg.WORLD_CLIENT_ID && cfg.WORLD_CLIENT_SECRET && cfg.WORLD_REDIRECT_URI) {
  const wc: WorldConfig = {
    issuer: cfg.WORLD_ISSUER, clientId: cfg.WORLD_CLIENT_ID, clientSecret: cfg.WORLD_CLIENT_SECRET, redirectUri: cfg.WORLD_REDIRECT_URI,
    acceptedAcr: cfg.WORLD_ACCEPTED_ACR.split(",").map((s) => s.trim()), pinnedRoot: cfg.PINNED_ROOT_ISSUER, attemptTtlSec: 600,
  };
  world = worldRouter({ db: deps.db, cfg: wc, oidc: realOidc(wc), now: () => Math.floor(Date.now() / 1000), events: deps.events });
  console.log(`World step-up enabled (issuer ${wc.issuer})`);
} else console.log("World step-up DISABLED (WORLD_* not set): above-threshold requests stay PENDING");

createApp(deps, world).listen(cfg.SERVICE_PORT, () => {
  console.log(`payment-service on :${cfg.SERVICE_PORT} audience=${cfg.SERVICE_AUDIENCE} root=${cfg.PINNED_ROOT_ISSUER}`);
});
