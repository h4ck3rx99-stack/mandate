import { signDelegation, type Delegation, type Scope } from "@mandate/core";
import { keccak256, toHex } from "viem";
import { addressOf, agentAccount, domain, names } from "./env.js";

/** Operations agent sub-delegates to the procurement agent. Holds only OPS key. */
export async function delegateToProcure(parent: Delegation, scope: Scope): Promise<Delegation> {
  const ops = agentAccount("OPS");
  const n = names();
  return signDelegation(ops, domain(), {
    parent: parent.id,
    subject: addressOf("PROCURE"),
    issuerName: n.ops,
    subjectName: n.procure,
    scope,
    nonce: keccak256(toHex(`ops-${Date.now()}-${Math.random()}`)),
  });
}
