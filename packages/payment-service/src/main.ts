import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadServiceConfig } from "@mandate/core";
import { createApp } from "./app.js";
import { sepoliaChain } from "./chain.js";
import { openDb } from "./db.js";
import { reconcile, type Deps } from "./execute.js";

const envFile = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const cfg = loadServiceConfig();
const deps: Deps = {
  cfg,
  db: openDb(resolve(import.meta.dirname, "../../..", cfg.SERVICE_DB_PATH)),
  chain: sepoliaChain(cfg),
  now: () => BigInt(Math.floor(Date.now() / 1000)),
  events: new EventEmitter().setMaxListeners(100),
};

const tick = () => reconcile(deps).catch((e) => console.error("reconcile:", e));
await tick();
setInterval(tick, 15_000);

createApp(deps).listen(cfg.SERVICE_PORT, () => {
  console.log(`payment-service on :${cfg.SERVICE_PORT} audience=${cfg.SERVICE_AUDIENCE} root=${cfg.PINNED_ROOT_ISSUER}`);
});
