import { EventEmitter } from "node:events";
import { describe, expect, it, beforeEach } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, type Address, type Hex } from "viem";
import {
  ROOT_PARENT, delegationToWire, hashRequest, mandateDomain, requestToWire, signDelegation, signRequest,
  type Delegation, type Scope, type ServiceConfig,
} from "@mandate/core";
import { openDb, execute, type ChainPort, type Deps } from "../src/index";

const USDC = 1_000_000n;
const NOW = 1_800_000_000n;
const REGISTRY: Address = "0x00000000000000000000000000000000000000aa";
const PAYEE: Address = "0x00000000000000000000000000000000000000bb";
const domain = mandateDomain(11155111, REGISTRY);
const acct = () => privateKeyToAccount(generatePrivateKey());
const owner = acct(), ops = acct(), procure = acct(), settle = acct();
let n = 0;
const nonce = (): Hex => keccak256(toHex(`n-${n++}-${Math.random()}`));
const scope = (max: bigint): Scope => ({ actions: ["pay"], maxAmount: max * USDC, expiry: NOW + 3600n, targets: ["supplier-A"] });

async function chain3(): Promise<Delegation[]> {
  const d0 = await signDelegation(owner, domain, { parent: ROOT_PARENT, subject: ops.address, issuerName: "t.eth", subjectName: "ops.t.eth", scope: scope(500n), nonce: nonce() });
  const d1 = await signDelegation(ops, domain, { parent: d0.id, subject: procure.address, issuerName: "ops.t.eth", subjectName: "procure.ops.t.eth", scope: scope(300n), nonce: nonce() });
  const d2 = await signDelegation(procure, domain, { parent: d1.id, subject: settle.address, issuerName: "procure.ops.t.eth", subjectName: "settle.procure.ops.t.eth", scope: scope(150n), nonce: nonce() });
  return [d0, d1, d2];
}
const req = (leaf: Delegation, amount: bigint) => ({ leafId: leaf.id, audience: "svc", action: "pay", amount, target: "supplier-A", nonce: nonce(), deadline: NOW + 60n });
const wire = async (c: Delegation[], r: ReturnType<typeof req>, ref?: string) => ({ chain: c.map(delegationToWire), request: requestToWire(await signRequest(settle, domain, r, ref)) });

/** In-memory chain: tracks the service balance; transfers only happen via broadcast. */
function fakeChain(over: Partial<ChainPort> = {}) {
  const s = { balance: 20n * USDC, revoked: new Set<string>(), broadcasts: 0, pending: new Map<Hex, bigint>() };
  const port: ChainPort = {
    anyRevoked: async (issuers, ids) => ids.some((id, i) => s.revoked.has(`${issuers[i]!.toLowerCase()}:${id}`)),
    usdcBalance: async () => s.balance,
    signTransfer: async (_to, amount) => {
      const raw = toHex(`tx-${Math.random()}`) as Hex;
      s.pending.set(keccak256(raw), amount);
      return { hash: keccak256(raw), raw };
    },
    broadcast: async (raw) => {
      const h = keccak256(raw);
      const amt = s.pending.get(h);
      if (amt !== undefined) { s.balance -= amt; s.pending.delete(h); s.broadcasts++; }
    },
    waitFor: async () => "confirmed",
    ...over,
  };
  return { s, port };
}

const cfg = {
  CHAIN_ID: 11155111, SEPOLIA_RPC_URL: "http://x", USDC_ADDRESS: REGISTRY, REVOCATION_REGISTRY_ADDRESS: REGISTRY,
  SERVICE_PRIVATE_KEY: generatePrivateKey(), SERVICE_AUDIENCE: "svc", SERVICE_PORT: 0, SERVICE_DB_PATH: ":memory:",
  PINNED_ROOT_ISSUER: owner.address, WORLD_THRESHOLD_USDC_MINOR: 2n * USDC, MAX_REQUEST_TTL_SEC: 300n, WORLD_APPROVAL_TTL_SEC: 300n,
  WORLD_ACCEPTED_ACR: "https://world.org/oidc/acr/orb",
  TARGETS_JSON: { "supplier-A": PAYEE },
} satisfies ServiceConfig;

let deps: Deps;
let fc: ReturnType<typeof fakeChain>;
beforeEach(() => {
  fc = fakeChain();
  deps = { cfg, db: openDb(":memory:"), chain: fc.port, now: () => NOW, events: new EventEmitter() };
});

const approve = (requestHash: Hex, ref = "ref-1") =>
  deps.db.prepare("INSERT INTO world_approvals (ref, request_hash, approved_at, status, started_at) VALUES (?, ?, ?, 'approved', ?)").run(ref, requestHash, Number(NOW - 5n), Number(NOW - 30n));

describe("payment-service execute", () => {
  it("below threshold: EXECUTED, money moves once", async () => {
    const c = await chain3();
    const r = await execute(await wire(c, req(c[2]!, 1n * USDC)), deps);
    expect(r.decision).toBe("EXECUTED");
    expect(r.txHash).toMatch(/^0x/);
    expect(fc.s.balance).toBe(19n * USDC);
    expect(r.balanceBefore).toBe("20000000");
    expect(r.balanceAfter).toBe("19000000");
  });

  it("above threshold without approval: PENDING, nonce NOT consumed, no money moved; then approved -> EXECUTED", async () => {
    const c = await chain3();
    const r0 = req(c[2]!, 5n * USDC);
    const p = await execute(await wire(c, r0), deps);
    expect(p.decision).toBe("PENDING");
    expect(fc.s.balance).toBe(20n * USDC);
    approve(hashRequest(domain, r0));
    const ok = await execute(await wire(c, r0, "ref-1"), deps);
    expect(ok.decision).toBe("EXECUTED");
    expect(fc.s.balance).toBe(15n * USDC);
  });

  it("injected 450 -> DENIED, balance unchanged, nothing broadcast", async () => {
    const c = await chain3();
    const r = await execute(await wire(c, req(c[2]!, 450n * USDC)), deps);
    expect(r.decision).toBe("DENIED");
    expect(fc.s.broadcasts).toBe(0);
    expect(r.balanceAfter).toBe(r.balanceBefore);
  });

  it("replay -> DENIED at nonce; balance moved only once", async () => {
    const c = await chain3();
    const body = await wire(c, req(c[2]!, 1n * USDC));
    expect((await execute(body, deps)).decision).toBe("EXECUTED");
    const again = await execute(body, deps);
    expect(again.decision).toBe("DENIED");
    expect(again.checks.at(-1)!.name).toBe("nonce");
    expect(fc.s.balance).toBe(19n * USDC);
  });

  it("concurrent replay: 5 parallel copies -> exactly one EXECUTED", async () => {
    const c = await chain3();
    const body = await wire(c, req(c[2]!, 1n * USDC));
    const rs = await Promise.all(Array.from({ length: 5 }, () => execute(body, deps)));
    expect(rs.filter((r) => r.decision === "EXECUTED")).toHaveLength(1);
    expect(fc.s.broadcasts).toBe(1);
    expect(fc.s.balance).toBe(19n * USDC);
  });

  it("World approval is single-use: a second request reusing it is denied", async () => {
    const c = await chain3();
    const r0 = req(c[2]!, 5n * USDC);
    approve(hashRequest(domain, r0));
    expect((await execute(await wire(c, r0, "ref-1"), deps)).decision).toBe("EXECUTED");
    const r1 = { ...r0, nonce: nonce() }; // different request -> different hash -> approval doesn't match
    expect((await execute(await wire(c, r1, "ref-1"), deps)).decision).toBe("DENIED");
    expect(fc.s.balance).toBe(15n * USDC);
  });

  it("revoked ancestor (ops root link) -> DENIED, balance unchanged", async () => {
    const c = await chain3();
    fc.s.revoked.add(`${owner.address.toLowerCase()}:${c[0]!.id}`);
    const r = await execute(await wire(c, req(c[2]!, 1n * USDC)), deps);
    expect(r.decision).toBe("DENIED");
    expect(r.checks.at(-1)).toMatchObject({ name: "revocation", ok: false });
    expect(fc.s.balance).toBe(20n * USDC);
  });

  it("revocation read failure -> DENIED (fails closed), balance unchanged", async () => {
    fc = fakeChain({ anyRevoked: async () => { throw new Error("rpc timeout"); } });
    deps.chain = fc.port;
    const c = await chain3();
    const r = await execute(await wire(c, req(c[2]!, 1n * USDC)), deps);
    expect(r.decision).toBe("DENIED");
    expect(r.checks.at(-1)!.name).toBe("revocation");
    expect(fc.s.broadcasts).toBe(0);
  });

  it("tx hash is persisted BEFORE broadcast; timeout -> PENDING with same hash", async () => {
    let seenAtBroadcast: unknown;
    const base = fakeChain();
    fc = fakeChain({
      broadcast: async (raw) => {
        seenAtBroadcast = deps.db.prepare("SELECT tx_hash, tx_status FROM requests WHERE tx_hash = ?").get(keccak256(raw));
        await base.port.broadcast(raw);
      },
      signTransfer: base.port.signTransfer,
      waitFor: async () => "pending",
    });
    deps.chain = fc.port;
    const c = await chain3();
    const r = await execute(await wire(c, req(c[2]!, 1n * USDC)), deps);
    expect(r.decision).toBe("PENDING");
    expect(seenAtBroadcast).toMatchObject({ tx_hash: r.txHash, tx_status: "signed" });
  });

  it("unknown payee target in service config -> DENIED", async () => {
    deps.cfg = { ...cfg, TARGETS_JSON: {} };
    const c = await chain3();
    const r = await execute(await wire(c, req(c[2]!, 1n * USDC)), deps);
    expect(r.decision).toBe("DENIED");
    expect(fc.s.broadcasts).toBe(0);
  });
});

describe("decision receipts", () => {
  it("published for final verdicts on signed chains; not for PENDING or unsigned garbage", async () => {
    const jobs: any[] = [];
    deps.publishReceipt = async (j) => (jobs.push(j), "0xkey");
    const c = await chain3();
    await execute(await wire(c, req(c[2]!, 450n * USDC)), deps); // DENIED
    await execute(await wire(c, req(c[2]!, 1n * USDC)), deps); // EXECUTED
    await execute(await wire(c, req(c[2]!, 5n * USDC)), deps); // PENDING
    await execute({ chain: [], request: {} }, deps); // garbage
    await new Promise((r) => setTimeout(r, 10));
    expect(jobs.map((j) => j.decision)).toEqual(["DENIED", "EXECUTED"]);
    expect(jobs[0]).toMatchObject({ failedCheck: "leaf_scope", leafName: "settle.procure.ops.t.eth", amount: 450n * USDC });
    expect(JSON.stringify(jobs, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/INVOICE/);
  });
});
