import { isAddressEqual, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { EIP712_TYPES, ROOT_PARENT, hashDelegation, hashRequest, type MandateDomain } from "./eip712.js";
import { narrowsChain } from "./narrows.js";
import { executeBodySchema } from "./schema.js";
import type { Delegation, ExecutionRequest, Violation } from "./types.js";

export interface Check {
  name: string;
  ok: boolean;
  plainEnglish: string;
  detail: string;
}

export interface WorldApprovalRecord {
  requestHash: Hex;
  approvedAt: bigint; // unix seconds, server-verified auth_time
  consumed: boolean;
}

export interface VerifyContext {
  domain: MandateDomain; // from SERVICE config only
  pinnedRoot: Address; // from SERVICE config only
  audience: string;
  now: bigint; // unix seconds
  maxRequestTtlSec: bigint; // request deadline may be at most this far in the future
  worldThreshold: bigint; // minor units; amount > threshold needs World approval
  worldApprovalTtlSec: bigint;
  lookupWorldApproval: (ref: string) => Promise<WorldApprovalRecord | undefined>;
}

export interface VerifyResult {
  ok: boolean;
  checks: Check[];
  violations: Violation[];
  /** Present once the body parsed; the service needs these for nonce/revocation/transfer. */
  chain?: Delegation[];
  request?: ExecutionRequest;
  requestHash?: Hex;
  needsWorldApproval?: boolean;
}

const fmt = (minor: bigint) => {
  const s = minor.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6, -4)} USDC`;
};

/**
 * Pipeline steps 1-9 (pure except signature recovery + approval lookup). Stops at the first failed check.
 * Any exception inside a step fails that step (fails closed).
 */
export async function verifyExecution(raw: unknown, ctx: VerifyContext): Promise<VerifyResult> {
  const checks: Check[] = [];
  const res: VerifyResult = { ok: false, checks, violations: [] };

  const step = async (name: string, fn: () => Promise<[ok: boolean, plain: string, detail: string]> | [boolean, string, string]) => {
    try {
      const [ok, plainEnglish, detail] = await fn();
      checks.push({ name, ok, plainEnglish, detail });
      return ok;
    } catch (e) {
      checks.push({ name, ok: false, plainEnglish: "This check could not complete, so the request is denied.", detail: String(e) });
      return false;
    }
  };

  // 1 schema + bounds
  let chain!: Delegation[];
  let request!: ExecutionRequest;
  if (
    !(await step("schema", () => {
      const p = executeBodySchema.safeParse(raw);
      if (!p.success) return [false, "The request is malformed or out of bounds.", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")];
      chain = p.data.chain as Delegation[];
      request = p.data.request as ExecutionRequest;
      return [true, "The request is well-formed.", `chain depth ${chain.length}`];
    }))
  )
    return res;
  res.chain = chain;
  res.request = request;
  const root = chain[0]!;
  const leaf = chain[chain.length - 1]!;

  // 2 root pinned
  if (
    !(await step("root", () => {
      if (root.parent !== ROOT_PARENT) return [false, "The chain does not start at a root mandate.", `first link parent ${root.parent}`];
      if (!isAddressEqual(root.issuer, ctx.pinnedRoot))
        return [false, "The chain does not trace back to the treasury owner this service trusts.", `root issuer ${root.issuer} != pinned ${ctx.pinnedRoot}`];
      return [true, "The chain starts at the trusted treasury owner.", root.issuer];
    }))
  )
    return res;

  // 3 ids + signatures
  if (
    !(await step("signatures", async () => {
      for (const [i, d] of chain.entries()) {
        const { id, sig, ...unsigned } = d;
        const recomputed = hashDelegation(ctx.domain, unsigned);
        if (recomputed !== id) return [false, `Link ${i} was altered after it was signed.`, `id ${id} != recomputed ${recomputed}`];
        const signer = await recoverTypedDataAddress({ domain: ctx.domain, types: EIP712_TYPES, primaryType: "Delegation", message: unsigned, signature: sig });
        if (!isAddressEqual(signer, d.issuer)) return [false, `Link ${i} was not signed by its issuer.`, `signer ${signer} != issuer ${d.issuer}`];
      }
      return [true, "Every mandate in the chain is signed by its issuer.", `${chain.length} signatures`];
    }))
  )
    return res;

  // 4 continuity, no repeats/cycles
  if (
    !(await step("continuity", () => {
      const ids = new Set<string>();
      const principals = new Set<string>([root.issuer.toLowerCase()]);
      for (const [i, d] of chain.entries()) {
        if (ids.has(d.id)) return [false, "The chain repeats a mandate.", `duplicate id at link ${i}`];
        ids.add(d.id);
        const subj = d.subject.toLowerCase();
        if (principals.has(subj)) return [false, "The chain loops back to an earlier agent.", `subject ${d.subject} repeats at link ${i}`];
        principals.add(subj);
        if (i === 0) continue;
        const p = chain[i - 1]!;
        if (d.parent !== p.id) return [false, `Link ${i} does not point at the mandate before it.`, `parent ${d.parent} != ${p.id}`];
        if (!isAddressEqual(d.issuer, p.subject)) return [false, `Link ${i} was issued by someone who did not hold the parent mandate.`, `issuer ${d.issuer} != parent subject ${p.subject}`];
      }
      return [true, "Each agent received its mandate from the one above it.", chain.map((d) => d.subjectName).join(" -> ")];
    }))
  )
    return res;

  // 5 narrowing on every edge
  if (
    !(await step("narrowing", () => {
      const v = narrowsChain(chain.map((d) => d.scope));
      res.violations = v;
      if (v.length > 0) {
        const first = v[0]!;
        const who = chain[first.edgeIndex! + 1]!.issuerName;
        return [false, `${who} tried to grant more authority than it holds.`, v.map((x) => `edge ${x.edgeIndex} ${x.dimension}: ${x.parentValue} -> ${x.childValue}`).join("; ")];
      }
      return [true, "No agent granted more than it was given.", `${chain.length - 1} edges checked`];
    }))
  )
    return res;

  // 6 time
  if (
    !(await step("freshness", () => {
      const expired = chain.findIndex((d) => d.scope.expiry <= ctx.now);
      if (expired >= 0) return [false, `The mandate for ${chain[expired]!.subjectName} has expired.`, `expiry ${chain[expired]!.scope.expiry} <= now ${ctx.now}`];
      if (request.deadline <= ctx.now) return [false, "The request has expired.", `deadline ${request.deadline} <= now ${ctx.now}`];
      if (request.deadline > ctx.now + ctx.maxRequestTtlSec) return [false, "The request's deadline is too far in the future.", `deadline ${request.deadline} > now + ${ctx.maxRequestTtlSec}`];
      return [true, "All mandates are current and the request is fresh.", `now ${ctx.now}`];
    }))
  )
    return res;

  // 7 audience + leaf signer
  res.requestHash = hashRequest(ctx.domain, request);
  if (
    !(await step("audience_signer", async () => {
      if (request.audience !== ctx.audience) return [false, "The request was addressed to a different service.", `audience ${request.audience} != ${ctx.audience}`];
      if (request.leafId !== leaf.id) return [false, "The request does not reference the last mandate in the chain.", `leafId ${request.leafId} != ${leaf.id}`];
      const signer = await recoverTypedDataAddress({ domain: ctx.domain, types: EIP712_TYPES, primaryType: "ExecutionRequest", message: request, signature: request.sig });
      if (!isAddressEqual(signer, leaf.subject)) return [false, "The request was not signed by the agent holding the final mandate.", `signer ${signer} != leaf subject ${leaf.subject}`];
      return [true, `Signed by ${leaf.subjectName}, the agent holding the final mandate.`, signer];
    }))
  )
    return res;

  // 8 within leaf scope
  if (
    !(await step("leaf_scope", () => {
      const s = leaf.scope;
      if (!s.actions.includes(request.action)) return [false, `Action "${request.action}" is not allowed.`, `allowed: ${s.actions.join(",")}`];
      if (!s.targets.includes("*") && !s.targets.includes(request.target)) return [false, `Paying "${request.target}" is not allowed.`, `allowed: ${s.targets.join(",")}`];
      if (request.amount > s.maxAmount) {
        res.violations.push({ dimension: "maxAmount", reason: "request amount exceeds leaf per-request ceiling", parentValue: s.maxAmount.toString(), childValue: request.amount.toString(), edgeIndex: chain.length - 1 });
        return [false, `Asked for ${fmt(request.amount)} but only ${fmt(s.maxAmount)} is allowed.`, `${request.amount} > ${s.maxAmount}`];
      }
      return [true, `${fmt(request.amount)} to ${request.target} is within the mandate.`, `ceiling ${s.maxAmount}`];
    }))
  )
    return res;

  // 9 World approval above threshold (never widens scope: runs after scope checks)
  res.needsWorldApproval = request.amount > ctx.worldThreshold;
  if (
    !(await step("world_approval", async () => {
      if (!res.needsWorldApproval) return [true, "Below the human-approval threshold.", `${request.amount} <= ${ctx.worldThreshold}`];
      if (!request.worldApprovalRef) return [false, "This amount needs a fresh approval from the verified human.", "no worldApprovalRef"];
      const a = await ctx.lookupWorldApproval(request.worldApprovalRef);
      if (!a) return [false, "The human approval could not be found.", request.worldApprovalRef];
      if (a.requestHash !== res.requestHash) return [false, "The human approved a different request.", `approval bound to ${a.requestHash}`];
      if (a.consumed) return [false, "The human approval was already used.", request.worldApprovalRef];
      if (a.approvedAt + ctx.worldApprovalTtlSec < ctx.now || a.approvedAt > ctx.now + 60n) return [false, "The human approval is no longer fresh.", `approvedAt ${a.approvedAt}`];
      return [true, "A verified human approved exactly this request.", request.worldApprovalRef];
    }))
  )
    return res;

  res.ok = true;
  return res;
}
