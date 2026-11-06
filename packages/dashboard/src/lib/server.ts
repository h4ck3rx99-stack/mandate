import "server-only";
import { fetchReceipts, inspectName, type InspectResult, type Receipt } from "@mandate/arkiv";
import type { Address } from "viem";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`dashboard server missing env ${k}`);
  return v;
};
export const cfg = () => ({
  rpcUrl: need("SEPOLIA_RPC_URL"),
  chainId: Number(need("CHAIN_ID")),
  registry: need("REVOCATION_REGISTRY_ADDRESS") as Address,
  pinnedRoot: need("PINNED_ROOT_ISSUER") as Address,
});
export const rootName = () => need("ENS_ROOT_NAME");
export const agentNames = () => {
  const t = `treasury.${rootName()}`;
  const ops = `ops.${t}`, procure = `procure.${ops}`;
  return [ops, procure, `settle.${procure}`];
};
/** JSON-safe (bigint -> string) for client components. */
export const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

export async function inspect(name: string): Promise<InspectResult> {
  try {
    return plain(await inspectName(name, cfg()));
  } catch (e) {
    return { name, status: "DENIED", reasons: [`Lookup failed: ${String(e).slice(0, 160)}`], ens: { address: null, delegationId: null, delegationUri: null, status: null }, links: [], checks: [], violations: [] };
  }
}
export async function receipts(filter: { leafName?: string } = {}): Promise<Receipt[]> {
  try {
    return plain(await fetchReceipts(need("SERVICE_ADDRESS") as Address, filter));
  } catch {
    return [];
  }
}
