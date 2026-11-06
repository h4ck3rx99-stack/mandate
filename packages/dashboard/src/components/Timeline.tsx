"use client";
import { useEffect, useState } from "react";
import { SERVICE, etherscanTx, short, usdc, type ServiceResponse } from "@/lib/stage";

interface Row { at: number; kind: "request" | "world" | "receipt"; data: any }

/** Live feed from the payment service (SSE): every verdict from any app — terminals, dashboard, CLI. */
export function Timeline({ onEvent }: { onEvent?: (r: Row) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const es = new EventSource(`${SERVICE}/events`);
    const add = (kind: Row["kind"]) => (e: MessageEvent) => {
      const row = { at: Date.now(), kind, data: JSON.parse(e.data) };
      setRows((r) => [row, ...r].slice(0, 30));
      onEvent?.(row);
    };
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("request", add("request"));
    es.addEventListener("world", add("world"));
    es.addEventListener("receipt", add("receipt"));
    return () => es.close();
  }, [onEvent]);
  return (
    <section aria-label="Live timeline" className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mute">Live service timeline</h2>
        <span className={`font-mono text-[10px] ${live ? "text-lime" : "text-red"}`}>{live ? "● connected" : "○ disconnected"}</span>
      </div>
      {rows.length === 0 && <p className="text-xs text-mute">Waiting for requests from any agent, terminal or browser…</p>}
      <ul className="flex max-h-40 flex-col gap-1 overflow-auto font-mono text-[11px]">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-mute">{new Date(r.at).toLocaleTimeString()}</span>
            {r.kind === "request" && <RequestRow r={r.data} />}
            {r.kind === "world" && <span className="text-amber">World {r.data.purpose ?? "approval"}: {r.data.status}{r.data.reason ? ` (${r.data.reason})` : ""}</span>}
            {r.kind === "receipt" && (
              <a className="text-mute underline" href={`https://rabdi.explorer.arkiv.network/entity/${r.data.entityKey}`} target="_blank" rel="noreferrer">
                receipt on Arkiv · {r.data.decision} · {short(r.data.entityKey)}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestRow({ r }: { r: ServiceResponse }) {
  const failed = r.checks?.find((c) => !c.ok);
  const c = r.decision === "EXECUTED" ? "text-lime" : r.decision === "DENIED" ? "text-red" : "text-amber";
  return (
    <span>
      <span className={`font-bold ${c}`}>{r.decision}</span> {failed ? `at ${failed.name}: ${failed.plainEnglish}` : ""}
      {r.txHash && <a className="ml-2 underline" href={etherscanTx(r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash)}</a>}
      <span className="ml-2 text-mute">treasury {usdc(r.balanceAfter)}</span>
    </span>
  );
}
