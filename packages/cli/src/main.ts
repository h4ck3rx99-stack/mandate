#!/usr/bin/env -S npx tsx
// mandate verify <ens-name> [--json]   ENS -> Arkiv -> local verify -> revocation -> USABLE / REVOKED / EXPIRED / DENIED
// mandate receipts <ens-name>          decision receipts from Arkiv (only those owned by the payment-service wallet)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchReceipts, inspectName } from "@mandate/arkiv";
import type { Address } from "viem";

const env = resolve(import.meta.dirname, "../../../.env");
if (existsSync(env)) process.loadEnvFile(env);

const GREEN = "\x1b[92m", RED = "\x1b[91m", AMBER = "\x1b[93m", RESET = "\x1b[0m";
const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

async function verify(name: string, json: boolean): Promise<number> {
  const r = await inspectName(name, {
    rpcUrl: need("SEPOLIA_RPC_URL"),
    chainId: Number(need("CHAIN_ID")),
    registry: need("REVOCATION_REGISTRY_ADDRESS") as Address,
    pinnedRoot: need("PINNED_ROOT_ISSUER") as Address,
  });
  if (json) {
    console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } else {
    const c = { USABLE: GREEN, REVOKED: RED, EXPIRED: AMBER, DENIED: RED }[r.status];
    console.log(`${c}${r.status}${RESET}  ${name}`);
    for (const why of r.reasons) console.log(`  ${why}`);
    for (const [i, l] of r.links.entries()) {
      const d = l.delegation;
      console.log(`  ${i}. ${d.issuerName} -> ${d.subjectName}  max ${(Number(d.scope.maxAmount) / 1e6).toFixed(2)} USDC  ${d.scope.actions}/${d.scope.targets}${l.revoked ? "  REVOKED" : ""}`);
      console.log(`     arkiv https://rabdi.explorer.arkiv.network/entity/${l.entityKey}`);
    }
    for (const v of r.violations) console.log(`  violation edge ${v.edgeIndex}: ${v.dimension} ${v.parentValue} -> ${v.childValue}`);
  }
  return r.status === "USABLE" ? 0 : 1;
}

async function receipts(name: string): Promise<number> {
  const rs = await fetchReceipts(need("SERVICE_ADDRESS") as Address, { leafName: name });
  if (rs.length === 0) console.log(`no receipts on Arkiv for ${name}`);
  for (const r of rs.slice(0, 20)) {
    const c = r.decision === "EXECUTED" ? GREEN : RED;
    console.log(`${new Date(r.at * 1000).toISOString()}  ${c}${r.decision.padEnd(8)}${RESET} ${(Number(r.amount) / 1e6).toFixed(2).padStart(8)} USDC -> ${r.target}${r.failedCheck ? `  failed: ${r.failedCheck}` : ""}`);
    console.log(`    arkiv https://rabdi.explorer.arkiv.network/entity/${r.entityKey}${r.txHash ? `  tx https://sepolia.etherscan.io/tx/${r.txHash}` : ""}`);
  }
  return 0;
}

const [cmd, name] = process.argv.slice(2);
// exitCode (not process.exit) so open sockets close cleanly on Windows
if (cmd === "verify" && name) process.exitCode = await verify(name, process.argv.includes("--json"));
else if (cmd === "receipts" && name) process.exitCode = await receipts(name);
else {
  console.error("usage: mandate verify <ens-name> [--json]\n       mandate receipts <ens-name>");
  process.exitCode = 2;
}
