import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, type Address, type Hex } from "viem";
import {
  ROOT_PARENT, delegationToWire, hashRequest, mandateDomain, requestToWire, signDelegation, signRequest, type ServiceConfig,
} from "@mandate/core";
import { createApp, execute, linkMessage, migrateWorld, openDb, worldRouter, type ChainPort, type Deps, type IdClaims, type WorldConfig } from "../src/index.js";

const USDC = 1_000_000n;
const REG: Address = "0x00000000000000000000000000000000000000aa";
const domain = mandateDomain(11155111, REG);
const acct = () => privateKeyToAccount(generatePrivateKey());
const owner = acct(), ops = acct(), settle = acct(), stranger = acct();
const ISS = "https://sandbox.auth.world.org";
const ACR = "https://world.org/oidc/acr/orb";
let clock = 1_800_000_000;
const now = () => clock;

const cfg = {
  CHAIN_ID: 11155111, SEPOLIA_RPC_URL: "http://x", USDC_ADDRESS: REG, REVOCATION_REGISTRY_ADDRESS: REG, SERVICE_PRIVATE_KEY: generatePrivateKey(),
  SERVICE_AUDIENCE: "svc", SERVICE_PORT: 0, SERVICE_DB_PATH: ":memory:", PINNED_ROOT_ISSUER: owner.address, WORLD_THRESHOLD_USDC_MINOR: 2n * USDC,
  MAX_REQUEST_TTL_SEC: 300n, WORLD_APPROVAL_TTL_SEC: 300n, WORLD_ACCEPTED_ACR: ACR, TARGETS_JSON: { "supplier-A": "0x00000000000000000000000000000000000000bb" },
} satisfies ServiceConfig;
const wcfg: WorldConfig = { issuer: ISS, clientId: "cid", clientSecret: "s", redirectUri: "https://cb/", acceptedAcr: [ACR], pinnedRoot: owner.address, attemptTtlSec: 600 };

// Fake OIDC: the test decides what the verified ID token contains for each code.
const claimsFor = new Map<string, (nonce: string) => IdClaims>();
const oidc = {
  authorizeEndpoint: async () => `${ISS}/api/v1/authorize`,
  redeem: async (code: string) => {
    const f = claimsFor.get(code);
    if (!f) throw new Error("invalid_grant");
    return f(lastNonce);
  },
};
let lastNonce = "";

let balance: bigint;
const chain: ChainPort = {
  anyRevoked: async () => false,
  usdcBalance: async () => balance,
  signTransfer: async (_t, amount) => { const raw = toHex(`tx-${Math.random()}`) as Hex; pend.set(keccak256(raw), amount); return { hash: keccak256(raw), raw }; },
  broadcast: async (raw) => { const a = pend.get(keccak256(raw)); if (a) { balance -= a; pend.delete(keccak256(raw)); } },
  waitFor: async () => "confirmed",
};
const pend = new Map<Hex, bigint>();

let deps: Deps, base: string, server: ReturnType<ReturnType<typeof createApp>["listen"]>;
beforeEach(async () => {
  balance = 20n * USDC;
  const db = openDb(":memory:");
  migrateWorld(db);
  deps = { cfg, db, chain, now: () => BigInt(clock), events: new EventEmitter() };
  server = createApp(deps, worldRouter({ db, cfg: wcfg, oidc, now, events: deps.events })).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => void server.close());

const human = (sub: string, over: Partial<IdClaims> = {}) => (nonce: string) => ({ iss: ISS, sub, nonce, acr: ACR, auth_time: clock, ...over });

/** Follow /world/... to the authorize URL, return its state; remember its nonce for the fake IdP. */
async function startUrl(r: Response) {
  const loc = r.headers.get("location") ?? ((await r.json()) as any).url;
  const u = new URL(loc);
  expect(u.searchParams.get("max_age")).toBe("0");
  expect(JSON.parse(u.searchParams.get("claims")!).id_token.acr.essential).toBe(true);
  lastNonce = u.searchParams.get("nonce")!;
  return u.searchParams.get("state")!;
}
const callback = (q: Record<string, string>) => fetch(`${base}/world/callback?${new URLSearchParams(q)}`);

async function link(sub = "human-1") {
  const sig = await owner.signMessage({ message: linkMessage(owner.address, clock) });
  const state = await startUrl(await fetch(`${base}/world/link/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ts: clock, sig }) }));
  claimsFor.set("c-link", human(sub));
  return callback({ code: "c-link", state });
}

async function pendingRequest() {
  const scope = { actions: ["pay"], maxAmount: 150n * USDC, expiry: BigInt(clock + 3600), targets: ["supplier-A"] };
  const d0 = await signDelegation(owner, domain, { parent: ROOT_PARENT, subject: ops.address, issuerName: "t", subjectName: "o", scope, nonce: keccak256("0x01") });
  const d1 = await signDelegation(ops, domain, { parent: d0.id, subject: settle.address, issuerName: "o", subjectName: "s", scope, nonce: keccak256("0x02") });
  const r = { leafId: d1.id, audience: "svc", action: "pay", amount: 5n * USDC, target: "supplier-A", nonce: keccak256(toHex(String(Math.random()))), deadline: BigInt(clock + 250) };
  const body = async (ref?: string) => ({ chain: [d0, d1].map(delegationToWire), request: requestToWire(await signRequest(settle, domain, r, ref)) });
  const first = await execute(await body(), deps);
  expect(first.decision).toBe("PENDING");
  return { h: hashRequest(domain, r), body };
}
const approveStart = (h: string) => fetch(`${base}/world/approve?requestHash=${h}`, { redirect: "manual" });
const refFor = async (h: string) => ((await (await fetch(`${base}/world/approvals?requestHash=${h}`)).json()) as any[])[0];

describe("World Agent Pass step-up", () => {
  it("link requires the pinned root's wallet signature", async () => {
    const sig = await stranger.signMessage({ message: linkMessage(owner.address, clock) });
    const r = await fetch(`${base}/world/link/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ts: clock, sig }) });
    expect(r.status).toBe(403);
  });

  it("full journey: link -> pending request -> fresh approval -> EXECUTED once; approval single-use", async () => {
    expect((await link()).status).toBe(200);
    const { h, body } = await pendingRequest();
    claimsFor.set("c-ok", human("human-1"));
    expect((await callback({ code: "c-ok", state: await startUrl(await approveStart(h)) })).status).toBe(200);
    const ref = await refFor(h);
    expect(ref.status).toBe("approved");
    const ok = await execute(await body(ref.ref), deps);
    expect(ok.decision).toBe("EXECUTED");
    expect(balance).toBe(15n * USDC);
    const again = await execute(await body(ref.ref), deps);
    expect(again.decision).toBe("DENIED");
    expect(balance).toBe(15n * USDC);
  });

  it.each([
    ["wrong World account", "c-x", human("someone-else")],
    ["stale authentication", "c-x", human("human-1", { auth_time: clock - 3600 })],
    ["unaccepted acr", "c-x", human("human-1", { acr: "https://world.org/oidc/acr/selfie" })],
    ["nonce mismatch", "c-x", (_n: string) => ({ iss: ISS, sub: "human-1", nonce: "other", acr: ACR, auth_time: clock })],
  ])("deny path: %s -> not approved, no money moved", async (_n, code, f) => {
    await link();
    const { h, body } = await pendingRequest();
    claimsFor.set(code, f as any);
    const r = await callback({ code, state: await startUrl(await approveStart(h)) });
    expect(r.status).toBe(403);
    const row = await refFor(h);
    expect(row.status).toBe("denied");
    expect((await execute(await body(row.ref), deps)).decision).toBe("DENIED");
    expect(balance).toBe(20n * USDC);
  });

  it("cancel at World (error=access_denied) -> denied with reason, no side effect", async () => {
    await link();
    const { h } = await pendingRequest();
    const state = await startUrl(await approveStart(h));
    const r = await callback({ error: "access_denied", state });
    expect(r.status).toBe(403);
    expect(await r.text()).toContain("access_denied");
    expect((await refFor(h)).status).toBe("denied");
    expect(balance).toBe(20n * USDC);
  });

  it("expired attempt and reused state are refused", async () => {
    await link();
    const { h } = await pendingRequest();
    const state = await startUrl(await approveStart(h));
    clock += 700;
    claimsFor.set("c-late", human("human-1"));
    expect((await callback({ code: "c-late", state })).status).toBe(403);
    expect((await callback({ code: "c-late", state })).status).toBe(400); // state already used
  });

  it("cannot start an approval for a hash that is not pending", async () => {
    await link();
    expect((await approveStart("0x" + "ab".repeat(32))).status).toBe(404);
  });

  it("one human, one root: a World ID linked to another root is refused", async () => {
    deps.db.prepare("INSERT INTO world_identities (root_issuer, iss, sub, linked_at) VALUES (?, ?, ?, ?)").run("0xother", ISS, "human-1", clock);
    expect((await link("human-1")).status).toBe(403);
  });
});
