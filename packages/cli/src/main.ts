#!/usr/bin/env -S npx tsx
// mandate verify <ens-name> [--json]   ENS -> Arkiv -> local verify -> revocation -> USABLE / REVOKED / EXPIRED / DENIED
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectName } from "@mandate/arkiv";
import type { Address } from "viem";

const env = resolve(import.meta.dirname, "../../../.env");
if (existsSync(env)) process.loadEnvFile(env);
const [cmd, name] = process.argv.slice(2);
if (cmd !== "verify" || !name) {
  console.error("usage: mandate verify <ens-name> [--json]");
  process.exit(2);
}
const need = (k: string) => process.env[k] ?? (console.error(`missing env ${k}`), process.exit(2));
const r = await inspectName(name, {
  rpcUrl: need("SEPOLIA_RPC_URL"),
  chainId: Number(need("CHAIN_ID")),
  registry: need("REVOCATION_REGISTRY_ADDRESS") as Address,
  pinnedRoot: need("PINNED_ROOT_ISSUER") as Address,
});
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
} else {
  const c = { USABLE: "\x1b[92m", REVOKED: "\x1b[91m", EXPIRED: "\x1b[93m", DENIED: "\x1b[91m" }[r.status];
  console.log(`${c}${r.status}\x1b[0m  ${name}`);
  for (const why of r.reasons) console.log(`  ${why}`);
  for (const [i, l] of r.links.entries()) {
    const d = l.delegation;
    console.log(`  ${i}. ${d.issuerName} -> ${d.subjectName}  max ${(Number(d.scope.maxAmount) / 1e6).toFixed(2)} USDC  ${d.scope.actions}/${d.scope.targets}${l.revoked ? "  REVOKED" : ""}`);
    console.log(`     arkiv https://rabdi.explorer.arkiv.network/entity/${l.entityKey}`);
  }
  for (const v of r.violations) console.log(`  violation edge ${v.edgeIndex}: ${v.dimension} ${v.parentValue} -> ${v.childValue}`);
}
process.exit(r.status === "USABLE" ? 0 : 1);
