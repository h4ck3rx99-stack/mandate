// Creates .env from .env.example (if missing) and fills EMPTY *_PRIVATE_KEY vars with fresh testnet keys.
// Never overwrites a value that is already set. Prints addresses only, never keys.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

if (!existsSync(".env")) copyFileSync(".env.example", ".env");
const lines = readFileSync(".env", "utf8").split(/\r?\n/);
const env = new Map<string, string>();
const out = lines.map((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) return line;
  let [, k, v] = m as unknown as [string, string, string];
  if (k.endsWith("_PRIVATE_KEY") && v === "") v = generatePrivateKey();
  env.set(k, v);
  return `${k}=${v}`;
});
const owner = env.get("OWNER_PRIVATE_KEY");
const pinIdx = out.findIndex((l) => l === "PINNED_ROOT_ISSUER=");
if (owner && pinIdx >= 0) out[pinIdx] = `PINNED_ROOT_ISSUER=${privateKeyToAccount(owner as Hex).address}`;
writeFileSync(".env", out.join("\n"));
for (const [k, v] of env) {
  if (k.endsWith("_PRIVATE_KEY") && v) console.log(k.replace("_PRIVATE_KEY", "").padEnd(20), privateKeyToAccount(v as Hex).address);
}
