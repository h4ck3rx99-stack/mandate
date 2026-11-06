import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Hex } from "viem";

export type Decision = "EXECUTED" | "DENIED" | "PENDING";

export interface RequestRow {
  id: number;
  created_at: number;
  request_hash: string | null;
  leaf_subject: string | null;
  amount: string | null;
  target: string | null;
  decision: Decision;
  tx_hash: string | null;
  tx_status: string | null; // signed | submitted | confirmed | reverted
  raw_tx: string | null;
  response: string; // JSON
}

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      consumed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_approvals (
      ref TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      approved_at INTEGER,          -- server-verified auth_time; NULL while pending
      consumed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,         -- pending | approved | denied
      reason TEXT,
      state TEXT UNIQUE, nonce TEXT, started_at INTEGER NOT NULL,
      world_sub TEXT
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      request_hash TEXT, leaf_subject TEXT, amount TEXT, target TEXT,
      decision TEXT NOT NULL,
      tx_hash TEXT UNIQUE, tx_status TEXT, raw_tx TEXT,
      response TEXT NOT NULL
    );
  `);
  return db;
}
export type Db = ReturnType<typeof openDb>;

/**
 * Step 10: consume the request nonce (and the World approval, if any) atomically.
 * Returns false if the nonce was already used or the approval was already consumed — nothing is written then.
 */
export function consumeNonce(db: Db, nonce: Hex, requestHash: Hex, now: number, worldApprovalRef?: string): boolean {
  db.exec("BEGIN IMMEDIATE");
  try {
    const ins = db.prepare("INSERT OR IGNORE INTO nonces (nonce, request_hash, consumed_at) VALUES (?, ?, ?)").run(nonce.toLowerCase(), requestHash, now);
    if (ins.changes !== 1) {
      db.exec("ROLLBACK");
      return false;
    }
    if (worldApprovalRef) {
      const upd = db
        .prepare("UPDATE world_approvals SET consumed = 1 WHERE ref = ? AND request_hash = ? AND status = 'approved' AND consumed = 0")
        .run(worldApprovalRef, requestHash);
      if (upd.changes !== 1) {
        db.exec("ROLLBACK");
        return false;
      }
    }
    db.exec("COMMIT");
    return true;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
