import { EventEmitter } from "node:events";
import type { Hex } from "viem";
import { mandateDomain, verifyExecution, type Check, type ServiceConfig, type Violation } from "@mandate/core";
import type { ChainPort } from "./chain.js";
import { consumeNonce, type Db, type Decision } from "./db.js";

export interface ExecuteResponse {
  decision: Decision;
  checks: Check[];
  violations: Violation[];
  requestHash?: Hex;
  txHash?: Hex;
  balanceBefore: string | null;
  balanceAfter: string | null;
  reason?: string;
}

export interface Deps {
  cfg: ServiceConfig;
  db: Db;
  chain: ChainPort;
  now: () => bigint;
  events: EventEmitter;
  receiptTimeoutMs?: number;
  /** Optional: publish a public decision receipt (e.g. to Arkiv). Must not throw into the request path. */
  publishReceipt?: (r: ReceiptJob) => Promise<string>;
}

export interface ReceiptJob {
  requestHash: string; decision: "EXECUTED" | "DENIED"; failedCheck: string; rootId: string; leafId: string;
  leafSubject: `0x${string}`; leafName: string; amount: bigint; target: string; txHash: string; at: number;
  checks: Check[]; violations: Violation[];
}

// Serialize sign+broadcast so two concurrent transfers never reuse the service account's tx nonce.
let txQueue: Promise<unknown> = Promise.resolve();
const withTxLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = txQueue.then(fn, fn);
  txQueue = run.catch(() => undefined);
  return run;
};

const safeBalance = async (chain: ChainPort) => {
  try {
    return (await chain.usdcBalance()).toString();
  } catch {
    return null;
  }
};

export async function execute(raw: unknown, d: Deps): Promise<ExecuteResponse> {
  const { cfg, db, chain } = d;
  const now = d.now();
  const balanceBefore = await safeBalance(chain);

  const v = await verifyExecution(raw, {
    domain: mandateDomain(cfg.CHAIN_ID, cfg.REVOCATION_REGISTRY_ADDRESS),
    pinnedRoot: cfg.PINNED_ROOT_ISSUER,
    audience: cfg.SERVICE_AUDIENCE,
    now,
    maxRequestTtlSec: cfg.MAX_REQUEST_TTL_SEC,
    worldThreshold: cfg.WORLD_THRESHOLD_USDC_MINOR,
    worldApprovalTtlSec: cfg.WORLD_APPROVAL_TTL_SEC,
    lookupWorldApproval: async (ref) => {
      const row = db.prepare("SELECT request_hash, approved_at, consumed FROM world_approvals WHERE ref = ? AND status = 'approved'").get(ref) as
        | { request_hash: Hex; approved_at: number; consumed: number }
        | undefined;
      return row && { requestHash: row.request_hash, approvedAt: BigInt(row.approved_at), consumed: row.consumed === 1 };
    },
  });
  const checks = [...v.checks];
  const violations = [...v.violations];

  const finish = async (decision: Decision, extra: Partial<ExecuteResponse> = {}, rowId?: number): Promise<ExecuteResponse> => {
    const res: ExecuteResponse = {
      decision, checks, violations, requestHash: v.requestHash, balanceBefore,
      balanceAfter: await safeBalance(chain), ...extra,
    };
    const json = JSON.stringify(res);
    if (rowId !== undefined) db.prepare("UPDATE requests SET decision = ?, response = ? WHERE id = ?").run(decision, json, rowId);
    else
      db.prepare("INSERT INTO requests (created_at, request_hash, leaf_subject, amount, target, decision, response) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        Number(now), v.requestHash ?? null, v.chain?.at(-1)?.subject ?? null, v.request?.amount.toString() ?? null, v.request?.target ?? null, decision, json,
      );
    d.events.emit("request", res);
    // Public receipt only for final verdicts on requests whose chain signatures verified (no cost for unsigned spam).
    const sigOk = checks.some((c) => c.name === "signatures" && c.ok);
    if (d.publishReceipt && decision !== "PENDING" && sigOk && v.request && v.chain && v.requestHash) {
      const leaf = v.chain.at(-1)!;
      const job: ReceiptJob = {
        requestHash: v.requestHash, decision, failedCheck: checks.find((c) => !c.ok)?.name ?? "", rootId: v.chain[0]!.id, leafId: leaf.id,
        leafSubject: leaf.subject, leafName: leaf.subjectName, amount: v.request.amount, target: v.request.target, txHash: res.txHash ?? "",
        at: Number(now), checks, violations,
      };
      d.publishReceipt(job).then(
        (key) => {
          db.prepare("UPDATE requests SET arkiv_key = ? WHERE request_hash = ? AND decision = ?").run(key, v.requestHash!, decision);
          d.events.emit("receipt", { requestHash: v.requestHash, decision, entityKey: key });
        },
        (e) => console.error("receipt publish failed:", String(e).slice(0, 200)),
      );
    }
    return res;
  };
  const deny = (name: string, plainEnglish: string, detail: string) => {
    checks.push({ name, ok: false, plainEnglish, detail });
    return finish("DENIED");
  };

  if (!v.ok) {
    // Missing (not invalid) World approval for an otherwise valid request -> PENDING: human step-up can follow.
    const failed = checks.find((c) => !c.ok);
    const pending = failed?.name === "world_approval" && v.needsWorldApproval && !v.request?.worldApprovalRef;
    return finish(pending ? "PENDING" : "DENIED", pending ? { reason: "needs_world_approval" } : {});
  }
  const chainLinks = v.chain!;
  const request = v.request!;
  const requestHash = v.requestHash!;

  const payee = cfg.TARGETS_JSON[request.target];
  if (!payee) return deny("payee", "This service has no payout address for that supplier.", request.target);

  // 10 nonce (+ World approval) consumed atomically
  if (!consumeNonce(db, request.nonce, requestHash, Number(now), v.needsWorldApproval ? request.worldApprovalRef : undefined))
    return deny("nonce", "This request was already used. Replays are refused.", request.nonce);
  checks.push({ name: "nonce", ok: true, plainEnglish: "First time this request has been seen.", detail: request.nonce });

  // 11 revocation (read failure = deny)
  let revoked: boolean;
  try {
    revoked = await chain.anyRevoked(chainLinks.map((l) => l.issuer), chainLinks.map((l) => l.id));
  } catch (e) {
    return deny("revocation", "Could not confirm the mandates are still valid, so the request is denied.", String(e).slice(0, 300));
  }
  if (revoked) return deny("revocation", "A mandate in this chain was revoked onchain.", cfg.REVOCATION_REGISTRY_ADDRESS);
  checks.push({ name: "revocation", ok: true, plainEnglish: "No mandate in the chain has been revoked.", detail: `${chainLinks.length} links checked onchain` });

  // 12 transfer with the SERVICE key; persist hash before broadcast; never re-sign
  return withTxLock(async () => {
    let signed: { hash: Hex; raw: Hex };
    try {
      signed = await chain.signTransfer(payee, request.amount);
    } catch (e) {
      return deny("transfer", "The payment could not be prepared. No money moved.", String(e).slice(0, 300));
    }
    const ins = db
      .prepare("INSERT INTO requests (created_at, request_hash, leaf_subject, amount, target, decision, tx_hash, tx_status, raw_tx, response) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, 'signed', ?, '{}')")
      .run(Number(now), requestHash, chainLinks.at(-1)!.subject, request.amount.toString(), request.target, signed.hash, signed.raw);
    const rowId = Number(ins.lastInsertRowid);
    try {
      await chain.broadcast(signed.raw);
      db.prepare("UPDATE requests SET tx_status = 'submitted' WHERE id = ?").run(rowId);
    } catch {
      // Unknown whether the node accepted it; the reconciler rebroadcasts the SAME signed tx (same hash).
    }
    const st = await chain.waitFor(signed.hash, d.receiptTimeoutMs ?? 60_000);
    if (st === "confirmed") {
      db.prepare("UPDATE requests SET tx_status = 'confirmed' WHERE id = ?").run(rowId);
      checks.push({ name: "transfer", ok: true, plainEnglish: "Payment sent onchain.", detail: signed.hash });
      return finish("EXECUTED", { txHash: signed.hash }, rowId);
    }
    if (st === "reverted") {
      db.prepare("UPDATE requests SET tx_status = 'reverted' WHERE id = ?").run(rowId);
      checks.push({ name: "transfer", ok: false, plainEnglish: "The payment transaction failed onchain. No money moved.", detail: signed.hash });
      return finish("DENIED", { txHash: signed.hash }, rowId);
    }
    checks.push({ name: "transfer", ok: true, plainEnglish: "Payment broadcast; waiting for confirmation.", detail: signed.hash });
    return finish("PENDING", { txHash: signed.hash, reason: "awaiting_confirmation" }, rowId);
  });
}

/** Re-check txs that were signed/submitted but not yet final. Rebroadcasts the identical raw tx; never signs a new one. */
export async function reconcile(d: Deps) {
  const rows = d.db.prepare("SELECT id, tx_hash, raw_tx, response FROM requests WHERE tx_status IN ('signed','submitted')").all() as {
    id: number; tx_hash: Hex; raw_tx: Hex; response: string;
  }[];
  for (const r of rows) {
    await d.chain.broadcast(r.raw_tx).catch(() => undefined);
    const st = await d.chain.waitFor(r.tx_hash, 5_000);
    if (st === "pending") continue;
    const res = JSON.parse(r.response) as ExecuteResponse;
    res.decision = st === "confirmed" ? "EXECUTED" : "DENIED";
    res.balanceAfter = await safeBalance(d.chain);
    d.db.prepare("UPDATE requests SET tx_status = ?, decision = ?, response = ? WHERE id = ?").run(st, res.decision, JSON.stringify(res), r.id);
    d.events.emit("request", res);
  }
}
