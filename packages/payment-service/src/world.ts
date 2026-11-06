import { randomBytes, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import express from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import type { Db } from "./db";

/**
 * World ID Agent Pass (OIDC step-up). Authentication != permission:
 *  - "bind-root": the pinned root issuer (proven by wallet signature) links ONE World human (iss, sub). One human, one root.
 *  - "approve":   a fresh (max_age=0) World login by THAT human approves ONE pending request hash. It never widens scope:
 *                 the request must already have passed every scope check and be PENDING only for approval.
 */
export interface WorldConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  acceptedAcr: string[];
  pinnedRoot: Address;
  attemptTtlSec: number;
}

export interface IdClaims extends JWTPayload {
  nonce?: string;
  acr?: string;
  auth_time?: number;
}

/** Network side of OIDC, injectable for tests. */
export interface OidcPort {
  authorizeEndpoint(): Promise<string>;
  redeem(code: string, codeVerifier: string): Promise<IdClaims>; // exchanges code AND verifies the ID token signature/iss/aud/exp
}

export function realOidc(cfg: WorldConfig): OidcPort {
  let meta: Promise<{ authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string }> | undefined;
  const discover = () =>
    (meta ??= fetch(`${cfg.issuer}/.well-known/openid-configuration`).then(async (r) => {
      if (!r.ok) throw new Error(`discovery ${r.status}`);
      const m = await r.json();
      if (m.issuer !== cfg.issuer) throw new Error(`issuer mismatch ${m.issuer}`);
      return m;
    }));
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  return {
    authorizeEndpoint: async () => (await discover()).authorization_endpoint,
    async redeem(code, codeVerifier) {
      const m = await discover();
      const basic = Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
      const r = await fetch(m.token_endpoint, {
        method: "POST",
        headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, code_verifier: codeVerifier }),
      });
      const j = await r.json();
      if (!r.ok || !j.id_token) throw new Error(`token endpoint ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
      jwks ??= createRemoteJWKSet(new URL(m.jwks_uri));
      const { payload } = await jwtVerify(j.id_token, jwks, { issuer: cfg.issuer, audience: cfg.clientId, algorithms: ["RS256"] });
      return payload as IdClaims;
    },
  };
}

const b64url = (b: Buffer) => b.toString("base64url");
export const linkMessage = (root: Address, ts: number) => `Mandate: link a World ID human to root issuer ${root} at ${ts}`;

export function migrateWorld(db: Db) {
  for (const col of ["code_verifier TEXT", "purpose TEXT", "acr TEXT", "auth_time INTEGER"]) {
    try {
      db.exec(`ALTER TABLE world_approvals ADD COLUMN ${col}`);
    } catch {
      /* exists */
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS world_identities (
    root_issuer TEXT PRIMARY KEY, iss TEXT NOT NULL, sub TEXT NOT NULL, linked_at INTEGER NOT NULL, UNIQUE (iss, sub))`);
}

const page = (title: string, body: string, ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="background:#0B0D10;color:#E6E8EB;font:16px system-ui;padding:48px">` +
  `<h1 style="color:${ok ? "#C6FF3D" : "#FF4D4D"}">${title}</h1><p>${body}</p></body>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function worldRouter(d: { db: Db; cfg: WorldConfig; oidc: OidcPort; now: () => number; events: EventEmitter }) {
  const r = express.Router();
  const { db, cfg } = d;

  async function startAttempt(purpose: "bind-root" | "approve", requestHash: string) {
    const ref = b64url(randomBytes(16));
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    db.prepare(
      "INSERT INTO world_approvals (ref, request_hash, status, state, nonce, started_at, code_verifier, purpose) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)",
    ).run(ref, requestHash, state, nonce, d.now(), verifier, purpose);
    const url = new URL(await d.oidc.authorizeEndpoint());
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: "openid",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      max_age: "0",
      prompt: "login",
      claims: JSON.stringify({ id_token: { acr: { essential: true, values: cfg.acceptedAcr }, auth_time: { essential: true } } }),
    }).toString();
    return { ref, url: url.toString() };
  }

  /** Root owner proves wallet control, then gets a World login URL that links their human identity. */
  r.post("/world/link/start", express.json(), async (req, res) => {
    const { ts, sig } = req.body ?? {};
    if (typeof ts !== "number" || typeof sig !== "string" || Math.abs(d.now() - ts) > 120)
      return void res.status(400).json({ ok: false, reason: "need fresh {ts, sig}" });
    const signer = await recoverMessageAddress({ message: linkMessage(cfg.pinnedRoot, ts), signature: sig as Hex }).catch(() => undefined);
    if (!signer || !isAddressEqual(signer, cfg.pinnedRoot)) return void res.status(403).json({ ok: false, reason: "not signed by the pinned root issuer" });
    res.json({ ok: true, ...(await startAttempt("bind-root", "bind-root")) });
  });

  /** Start a step-up approval for ONE pending request. */
  r.get("/world/approve", async (req, res) => {
    const h = String(req.query.requestHash ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return void res.status(400).send(page("Bad request", "requestHash missing.", false));
    const pending = db.prepare("SELECT response FROM requests WHERE request_hash = ? AND decision = 'PENDING' ORDER BY id DESC LIMIT 1").get(h) as
      | { response: string }
      | undefined;
    if (!pending || JSON.parse(pending.response).reason !== "needs_world_approval")
      return void res.status(404).send(page("Nothing to approve", "No request is waiting for human approval with that hash.", false));
    if (!db.prepare("SELECT 1 FROM world_identities WHERE root_issuer = ?").get(cfg.pinnedRoot.toLowerCase()))
      return void res.status(409).send(page("Root not linked", "The treasury owner has not linked a World ID yet.", false));
    res.redirect(302, (await startAttempt("approve", h)).url);
  });

  r.get("/world/callback", async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const row = db.prepare("SELECT * FROM world_approvals WHERE state = ? AND status = 'pending'").get(q.state ?? "") as any;
    const deny = (reason: string, status = 403) => {
      if (row) db.prepare("UPDATE world_approvals SET status = 'denied', reason = ? WHERE ref = ?").run(reason, row.ref);
      d.events.emit("world", { ref: row?.ref, requestHash: row?.request_hash, status: "denied", reason });
      res.status(status).send(page("Not approved", `${esc(reason)} Nothing was executed.`, false));
    };
    if (!row) return deny("Unknown or already-used login attempt.", 400);
    if (q.error) return deny(`World login ended: ${q.error}${q.error_description ? ` (${q.error_description})` : ""}.`);
    if (d.now() - row.started_at > cfg.attemptTtlSec) return deny("The approval window expired.");
    let c: IdClaims;
    try {
      c = await d.oidc.redeem(q.code ?? "", row.code_verifier);
    } catch (e) {
      return deny(`Could not verify the World login: ${String(e).slice(0, 160)}`);
    }
    if (c.nonce !== row.nonce) return deny("Login response did not match this attempt (nonce).");
    if (!c.acr || !cfg.acceptedAcr.includes(c.acr)) return deny(`Verification level not accepted (acr ${c.acr ?? "missing"}).`);
    if (typeof c.auth_time !== "number" || c.auth_time < row.started_at - 5 || c.auth_time > d.now() + 60)
      return deny("Authentication was not fresh for this approval.");
    if (!c.iss || !c.sub) return deny("Missing subject.");

    if (row.purpose === "bind-root") {
      const other = db.prepare("SELECT root_issuer FROM world_identities WHERE iss = ? AND sub = ?").get(c.iss, c.sub) as any;
      if (other && other.root_issuer !== cfg.pinnedRoot.toLowerCase()) return deny("This World ID already controls another root (one human, one root).");
      db.prepare("INSERT OR REPLACE INTO world_identities (root_issuer, iss, sub, linked_at) VALUES (?, ?, ?, ?)").run(cfg.pinnedRoot.toLowerCase(), c.iss, c.sub, d.now());
    } else {
      const id = db.prepare("SELECT iss, sub FROM world_identities WHERE root_issuer = ?").get(cfg.pinnedRoot.toLowerCase()) as any;
      if (!id || id.iss !== c.iss || id.sub !== c.sub) return deny("A different World ID approved this. Only the treasury owner can.");
    }
    db.prepare("UPDATE world_approvals SET status = 'approved', approved_at = ?, world_sub = ?, acr = ?, auth_time = ? WHERE ref = ?").run(
      c.auth_time, c.sub, c.acr, c.auth_time, row.ref,
    );
    d.events.emit("world", { ref: row.ref, requestHash: row.request_hash, status: "approved", purpose: row.purpose });
    res.send(
      row.purpose === "bind-root"
        ? page("World ID linked", "This verified human now controls the treasury root. One human, one root.", true)
        : page("Approved", `You approved exactly one request (<code>${esc(row.request_hash)}</code>). The settlement agent can retry it now.`, true),
    );
  });

  /** Agents poll this to learn the approval ref for their request. */
  r.get("/world/approvals", (req, res) => {
    const rows = db
      .prepare("SELECT ref, request_hash, status, reason, approved_at, consumed FROM world_approvals WHERE request_hash = ? ORDER BY started_at DESC")
      .all(String(req.query.requestHash ?? ""));
    res.json(rows);
  });

  return r;
}
