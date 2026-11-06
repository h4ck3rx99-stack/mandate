import type { Hex } from "viem";
import type { Delegation } from "@mandate/core";
import { entityUrl, publishDelegation as writeArkiv } from "@mandate/arkiv";
import { agentAccount } from "./env.js";
import { publishDelegation as writeEns } from "./ens.js";

export interface PublishedLink {
  entityKey: string;
  arkivUrl: string;
  ensTxs: Hex[];
}

/**
 * The ISSUER publishes what it just signed: Arkiv entity (owned by the issuer, expires with the delegation)
 * + ENS records on the subject's name pointing at it. Both are discovery; verifiers re-check signatures.
 */
export async function publishLink(issuerRole: "OWNER" | "OPS" | "PROCURE", d: Delegation, rootId: Hex, depth: number): Promise<PublishedLink> {
  const entityKey = await writeArkiv(agentAccount(issuerRole), d, rootId, depth);
  const arkivUrl = entityUrl(entityKey);
  const ensTxs = await writeEns(issuerRole, d, arkivUrl);
  return { entityKey, arkivUrl, ensTxs };
}
