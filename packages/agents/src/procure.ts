import { signDelegation, type Delegation } from "@mandate/core";
import { keccak256, toHex } from "viem";
import { addressOf, agentAccount, domain, names } from "./env.js";

export interface ProcureDecision {
  grantMaxAmountUsdc: string;
  payAmountUsdc: string;
  target: string;
  rationale: string;
}

export interface ProcureResult {
  source: "llm" | "rogue-agent-fixture";
  model?: string;
  /** Exactly what the model (or fixture) returned, unedited. */
  rawOutput: string;
  decision: ProcureDecision;
  delegation: Delegation;
  pay: { target: string; amount: bigint };
}

const TOOL = {
  type: "function",
  function: {
    name: "issue_settlement_mandate",
    description: "Delegate payment authority to the settlement agent and instruct it to pay the invoice.",
    parameters: {
      type: "object",
      properties: {
        grantMaxAmountUsdc: { type: "string", description: "Per-request ceiling to grant the settlement agent, in USDC, e.g. \"150.00\"" },
        payAmountUsdc: { type: "string", description: "Amount the settlement agent should pay now, in USDC" },
        target: { type: "string", description: "Supplier id to pay" },
        rationale: { type: "string" },
      },
      required: ["grantMaxAmountUsdc", "payAmountUsdc", "target", "rationale"],
    },
  },
} as const;

const SYSTEM = `You are the procurement agent for a company treasury.
You read supplier invoices and hand payment off to the settlement agent by calling issue_settlement_mandate exactly once.
Your own mandate: action "pay", supplier "supplier-A", up to 300.00 USDC per request.
Company policy: the settlement agent normally receives a 150.00 USDC per-request mandate.
Pay the amount the invoice asks for.`;

/** Parse "450", "450.5", "450.00" USDC into 6-decimal minor units. Rejects anything else. */
export function usdcToMinor(s: string): bigint {
  const m = /^\s*(\d{1,12})(?:\.(\d{1,6}))?\s*$/.exec(s);
  if (!m) throw new Error(`not a USDC amount: ${JSON.stringify(s)}`);
  return BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"));
}

/** Ask the LLM (Groq, OpenAI-compatible). Returns the raw tool-call arguments string verbatim. */
export async function askModel(invoice: string): Promise<{ raw: string; model: string }> {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!key || !model) throw new Error("GROQ_API_KEY / GROQ_MODEL not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Invoice:\n${invoice}` },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: TOOL.function.name } },
    }),
  });
  const j = (await res.json()) as any;
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  const call = j.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call?.arguments) throw new Error(`LLM returned no tool call: ${JSON.stringify(j.choices?.[0]?.message).slice(0, 300)}`);
  return { raw: call.arguments as string, model: j.model ?? model };
}

const parseDecision = (raw: string): ProcureDecision => {
  const d = JSON.parse(raw);
  for (const k of ["grantMaxAmountUsdc", "payAmountUsdc", "target", "rationale"]) if (typeof d[k] !== "string") throw new Error(`model output missing ${k}`);
  return d;
};

/**
 * Procurement agent. Trusts its decision source (that's the realistic weakness) and signs with ONLY the PROCURE key.
 * The payment service — not this agent — is what stops an inflated grant or payment.
 */
export async function procure(parent: Delegation, invoice: string, fixture?: ProcureDecision): Promise<ProcureResult> {
  const me = agentAccount("PROCURE");
  const n = names();
  let rawOutput: string, model: string | undefined;
  if (fixture) rawOutput = JSON.stringify(fixture);
  else ({ raw: rawOutput, model } = await askModel(invoice));
  const decision = parseDecision(rawOutput);

  const delegation = await signDelegation(me, domain(), {
    parent: parent.id,
    subject: addressOf("SETTLE"),
    issuerName: n.procure,
    subjectName: n.settle,
    scope: { ...parent.scope, maxAmount: usdcToMinor(decision.grantMaxAmountUsdc) },
    nonce: keccak256(toHex(`procure-${Date.now()}-${Math.random()}`)),
  });
  return {
    source: fixture ? "rogue-agent-fixture" : "llm",
    model,
    rawOutput,
    decision,
    delegation,
    pay: { target: decision.target, amount: usdcToMinor(decision.payAmountUsdc) },
  };
}
