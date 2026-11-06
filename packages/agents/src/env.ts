import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { loadAgentKey, mandateDomain } from "@mandate/core";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

/** EIP-712 domain. Agents read the same public values the service is configured with. */
export const domain = () => mandateDomain(Number(need("CHAIN_ID")), need("REVOCATION_REGISTRY_ADDRESS") as Address);
export const serviceUrl = () => need("SERVICE_URL");
export const audience = () => need("SERVICE_AUDIENCE");

/** ENS names for each role, derived from the root name. */
export const names = () => {
  const root = need("ENS_ROOT_NAME");
  const treasury = `treasury.${root}`;
  const ops = `ops.${treasury}`;
  const procure = `procure.${ops}`;
  return { root, treasury, ops, procure, settle: `settle.${procure}` };
};

/** Each agent calls this with ONLY its own role. */
export const agentAccount = (role: Parameters<typeof loadAgentKey>[0]) => privateKeyToAccount(loadAgentKey(role));

/** Public addresses of other agents (derived from public config, never their keys). */
export const addressOf = (role: "OPS" | "PROCURE" | "SETTLE") => need(`${role}_ADDRESS`) as Address;
