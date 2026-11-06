import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, type Hex } from "viem";
import {
  ROOT_PARENT,
  delegationToWire,
  hashRequest,
  mandateDomain,
  requestToWire,
  signDelegation,
  signRequest,
  verifyExecution,
  type Delegation,
  type Scope,
  type VerifyContext,
  type WorldApprovalRecord,
} from "../src/index";

const USDC = 1_000_000n;
const NOW = 1_800_000_000n;
const domain = mandateDomain(11155111, "0x00000000000000000000000000000000000000aa");
const acct = () => privateKeyToAccount(generatePrivateKey());
const owner = acct(), ops = acct(), procure = acct(), settle = acct(), stranger = acct();
let n = 0;
const nonce = (): Hex => keccak256(toHex(`nonce-${n++}`));
const scope = (max: bigint, o: Partial<Scope> = {}): Scope => ({
  actions: ["pay"], maxAmount: max * USDC, expiry: NOW + 3600n, targets: ["supplier-A"], ...o,
});

async function buildChain(over: { settleScope?: Scope; procureScope?: Scope } = {}) {
  const d0 = await signDelegation(owner, domain, { parent: ROOT_PARENT, subject: ops.address, issuerName: "treasury.root.eth", subjectName: "ops.treasury.root.eth", scope: scope(500n), nonce: nonce() });
  const d1 = await signDelegation(ops, domain, { parent: d0.id, subject: procure.address, issuerName: d0.subjectName, subjectName: "procure.ops.treasury.root.eth", scope: over.procureScope ?? scope(300n), nonce: nonce() });
  const d2 = await signDelegation(procure, domain, { parent: d1.id, subject: settle.address, issuerName: d1.subjectName, subjectName: "settle.procure.ops.treasury.root.eth", scope: over.settleScope ?? scope(150n), nonce: nonce() });
  return [d0, d1, d2];
}

const approvals = new Map<string, WorldApprovalRecord>();
const ctx: VerifyContext = {
  domain, pinnedRoot: owner.address, audience: "svc", now: NOW, maxRequestTtlSec: 300n,
  worldThreshold: 15n * USDC, worldApprovalTtlSec: 120n,
  lookupWorldApproval: async (ref) => approvals.get(ref),
};

const baseReq = (leaf: Delegation, amount = 10n * USDC) => ({
  leafId: leaf.id, audience: "svc", action: "pay", amount, target: "supplier-A", nonce: nonce(), deadline: NOW + 60n,
});

async function body(chain: Delegation[], req = baseReq(chain.at(-1)!), signer = settle, ref?: string) {
  const r = await signRequest(signer, domain, req, ref);
  return { chain: chain.map(delegationToWire), request: requestToWire(r) };
}

const failedAt = (r: Awaited<ReturnType<typeof verifyExecution>>) => r.checks.find((c) => !c.ok)?.name;

describe("verifyExecution matrix", () => {
  it("valid chain + request below threshold passes all checks", async () => {
    const r = await verifyExecution(await body(await buildChain()), ctx);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(["schema", "root", "signatures", "continuity", "narrowing", "freshness", "audience_signer", "leaf_scope", "world_approval"]);
  });

  it("injected invoice: settle asks 450 with 150 ceiling -> denied at leaf_scope with violation", async () => {
    const c = await buildChain();
    const r = await verifyExecution(await body(c, baseReq(c[2]!, 450n * USDC)), ctx);
    expect(r.ok).toBe(false);
    expect(failedAt(r)).toBe("leaf_scope");
    expect(r.checks.at(-1)!.plainEnglish).toBe("Asked for 450.00 USDC but only 150.00 USDC is allowed.");
    expect(r.violations[0]).toMatchObject({ dimension: "maxAmount", childValue: "450000000" });
  });

  it("injected delegation: procure grants settle 1000 -> denied at narrowing, edge 1", async () => {
    const c = await buildChain({ settleScope: scope(1000n) });
    const r = await verifyExecution(await body(c, baseReq(c[2]!, 450n * USDC)), ctx);
    expect(failedAt(r)).toBe("narrowing");
    expect(r.violations).toEqual([expect.objectContaining({ dimension: "maxAmount", edgeIndex: 1 })]);
  });

  it.each([
    ["changed target", { targets: ["supplier-B"] }, "targets"],
    ["changed action", { actions: ["withdraw"] }, "actions"],
    ["expiry beyond parent", { expiry: NOW + 7200n }, "expiry"],
  ] as const)("%s -> narrowing violation", async (_n, o, dim) => {
    const c = await buildChain({ settleScope: scope(150n, o as Partial<Scope>) });
    const r = await verifyExecution(await body(c), ctx);
    expect(failedAt(r)).toBe("narrowing");
    expect(r.violations.map((v) => v.dimension)).toContain(dim);
  });

  it("wrong signer on a delegation -> signatures", async () => {
    const c = await buildChain();
    const forged = await signDelegation(stranger, domain, { parent: c[1]!.id, subject: settle.address, issuerName: c[1]!.subjectName, subjectName: c[2]!.subjectName, scope: scope(150n), nonce: nonce() });
    const tampered = { ...forged, issuer: procure.address }; // claims procure issued it
    const r = await verifyExecution(await body([c[0]!, c[1]!, tampered]), ctx);
    expect(failedAt(r)).toBe("signatures");
  });

  it("tampered scope after signing -> signatures (id mismatch)", async () => {
    const c = await buildChain();
    const t = { ...c[2]!, scope: scope(1000n) };
    const r = await verifyExecution(await body([c[0]!, c[1]!, t]), ctx);
    expect(failedAt(r)).toBe("signatures");
  });

  it("substituted parent -> continuity", async () => {
    const a = await buildChain();
    const b = await buildChain();
    const r = await verifyExecution(await body([a[0]!, a[1]!, b[2]!]), ctx);
    expect(failedAt(r)).toBe("continuity");
  });

  it("root not pinned -> root", async () => {
    const r = await verifyExecution(await body(await buildChain()), { ...ctx, pinnedRoot: stranger.address });
    expect(failedAt(r)).toBe("root");
  });

  it("first link not a root -> root", async () => {
    const c = await buildChain();
    const r = await verifyExecution(await body(c.slice(1)), ctx);
    expect(failedAt(r)).toBe("root");
  });

  it("request signed by non-leaf (procure) -> audience_signer", async () => {
    const r = await verifyExecution(await body(await buildChain(), undefined, procure), ctx);
    // body() built req for chain leaf; signer differs
    expect(failedAt(r)).toBe("audience_signer");
  });

  it("wrong audience -> audience_signer", async () => {
    const c = await buildChain();
    const r = await verifyExecution(await body(c, { ...baseReq(c[2]!), audience: "other-svc" }), ctx);
    expect(failedAt(r)).toBe("audience_signer");
  });

  it("expired chain / expired request / far-future deadline -> freshness", async () => {
    const c = await buildChain();
    expect(failedAt(await verifyExecution(await body(c), { ...ctx, now: NOW + 4000n }))).toBe("freshness");
    expect(failedAt(await verifyExecution(await body(c, { ...baseReq(c[2]!), deadline: NOW - 1n }), ctx))).toBe("freshness");
    expect(failedAt(await verifyExecution(await body(c, { ...baseReq(c[2]!), deadline: NOW + 10_000n }), ctx))).toBe("freshness");
  });

  it("unknown fields -> schema", async () => {
    const b = await body(await buildChain());
    const r = await verifyExecution({ ...b, request: { ...b.request, bonus: "1" } }, ctx);
    expect(failedAt(r)).toBe("schema");
  });

  describe("World approval above 15 USDC", () => {
    it("missing -> denied, flagged as needing approval", async () => {
      const c = await buildChain();
      const r = await verifyExecution(await body(c, baseReq(c[2]!, 100n * USDC)), ctx);
      expect(failedAt(r)).toBe("world_approval");
      expect(r.needsWorldApproval).toBe(true);
    });

    it("bound to this request + fresh -> ok; stale, consumed, other request -> denied", async () => {
      const c = await buildChain();
      const req = baseReq(c[2]!, 100n * USDC);
      const h = hashRequest(domain, req);
      approvals.set("good", { requestHash: h, approvedAt: NOW - 10n, consumed: false });
      approvals.set("stale", { requestHash: h, approvedAt: NOW - 1000n, consumed: false });
      approvals.set("used", { requestHash: h, approvedAt: NOW - 10n, consumed: true });
      approvals.set("other", { requestHash: keccak256("0x01"), approvedAt: NOW - 10n, consumed: false });
      expect((await verifyExecution(await body(c, req, settle, "good"), ctx)).ok).toBe(true);
      for (const ref of ["stale", "used", "other", "missing"]) {
        expect(failedAt(await verifyExecution(await body(c, req, settle, ref), ctx))).toBe("world_approval");
      }
    });

    it("approval never widens scope: approved 450 still denied at leaf_scope", async () => {
      const c = await buildChain();
      const req = baseReq(c[2]!, 450n * USDC);
      approvals.set("wide", { requestHash: hashRequest(domain, req), approvedAt: NOW, consumed: false });
      expect(failedAt(await verifyExecution(await body(c, req, settle, "wide"), ctx))).toBe("leaf_scope");
    });

    it("lookup throws -> denied (fails closed)", async () => {
      const c = await buildChain();
      const r = await verifyExecution(await body(c, baseReq(c[2]!, 100n * USDC), settle, "x"), {
        ...ctx, lookupWorldApproval: async () => { throw new Error("db down"); },
      });
      expect(failedAt(r)).toBe("world_approval");
      expect(r.ok).toBe(false);
    });
  });

  it("cycle: agent delegates back to an ancestor -> continuity", async () => {
    const c = await buildChain();
    const loop = await signDelegation(settle, domain, { parent: c[2]!.id, subject: ops.address, issuerName: c[2]!.subjectName, subjectName: "ops.treasury.root.eth", scope: scope(100n), nonce: nonce() });
    const r = await verifyExecution(await body([...c, loop], baseReq(loop), ops), ctx);
    expect(failedAt(r)).toBe("continuity");
  });
});

import { verifyChain } from "../src/index";
describe("verifyChain (registry/CLI, no request)", () => {
  const cctx = { domain, pinnedRoot: owner.address, now: NOW };
  it("valid chain -> ok", async () => {
    expect((await verifyChain(await buildChain(), cctx)).ok).toBe(true);
  });
  it("widened edge -> narrowing violation with edge index", async () => {
    const r = await verifyChain(await buildChain({ settleScope: scope(1000n) }), cctx);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatchObject({ edgeIndex: 1, dimension: "maxAmount" });
  });
  it("expired -> expired flag", async () => {
    const r = await verifyChain(await buildChain(), { ...cctx, now: NOW + 7200n });
    expect(r).toMatchObject({ ok: false, expired: true });
  });
  it("unpinned root / empty chain -> not ok", async () => {
    expect((await verifyChain(await buildChain(), { ...cctx, pinnedRoot: stranger.address })).ok).toBe(false);
    expect((await verifyChain([], cctx)).ok).toBe(false);
  });
});
