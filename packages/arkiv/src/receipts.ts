import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { hexToString, http, stringToBytes, type LocalAccount } from "viem";
import { arkivPublic } from "./index.js";

/**
 * Public decision receipt written by the PAYMENT SERVICE (entity owner = service wallet) for every final verdict.
 * Contains no invoice text and no keys: only hashes, addresses, amounts, the verdict and the check results.
 */
export const ReceiptEntity = defineSchema("mandate.receipt.v1", {
  requestHash: str().indexed(),
  decision: str().indexed(), // EXECUTED | DENIED
  failedCheck: str().indexed(), // "" when executed
  rootId: str().indexed(),
  leafId: str().indexed(),
  leafSubject: addr().indexed(),
  leafName: str().indexed(), // ENS name of the agent that signed the request
  amount: u256().indexed(),
  target: str().indexed(),
  txHash: str().indexed(),
  at: u64().indexed(),
  payload: bytes(), // JSON { checks, violations }
});

export interface ReceiptInput {
  requestHash: string;
  decision: "EXECUTED" | "DENIED";
  failedCheck: string;
  rootId: string;
  leafId: string;
  leafSubject: `0x${string}`;
  leafName: string;
  amount: bigint;
  target: string;
  txHash: string;
  at: number;
  checks: unknown[];
  violations: unknown[];
}

export async function writeReceipt(service: LocalAccount, r: ReceiptInput): Promise<string> {
  const wallet = createWalletClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http(), account: service });
  const { checks, violations, leafSubject, amount, at, ...rest } = r;
  const { entityKey } = await wallet.createEntity(
    ReceiptEntity,
    { ...rest, leafSubject: addr(leafSubject), amount: u256(amount), at: u64(at), payload: stringToBytes(JSON.stringify({ checks, violations })) } as any,
    { expiration: ExpirationTime.fromDays(90) },
  );
  return entityKey as string;
}

export interface Receipt extends Omit<ReceiptInput, "amount" | "at" | "checks" | "violations"> {
  entityKey: string;
  owner: string;
  amount: string;
  at: number;
  checks: unknown[];
  violations: unknown[];
}

const val = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x);
const decode = (e: any): Receipt => {
  let body: any = {};
  try {
    const raw = val(e.payload);
    body = JSON.parse(typeof raw === "string" ? hexToString(raw as `0x${string}`) : new TextDecoder().decode(raw));
  } catch { /* leave empty */ }
  return {
    entityKey: e.$key, owner: String(val(e.$owner)), requestHash: val(e.requestHash), decision: val(e.decision), failedCheck: val(e.failedCheck),
    rootId: val(e.rootId), leafId: val(e.leafId), leafSubject: val(e.leafSubject), leafName: val(e.leafName), amount: String(val(e.amount)),
    target: val(e.target), txHash: val(e.txHash), at: Number(val(e.at)), checks: body.checks ?? [], violations: body.violations ?? [],
  };
};
const all = { $key: true, $owner: true, requestHash: true, decision: true, failedCheck: true, rootId: true, leafId: true, leafSubject: true, leafName: true, amount: true, target: true, txHash: true, at: true, payload: true } as const;

/** Receipts written by `service` (only trust receipts from the configured service wallet), optionally filtered. */
export async function fetchReceipts(service: `0x${string}`, filter: { leafName?: string; rootId?: string } = {}): Promise<Receipt[]> {
  let q = (arkivPublic() as any).select(all).from(ReceiptEntity).ownedBy(service);
  if (filter.leafName) q = q.where(eq("leafName", filter.leafName));
  else if (filter.rootId) q = q.where(eq("rootId", filter.rootId));
  const { entities } = await q.fetch();
  return entities.map(decode).sort((a: Receipt, b: Receipt) => b.at - a.at);
}
