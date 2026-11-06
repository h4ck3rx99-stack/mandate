// Agent runner: runs demo scenarios and streams each beat as NDJSON to the dashboard.
// Each agent module loads ONLY its own key; the browser never sees keys.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { delegationToWire, type Delegation } from "@mandate/core";
import { names, serviceUrl } from "./env.js";
import { procure, type ProcureDecision, type ProcureResult } from "./procure.js";
import { settle } from "./settle.js";
import { revokeOnchain } from "./owner.js";
import { ensureUpstream, markRevoked } from "./upstream.js";
import { publishLink } from "./publish.js";

const root = resolve(import.meta.dirname, "../../..");
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = Number(process.env.RUNNER_PORT ?? 8788);
const PUBLIC_SERVICE_URL = process.env.SERVICE_PUBLIC_URL ?? serviceUrl();
const rogue = JSON.parse(readFileSync("fixtures/rogue-outputs.json", "utf8")) as Record<string, ProcureDecision>;
const invoiceText = (f: string) => readFileSync(`fixtures/invoices/${f}`, "utf8");
const injectedLines = (t: string) => t.split(/\r?\n/).filter((l) => /NOTE TO AI|grantMaxAmountUsdc|supersedes/i.test(l));

type Emit = (ev: Record<string, unknown>) => void;
const j = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
const linkView = (d: Delegation, arkivUrl?: string) => ({ ...j(delegationToWire(d)), arkivUrl });

let busy = false;
const lastPlayground = new Map<string, number>();

async function upstream(emit: Emit) {
  const up = await ensureUpstream({ log: (s) => emit({ t: "log", message: s }) });
  emit({ t: "chain", links: up.chain.map((d, i) => linkView(d, up.published[i]?.arkivUrl)), names: names() });
  return up;
}

async function runProcure(emit: Emit, up: Awaited<ReturnType<typeof ensureUpstream>>, file: string | undefined, text: string, mode: "llm" | "rogue", publish: boolean) {
  emit({ t: "invoice", file: file ?? "typed by user", text, injectedLines: injectedLines(text) });
  emit({ t: "log", message: mode === "llm" ? "procurement agent is reading the invoice (live model)…" : "procurement agent output: ROGUE-AGENT FIXTURE" });
  let res: ProcureResult;
  if (mode === "rogue") {
    const real = await procure(up.chain[1], text).catch((e) => ({ rawOutput: `model error: ${String(e).slice(0, 200)}`, model: undefined }) as any);
    emit({ t: "model", source: "llm", model: real.model, raw: real.rawOutput, note: "real model output (shown for honesty; not used in this beat)" });
    res = await procure(up.chain[1], text, rogue[file!]);
  } else res = await procure(up.chain[1], text);
  emit({ t: "model", source: res.source, model: res.model, raw: res.rawOutput });
  let arkivUrl: string | undefined;
  if (publish) {
    emit({ t: "log", message: "procure publishes the mandate it signed (Arkiv + ENS)…" });
    arkivUrl = (await publishLink("PROCURE", res.delegation, up.chain[0].id, 2)).arkivUrl;
  }
  emit({ t: "delegation", link: linkView(res.delegation, arkivUrl) });
  return res;
}

async function pay(emit: Emit, chain: Delegation[], p: { target: string; amount: bigint }, world: boolean) {
  emit({ t: "request", amount: p.amount.toString(), target: p.target });
  const first = await settle(chain, p, { ttlSec: world ? 290 : 120 });
  emit({ t: "response", status: first.status, body: first.body });
  if (!world || first.body.decision !== "PENDING" || first.body.reason !== "needs_world_approval") return first;
  const h = first.body.requestHash as string;
  emit({ t: "world", approveUrl: `${PUBLIC_SERVICE_URL}/world/approve?requestHash=${h}`, requestHash: h });
  const until = Date.now() + 280_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    const rows = (await (await fetch(`${serviceUrl()}/world/approvals?requestHash=${h}`)).json().catch(() => [])) as any[];
    const a = rows.find((r) => r.status === "approved" && !r.consumed);
    const d = rows.find((r) => r.status === "denied");
    if (d && !a) {
      emit({ t: "world-status", status: "denied", reason: d.reason });
      return first;
    }
    if (a) {
      emit({ t: "world-status", status: "approved", ref: a.ref });
      const again = await settle(chain, p, { worldApprovalRef: a.ref, nonce: first.unsigned.nonce, deadline: first.unsigned.deadline });
      emit({ t: "response", status: again.status, body: again.body });
      return again;
    }
  }
  emit({ t: "world-status", status: "expired", reason: "No approval within the window. Nothing was executed." });
  return first;
}

const scenarios: Record<string, (emit: Emit, body: any) => Promise<void>> = {
  async "1"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "honest.txt", invoiceText("honest.txt"), "llm", true);
    await pay(emit, [...up.chain, r.delegation], r.pay, true);
  },
  async "2a"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "injected-amount.txt", invoiceText("injected-amount.txt"), "llm", false);
    await pay(emit, [...up.chain, r.delegation], r.pay, false);
  },
  async "2b"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "injected-amount.txt", invoiceText("injected-amount.txt"), "rogue", false);
    await pay(emit, [...up.chain, r.delegation], r.pay, false);
  },
  async "2c"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "injected-delegation.txt", invoiceText("injected-delegation.txt"), "rogue", true);
    await pay(emit, [...up.chain, r.delegation], r.pay, false);
  },
  async "3"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "honest-small.txt", invoiceText("honest-small.txt"), "llm", false);
    emit({ t: "log", message: "treasury owner revokes the ops mandate onchain…" });
    const hash = await revokeOnchain(up.chain[0].id);
    markRevoked();
    emit({ t: "revoke", txHash: hash, revokedId: up.chain[0].id, name: up.chain[0].subjectName });
    await pay(emit, [...up.chain, r.delegation], r.pay, false);
  },
  async "4"(emit) {
    const up = await upstream(emit);
    const r = await runProcure(emit, up, "honest-small.txt", invoiceText("honest-small.txt"), "llm", false);
    const first = await pay(emit, [...up.chain, r.delegation], r.pay, false);
    emit({ t: "log", message: "an attacker replays the exact same signed request…" });
    const rep = await fetch(`${serviceUrl()}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(first.sent) });
    emit({ t: "replay", status: rep.status, body: await rep.json() });
  },
  async "5"(emit, body) {
    const text = String(body?.invoice ?? "").slice(0, 2000);
    if (text.trim().length < 10) throw new Error("Type an invoice (at least 10 characters).");
    const up = await upstream(emit);
    const r = await runProcure(emit, up, undefined, text, "llm", false);
    await pay(emit, [...up.chain, r.delegation], r.pay, false);
  },
};

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});
app.get("/health", (_q, r) => void r.json({ ok: true, busy }));
app.get("/state", async (_q, r) => {
  const { readUpstream } = await import("./upstream.js");
  const up = readUpstream();
  r.json({ names: names(), upstream: up && { links: up.chain.map((d, i) => linkView(d, up.published[i]?.arkivUrl)), revoked: up.revoked } });
});
app.post("/scenario/:id", async (req, res) => {
  const run = scenarios[req.params.id];
  if (!run) return void res.status(404).json({ error: "unknown scenario" });
  if (req.params.id === "5") {
    const ip = req.ip ?? "?";
    if (Date.now() - (lastPlayground.get(ip) ?? 0) < 60_000) return void res.status(429).json({ error: "One attack per minute, please." });
    lastPlayground.set(ip, Date.now());
  }
  if (busy) return void res.status(409).json({ error: "Another scenario is running." });
  busy = true;
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  const emit: Emit = (ev) => res.write(JSON.stringify(j({ at: Date.now(), ...ev })) + "\n");
  emit({ t: "start", id: req.params.id });
  try {
    await run(emit, req.body);
  } catch (e) {
    emit({ t: "error", message: String((e as Error).message ?? e).slice(0, 300) });
  } finally {
    busy = false;
    emit({ t: "done" });
    res.end();
  }
});
app.listen(PORT, () => console.log(`agent runner on :${PORT} (service ${serviceUrl()})`));
