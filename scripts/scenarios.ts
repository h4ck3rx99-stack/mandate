// Runs the demo scenarios against the live payment service on Sepolia.
// usage: tsx scripts/scenarios.ts [1|2|2b|3|4|all] [--reseed] [--record]
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { Delegation } from "@mandate/core";
import { delegationToWire } from "@mandate/core";
import { issueRoot, delegateToProcure, procure, settle, revokeOnchain, type ProcureDecision } from "@mandate/agents";

process.loadEnvFile(".env");
const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith("--")) ?? "all";
const record = args.includes("--record");
const STATE = "data/chain.json";
const USDC = 1_000_000n;
const tx = (h?: unknown) => (h ? `https://sepolia.etherscan.io/tx/${h}` : "-");
const fmt = (m?: unknown) => (m == null ? "?" : (Number(m) / 1e6).toFixed(2));
const rogue = JSON.parse(readFileSync("fixtures/rogue-outputs.json", "utf8")) as Record<string, ProcureDecision>;
const invoice = (f: string) => readFileSync(`fixtures/invoices/${f}`, "utf8");

type Up = [Delegation, Delegation]; // owner->ops, ops->procure
const revive = (d: any): Delegation => ({ ...d, scope: { ...d.scope, maxAmount: BigInt(d.scope.maxAmount), expiry: BigInt(d.scope.expiry) } });

async function upstream(reseed = false): Promise<Up> {
  if (!reseed && existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, "utf8"));
    if (!s.revoked && BigInt(s.chain[0].scope.expiry) > BigInt(Math.floor(Date.now() / 1000)) + 600n) return s.chain.map(revive) as Up;
  }
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
  const root = await issueRoot({ actions: ["pay"], maxAmount: 500n * USDC, expiry, targets: ["supplier-A"] });
  const opsLink = await delegateToProcure(root, { actions: ["pay"], maxAmount: 300n * USDC, expiry, targets: ["supplier-A"] });
  mkdirSync("data", { recursive: true });
  writeFileSync(STATE, JSON.stringify({ chain: [root, opsLink].map(delegationToWire), revoked: false }, null, 2));
  console.log(`seeded upstream: root ${root.id.slice(0, 10)}…  ops->procure ${opsLink.id.slice(0, 10)}…`);
  return [root, opsLink];
}

const lines: string[] = [];
function report(title: string, extra: string[], r: { status: number; body: any }) {
  const failed = (r.body.checks ?? []).find((c: any) => !c.ok);
  const out = [
    `### ${title}`,
    ...extra,
    `- decision: **${r.body.decision}** (HTTP ${r.status})${failed ? ` at \`${failed.name}\`: ${failed.plainEnglish} (${failed.detail})` : ""}`,
    `- tx: ${tx(r.body.txHash)}`,
    `- service USDC before/after: ${fmt(r.body.balanceBefore)} → ${fmt(r.body.balanceAfter)}`,
    "",
  ];
  console.log(out.join("\n"));
  lines.push(...out);
}

async function runProcure(up: Up, file: string, allowRogue: boolean) {
  const llm = await procure(up[1], invoice(file));
  const extra = [`- invoice: \`fixtures/invoices/${file}\``, `- model (${llm.model}) output, verbatim: \`${llm.rawOutput}\``];
  const resisted = allowRogue && rogue[file] && (llm.decision.payAmountUsdc !== rogue[file]!.payAmountUsdc || llm.decision.grantMaxAmountUsdc !== rogue[file]!.grantMaxAmountUsdc);
  if (!resisted) return { res: llm, extra };
  extra.push(`- the live model did NOT fully follow the injection; using the labelled **ROGUE-AGENT FIXTURE** (fixtures/rogue-outputs.json): \`${JSON.stringify(rogue[file])}\``);
  return { res: await procure(up[1], invoice(file), rogue[file]), extra };
}

const scenarios: Record<string, () => Promise<void>> = {
  async "1"() {
    const up = await upstream();
    const { res, extra } = await runProcure(up, "honest.txt", false);
    report("Scenario 1 — honest invoice (5.00 USDC, above 2.00 World threshold)", extra, await settle([...up, res.delegation], res.pay));
  },
  async "1s"() {
    const up = await upstream();
    const { res, extra } = await runProcure(up, "honest-small.txt", false);
    report("Scenario 1s — honest small invoice (1.50 USDC, below World threshold)", extra, await settle([...up, res.delegation], res.pay));
  },
  async "2"() {
    const up = await upstream();
    const { res, extra } = await runProcure(up, "injected-amount.txt", true);
    report("Scenario 2 — injected invoice: settle asks 450 with a 150 mandate", extra, await settle([...up, res.delegation], res.pay));
  },
  async "2b"() {
    const up = await upstream();
    const { res, extra } = await runProcure(up, "injected-delegation.txt", true);
    report("Scenario 2b — injected delegation: procure grants settle 1000", extra, await settle([...up, res.delegation], res.pay));
  },
  async "3"() {
    const up = await upstream();
    const { res } = await runProcure(up, "honest-small.txt", false);
    const hash = await revokeOnchain(up[0].id);
    writeFileSync(STATE, JSON.stringify({ ...JSON.parse(readFileSync(STATE, "utf8")), revoked: true }, null, 2));
    report("Scenario 3 — owner revokes ops, then a 1.50 USDC request retries", [`- revoke tx: ${tx(hash)}`], await settle([...up, res.delegation], res.pay));
    await upstream(true); // fresh mandates for later scenarios
  },
  async "4"() {
    const up = await upstream();
    const { res } = await runProcure(up, "honest-small.txt", false);
    const first = await settle([...up, res.delegation], res.pay);
    report("Scenario 4a — original request (1.50 USDC)", [], first);
    const replay = await fetch(`${process.env.SERVICE_URL}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(first.sent) });
    report("Scenario 4b — exact replay of the same signed request", [], { status: replay.status, body: await replay.json() });
  },
};

const order = which === "all" ? ["1", "1s", "2", "2b", "3", "4"] : [which];
for (const s of order) await scenarios[s]!();
if (record) appendFileSync("docs/evidence.md", `\n## Run ${new Date().toISOString()}\n\n${lines.join("\n")}\n`);
