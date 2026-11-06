import { delegationToWire, requestToWire, signRequest, type Delegation } from "@mandate/core";
import { keccak256, toHex } from "viem";
import { agentAccount, audience, domain, serviceUrl } from "./env";

export interface PaymentInstruction {
  target: string;
  amount: bigint; // USDC minor units
}

/** Settlement agent: signs an execution request with ONLY the SETTLE key and calls the payment service. */
export async function settle(chain: Delegation[], pay: PaymentInstruction, opts: { worldApprovalRef?: string; nonce?: `0x${string}`; deadline?: bigint; ttlSec?: number; audience?: string; serviceUrl?: string } = {}) {
  const me = agentAccount("SETTLE");
  const leaf = chain.at(-1)!;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const unsigned = {
    leafId: leaf.id,
    audience: opts.audience ?? audience(),
    action: "pay",
    amount: pay.amount,
    target: pay.target,
    nonce: opts.nonce ?? keccak256(toHex(`req-${Date.now()}-${Math.random()}`)),
    deadline: opts.deadline ?? now + BigInt(opts.ttlSec ?? 120),
  };
  const request = await signRequest(me, domain(), unsigned, opts.worldApprovalRef);
  const body = { chain: chain.map(delegationToWire), request: requestToWire(request) };
  const res = await fetch(`${opts.serviceUrl ?? serviceUrl()}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, sent: body, unsigned };
}
