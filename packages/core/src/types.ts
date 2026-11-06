import type { Address, Hex } from "viem";

/** The 4 caveats. maxAmount is a PER-REQUEST ceiling in USDC minor units (6 decimals). */
export interface Scope {
  actions: string[]; // sorted, deduped
  maxAmount: bigint;
  expiry: bigint; // unix seconds
  targets: string[]; // ["*"] OR concrete IDs, never both
}

export type Dimension = "actions" | "maxAmount" | "expiry" | "targets";

export interface Violation {
  dimension: Dimension;
  reason: string;
  parentValue: string;
  childValue: string;
  edgeIndex?: number; // set at chain level: edge i is chain[i] -> chain[i+1]
}

export interface Delegation {
  v: 1;
  id: Hex; // EIP-712 digest of the unsigned fields
  parent: Hex; // zero hash for root
  issuer: Address;
  subject: Address;
  issuerName: string; // ENS
  subjectName: string; // ENS
  scope: Scope;
  nonce: Hex;
  sig: Hex; // by issuer
}

export interface ExecutionRequest {
  leafId: Hex;
  audience: string;
  action: string;
  amount: bigint;
  target: string;
  nonce: Hex; // single use
  deadline: bigint; // unix seconds
  worldApprovalRef?: string;
  sig: Hex; // by leaf subject
}
