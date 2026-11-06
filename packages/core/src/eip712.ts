import { hashTypedData, zeroHash, type Address, type Hex, type LocalAccount } from "viem";
import type { Delegation, ExecutionRequest, Scope } from "./types";

export interface MandateDomain {
  name: "Mandate";
  version: "1";
  chainId: number;
  verifyingContract: Address; // RevocationRegistry, from the SERVICE config only
}

export const mandateDomain = (chainId: number, verifyingContract: Address): MandateDomain => ({
  name: "Mandate",
  version: "1",
  chainId,
  verifyingContract,
});

export const ROOT_PARENT: Hex = zeroHash;

export const EIP712_TYPES = {
  Scope: [
    { name: "actions", type: "string[]" },
    { name: "maxAmount", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "targets", type: "string[]" },
  ],
  Delegation: [
    { name: "v", type: "uint8" },
    { name: "parent", type: "bytes32" },
    { name: "issuer", type: "address" },
    { name: "subject", type: "address" },
    { name: "issuerName", type: "string" },
    { name: "subjectName", type: "string" },
    { name: "scope", type: "Scope" },
    { name: "nonce", type: "bytes32" },
  ],
  // worldApprovalRef is deliberately NOT signed: the approval is bound to this digest, so the ref can only
  // point at an approval for this exact request (prevents a circular hash).
  ExecutionRequest: [
    { name: "leafId", type: "bytes32" },
    { name: "audience", type: "string" },
    { name: "action", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "target", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export type UnsignedDelegation = Omit<Delegation, "id" | "sig">;
export type UnsignedRequest = Omit<ExecutionRequest, "sig" | "worldApprovalRef">;

const delegationMessage = (d: UnsignedDelegation) => ({
  v: d.v,
  parent: d.parent,
  issuer: d.issuer,
  subject: d.subject,
  issuerName: d.issuerName,
  subjectName: d.subjectName,
  scope: d.scope,
  nonce: d.nonce,
});

const requestMessage = (r: UnsignedRequest) => ({
  leafId: r.leafId,
  audience: r.audience,
  action: r.action,
  amount: r.amount,
  target: r.target,
  nonce: r.nonce,
  deadline: r.deadline,
});

/** Delegation id = EIP-712 digest of its unsigned fields. */
export const hashDelegation = (domain: MandateDomain, d: UnsignedDelegation): Hex =>
  hashTypedData({ domain, types: EIP712_TYPES, primaryType: "Delegation", message: delegationMessage(d) });

export const hashRequest = (domain: MandateDomain, r: UnsignedRequest): Hex =>
  hashTypedData({ domain, types: EIP712_TYPES, primaryType: "ExecutionRequest", message: requestMessage(r) });

/** Issuer signs a delegation. Returns the full Delegation with id + sig. */
export async function signDelegation(
  issuer: LocalAccount,
  domain: MandateDomain,
  d: Omit<UnsignedDelegation, "issuer" | "v">,
): Promise<Delegation> {
  const unsigned: UnsignedDelegation = { ...d, v: 1, issuer: issuer.address };
  const sig = await issuer.signTypedData({
    domain,
    types: EIP712_TYPES,
    primaryType: "Delegation",
    message: delegationMessage(unsigned),
  });
  return { ...unsigned, id: hashDelegation(domain, unsigned), sig };
}

/** Leaf subject signs an execution request. */
export async function signRequest(
  leafSubject: LocalAccount,
  domain: MandateDomain,
  r: UnsignedRequest,
  worldApprovalRef?: string,
): Promise<ExecutionRequest> {
  const sig = await leafSubject.signTypedData({
    domain,
    types: EIP712_TYPES,
    primaryType: "ExecutionRequest",
    message: requestMessage(r),
  });
  return { ...r, sig, ...(worldApprovalRef ? { worldApprovalRef } : {}) };
}

export const scopeToWire = (s: Scope) => ({
  actions: s.actions,
  maxAmount: s.maxAmount.toString(),
  expiry: s.expiry.toString(),
  targets: s.targets,
});

/** JSON-safe wire form (bigints as decimal strings) — what POST /execute accepts. */
export const delegationToWire = (d: Delegation) => ({ ...d, scope: scopeToWire(d.scope) });
export const requestToWire = (r: ExecutionRequest) => ({
  ...r,
  amount: r.amount.toString(),
  deadline: r.deadline.toString(),
});
