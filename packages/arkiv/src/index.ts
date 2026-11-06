import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, i32, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { http, hexToString, stringToBytes, type Hex, type LocalAccount } from "viem";
import { delegationSchema, delegationToWire, type Delegation } from "@mandate/core";

/**
 * One Arkiv entity per delegation, OWNED BY THE ISSUER wallet, natively expiring at the delegation's expiry.
 * Indexed attributes make the chain queryable; `payload` holds the full signed delegation (public data only:
 * addresses, ENS names, scope, signature — no invoices, no keys).
 * Readers must re-verify the payload locally: Arkiv is storage, not proof.
 */
export const DelegationEntity = defineSchema("mandate.delegation.v1", {
  id: str().indexed(),
  parentId: str().indexed(),
  rootId: str().indexed(),
  issuer: addr().indexed(),
  subject: addr().indexed(),
  issuerName: str().indexed(),
  subjectName: str().indexed(),
  actions: str().indexed(), // comma-joined, sorted
  maxAmount: u256().indexed(), // USDC minor units
  expiry: u64().indexed(), // unix seconds
  targets: str().indexed(), // comma-joined, sorted
  depth: i32().indexed(), // 0 = root
  payload: bytes(), // JSON of the signed delegation (wire form)
});

const chain = () => rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
export const arkivPublic = () => createPublicClient({ chain: chain(), transport: http() });

export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";
export const entityUrl = (key: string) => `${ARKIV_EXPLORER}/entity/${key}`;

/** Issuer writes its delegation. Returns the entity key. */
export async function publishDelegation(issuer: LocalAccount, d: Delegation, rootId: Hex, depth: number): Promise<string> {
  if (issuer.address.toLowerCase() !== d.issuer.toLowerCase()) throw new Error("only the issuer may publish its delegation");
  const wallet = createWalletClient({ chain: chain(), transport: http(), account: issuer });
  const { entityKey } = await wallet.createEntity(
    DelegationEntity,
    {
      id: d.id,
      parentId: d.parent,
      rootId,
      issuer: addr(d.issuer),
      subject: addr(d.subject),
      issuerName: d.issuerName,
      subjectName: d.subjectName,
      actions: d.scope.actions.join(","),
      maxAmount: u256(d.scope.maxAmount),
      expiry: u64(d.scope.expiry),
      targets: d.scope.targets.join(","),
      depth: i32(depth),
      payload: stringToBytes(JSON.stringify(delegationToWire(d))),
    } as any,
    { expiration: ExpirationTime.atDate(new Date(Number(d.scope.expiry) * 1000)) },
  );
  return entityKey as string;
}

export interface ArkivRecord {
  entityKey: string;
  owner?: string;
  delegation?: Delegation; // undefined if payload failed to parse/validate
  error?: string;
}

const decode = (e: any): ArkivRecord => {
  const out: ArkivRecord = { entityKey: e.$key, owner: e.$owner?.value ?? e.$owner };
  try {
    const raw = e.payload?.value ?? e.payload;
    const json = JSON.parse(typeof raw === "string" && raw.startsWith("0x") ? hexToString(raw as Hex) : new TextDecoder().decode(raw));
    out.delegation = delegationSchema.parse(json) as unknown as Delegation;
  } catch (err) {
    out.error = `payload invalid: ${String(err).slice(0, 120)}`;
  }
  return out;
};

const selection = { $key: true, $owner: true, payload: true } as const;

/** All delegations under one root (any depth). */
export async function fetchByRoot(rootId: Hex): Promise<ArkivRecord[]> {
  const { entities } = await (arkivPublic() as any).select(selection).from(DelegationEntity).where(eq("rootId", rootId)).fetch();
  return entities.map(decode);
}

/** Delegations whose subject has this ENS name (newest first is the caller's job). */
export async function fetchBySubjectName(name: string): Promise<ArkivRecord[]> {
  const { entities } = await (arkivPublic() as any).select(selection).from(DelegationEntity).where(eq("subjectName", name)).fetch();
  return entities.map(decode);
}

export async function fetchById(id: Hex): Promise<ArkivRecord | undefined> {
  const { entities } = await (arkivPublic() as any).select(selection).from(DelegationEntity).where(eq("id", id)).fetch();
  return entities[0] && decode(entities[0]);
}
export * from "./inspect.js";
