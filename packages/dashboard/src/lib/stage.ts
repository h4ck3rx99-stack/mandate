"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export const RUNNER = process.env.NEXT_PUBLIC_RUNNER_URL ?? "http://localhost:8788";
export const SERVICE = process.env.NEXT_PUBLIC_SERVICE_URL ?? "http://localhost:8787";
export const BEAT_MS = 700;
export const TRIP_HOLD_MS = 1500;

export interface Link {
  id: string; parent: string; issuer: string; subject: string; issuerName: string; subjectName: string;
  scope: { actions: string[]; maxAmount: string; expiry: string; targets: string[] };
  sig: string; arkivUrl?: string;
}
export interface Check { name: string; ok: boolean; plainEnglish: string; detail: string }
export interface Violation { dimension: string; reason: string; parentValue: string; childValue: string; edgeIndex?: number }
export interface ServiceResponse {
  decision: "EXECUTED" | "DENIED" | "PENDING"; checks: Check[]; violations: Violation[];
  txHash?: string; requestHash?: string; balanceBefore: string | null; balanceAfter: string | null; reason?: string;
}

export type Ev =
  | { t: "start"; id: string }
  | { t: "log"; message: string }
  | { t: "chain"; links: Link[] }
  | { t: "invoice"; file: string; text: string; injectedLines: string[] }
  | { t: "model"; source: "llm" | "rogue-agent-fixture"; model?: string; raw: string; note?: string }
  | { t: "delegation"; link: Link }
  | { t: "request"; amount: string; target: string }
  | { t: "response"; status: number; body: ServiceResponse }
  | { t: "world"; approveUrl: string; requestHash: string }
  | { t: "world-status"; status: "approved" | "denied" | "expired"; reason?: string; ref?: string }
  | { t: "revoke"; txHash: string; revokedId: string; name: string }
  | { t: "replay"; status: number; body: ServiceResponse }
  | { t: "error"; message: string }
  | { t: "done" };

export interface StageState {
  running: boolean;
  scenario?: string;
  logs: string[];
  links: Link[]; // owner->ops, ops->procure
  leaf?: Link; // procure->settle
  invoice?: { file: string; text: string; injectedLines: string[] };
  models: { source: string; model?: string; raw: string; note?: string }[];
  request?: { amount: string; target: string };
  responses: ServiceResponse[];
  world?: { approveUrl: string; requestHash: string; status?: string; reason?: string };
  revoke?: { txHash: string; name: string };
  replay?: ServiceResponse;
  error?: string;
}

const empty: StageState = { running: false, logs: [], links: [], models: [], responses: [] };

function reduce(s: StageState, e: Ev | { t: "reset" }): StageState {
  switch (e.t) {
    case "reset": return empty;
    case "start": return { ...empty, running: true, scenario: e.id };
    case "log": return { ...s, logs: [...s.logs.slice(-6), e.message] };
    case "chain": return { ...s, links: e.links };
    case "invoice": return { ...s, invoice: e };
    case "model": return { ...s, models: [...s.models, e] };
    case "delegation": return { ...s, leaf: e.link };
    case "request": return { ...s, request: e };
    case "response": return { ...s, responses: [...s.responses, e.body] };
    case "world": return { ...s, world: { ...e } };
    case "world-status": return { ...s, world: s.world && { ...s.world, status: e.status, reason: e.reason } };
    case "revoke": return { ...s, revoke: e };
    case "replay": return { ...s, replay: e.body };
    case "error": return { ...s, error: e.message, running: false };
    case "done": return { ...s, running: false };
  }
}

/** Streams NDJSON beats from the agent runner and releases them ~700 ms apart (Space releases the next one now). */
export function useStage() {
  const [state, dispatch] = useReducer(reduce, empty);
  const queue = useRef<Ev[]>([]);
  const [pending, setPending] = useState(0);
  const lastRelease = useRef(0);
  const holdUntil = useRef(0);

  const release = useCallback(() => {
    const ev = queue.current.shift();
    setPending(queue.current.length);
    if (!ev) return;
    lastRelease.current = Date.now();
    dispatch(ev);
    // Hold the tripped breaker before the next beat so the presenter can narrate.
    if (ev.t === "response" && ev.body.decision === "DENIED") holdUntil.current = Date.now() + TRIP_HOLD_MS;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (queue.current.length && Date.now() - lastRelease.current >= BEAT_MS && Date.now() >= holdUntil.current) release();
    }, 50);
    return () => clearInterval(id);
  }, [release]);

  const run = useCallback(async (scenario: string, body?: unknown) => {
    queue.current = [];
    dispatch({ t: "reset" });
    let res: Response;
    try {
      res = await fetch(`${RUNNER}/scenario/${scenario}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    } catch {
      dispatch({ t: "error", message: `Agent runner not reachable at ${RUNNER}.` });
      return;
    }
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      dispatch({ t: "error", message: j.error ?? `Runner error ${res.status}` });
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) {
        const ev = JSON.parse(l) as Ev;
        // start/log/chain are released immediately; story beats are paced
        if (ev.t === "start" || ev.t === "log" || ev.t === "chain") dispatch(ev);
        else queue.current.push(ev);
      }
      setPending(queue.current.length);
    }
  }, []);

  const reset = useCallback(() => { queue.current = []; setPending(0); dispatch({ t: "reset" }); }, []);
  const next = useCallback(() => { holdUntil.current = 0; release(); }, [release]);
  return { state, run, reset, next, pending };
}

export const usdc = (minor?: string | null) => (minor == null ? "—" : (Number(minor) / 1e6).toFixed(2));
export const short = (h?: string, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "");
export const etherscanTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
