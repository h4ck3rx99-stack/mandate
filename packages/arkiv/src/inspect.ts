import { createPublicClient, http, isAddressEqual, parseAbi, zeroHash, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { mandateDomain, verifyChain, type Check, type Delegation, type Violation } from "@mandate/core";
import { fetchById, type ArkivRecord } from "./index";

export type Status = "USABLE" | "REVOKED" | "EXPIRED" | "DENIED";

export interface InspectResult {
  name: string;
  status: Status;
  reasons: string[];
  ens: { address: string | null; delegationId: string | null; delegationUri: string | null; status: string | null };
  links: { delegation: Delegation; entityKey: string; owner?: string; revoked?: boolean }[];
  checks: Check[];
  violations: Violation[];
}

export interface InspectConfig {
  rpcUrl: string;
  chainId: number;
  registry: Address; // RevocationRegistry (also the EIP-712 verifyingContract)
  pinnedRoot: Address;
  now?: bigint;
}

const registryAbi = parseAbi(["function statusOf(address[] issuers, bytes32[] ids) view returns (bool[])"]);
const MAX_DEPTH = 8;

/**
 * ENS (discovery) -> Arkiv (storage) -> local re-verification -> onchain revocation.
 * Anything missing, stale, unverifiable or unreadable is DENIED (fails closed).
 */
export async function inspectName(name: string, cfg: InspectConfig): Promise<InspectResult> {
  const pub = createPublicClient({ chain: sepolia, transport: http(cfg.rpcUrl) });
  const out: InspectResult = { name, status: "DENIED", reasons: [], ens: { address: null, delegationId: null, delegationUri: null, status: null }, links: [], checks: [], violations: [] };
  const deny = (r: string) => (out.reasons.push(r), out);

  // 1 ENS
  try {
    const n = normalize(name);
    const [address, delegationId, delegationUri, status] = await Promise.all([
      pub.getEnsAddress({ name: n }),
      pub.getEnsText({ name: n, key: "mandate:delegation-id" }),
      pub.getEnsText({ name: n, key: "mandate:delegation-uri" }),
      pub.getEnsText({ name: n, key: "mandate:status" }),
    ]);
    out.ens = { address: address ?? null, delegationId: delegationId ?? null, delegationUri: delegationUri ?? null, status: status ?? null };
  } catch (e) {
    return deny(`ENS lookup failed: ${String(e).slice(0, 120)}`);
  }
  if (!out.ens.delegationId || !/^0x[0-9a-fA-F]{64}$/.test(out.ens.delegationId)) return deny("ENS name has no mandate:delegation-id record.");

  // 2 Arkiv: walk leaf -> root
  const chain: { rec: ArkivRecord; d: Delegation }[] = [];
  let id = out.ens.delegationId as Hex;
  for (let i = 0; i < MAX_DEPTH && id !== zeroHash; i++) {
    let rec: ArkivRecord | undefined;
    try {
      rec = await fetchById(id);
    } catch (e) {
      return deny(`Arkiv read failed: ${String(e).slice(0, 120)}`);
    }
    if (!rec) return deny(`Delegation ${id.slice(0, 10)}… is missing or expired on Arkiv (stale read).`);
    if (!rec.delegation) return deny(`Arkiv entity ${rec.entityKey.slice(0, 10)}… has an invalid payload.`);
    if (!rec.owner || !isAddressEqual(rec.owner as Address, rec.delegation.issuer))
      return deny(`Arkiv entity ${rec.entityKey.slice(0, 10)}… is not owned by the delegation's issuer.`);
    chain.unshift({ rec, d: rec.delegation });
    id = rec.delegation.parent;
  }
  if (id !== zeroHash) return deny("Chain is deeper than allowed or never reaches a root.");
  out.links = chain.map(({ rec, d }) => ({ delegation: d, entityKey: rec.entityKey, owner: rec.owner }));
  const leaf = chain.at(-1)!.d;
  if (out.ens.address && !isAddressEqual(out.ens.address as Address, leaf.subject)) return deny("ENS address does not match the delegation's subject.");
  if (leaf.subjectName !== name) out.reasons.push(`Note: delegation names subject "${leaf.subjectName}".`);

  // 3 local verification (signatures, continuity, narrowing, pinned root, expiry)
  const v = await verifyChain(chain.map((c) => c.d), {
    domain: mandateDomain(cfg.chainId, cfg.registry),
    pinnedRoot: cfg.pinnedRoot,
    now: cfg.now ?? BigInt(Math.floor(Date.now() / 1000)),
  });
  out.checks = v.checks;
  out.violations = v.violations;
  if (!v.ok) {
    const failed = v.checks.find((c) => !c.ok)!;
    out.status = v.expired ? "EXPIRED" : "DENIED";
    out.reasons.push(failed.plainEnglish);
    return out;
  }

  // 4 revocation (read failure = DENIED)
  try {
    const st = await pub.readContract({ address: cfg.registry, abi: registryAbi, functionName: "statusOf", args: [chain.map((c) => c.d.issuer), chain.map((c) => c.d.id)] });
    st.forEach((r, i) => (out.links[i]!.revoked = r));
    if (st.some(Boolean)) {
      out.status = "REVOKED";
      out.reasons.push(`Revoked onchain: ${out.links.filter((l) => l.revoked).map((l) => l.delegation.subjectName).join(", ")}.`);
      return out;
    }
  } catch (e) {
    return deny(`Revocation check failed: ${String(e).slice(0, 120)}`);
  }
  out.status = "USABLE";
  out.reasons.push("Signatures, continuity, narrowing, expiry and revocation all check out.");
  return out;
}
