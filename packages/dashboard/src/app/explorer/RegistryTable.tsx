"use client";
import { useMemo, useState } from "react";
import type { InspectResult, Receipt } from "@mandate/arkiv";

const tone: Record<string, string> = { USABLE: "text-lime border-lime", REVOKED: "text-red border-red", EXPIRED: "text-amber border-amber", DENIED: "text-red border-red" };
const usdc = (m: unknown) => (Number(m) / 1e6).toFixed(2);

function download(name: string, mime: string, body: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function RegistryTable({ rows, receipts }: { rows: InspectResult[]; receipts: Receipt[] }) {
  const [status, setStatus] = useState("ALL");
  const [decision, setDecision] = useState("ALL");
  const [copied, setCopied] = useState(false);
  const shown = useMemo(() => rows.filter((r) => status === "ALL" || r.status === status), [rows, status]);
  const shownReceipts = useMemo(() => receipts.filter((r) => decision === "ALL" || r.decision === decision), [receipts, decision]);

  const exportJson = () => download(`mandate-evidence-${Date.now()}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), names: rows, receipts }, null, 2));
  const exportCsv = () => {
    const head = "name,status,reasons,links,receipt_decision,receipt_amount_usdc,receipt_failed_check,receipt_tx,arkiv_entity";
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const a = rows.map((r) => [r.name, r.status, r.reasons.join(" | "), r.links.length, "", "", "", "", ""].map(esc).join(","));
    const b = receipts.map((r) => [r.leafName, "", "", "", r.decision, usdc(r.amount), r.failedCheck, r.txHash, r.entityKey].map(esc).join(","));
    download(`mandate-evidence-${Date.now()}.csv`, "text/csv", [head, ...a, ...b].join("\n"));
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-mute" htmlFor="st">Status</label>
        <select id="st" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-sm border border-line bg-panel px-2 py-1 text-sm">
          {["ALL", "USABLE", "REVOKED", "EXPIRED", "DENIED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="ml-auto flex gap-2">
          <button onClick={exportCsv} className="rounded-sm border border-line px-3 py-1.5 text-sm hover:border-lime">Export evidence CSV</button>
          <button onClick={exportJson} className="rounded-sm border border-line px-3 py-1.5 text-sm hover:border-lime">Export evidence JSON</button>
        </span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel font-mono text-[11px] uppercase text-mute">
            <tr><th className="p-3">Name</th><th className="p-3">Status</th><th className="p-3">Why</th><th className="p-3">Chain</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name} className="border-t border-line align-top">
                <td className="p-3"><a href={`/agent/${r.name}`} className="font-mono text-xs hover:text-lime">{r.name}</a></td>
                <td className="p-3"><span className={`rounded-sm border px-2 py-0.5 font-mono text-xs font-bold ${tone[r.status]}`}>{r.status}</span></td>
                <td className="p-3 text-xs">{r.reasons.join(" ")}</td>
                <td className="p-3 font-mono text-[11px]">
                  {r.links.map((l, i) => (
                    <div key={i}>
                      {usdc(l.delegation.scope.maxAmount)} ·{" "}
                      <a className="underline hover:text-lime" target="_blank" rel="noreferrer" href={`https://rabdi.explorer.arkiv.network/entity/${l.entityKey}`}>{l.delegation.subjectName.split(".")[0]} on Arkiv</a>
                      {l.revoked ? <span className="text-red"> REVOKED</span> : null}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold">Decision receipts (read from Arkiv)</h2>
        <fieldset className="flex gap-3 text-sm" aria-label="Decision filter">
          {["ALL", "EXECUTED", "DENIED"].map((d) => (
            <label key={d} className="flex items-center gap-1"><input type="radio" name="dec" checked={decision === d} onChange={() => setDecision(d)} />{d}</label>
          ))}
        </fieldset>
      </div>
      <p className="mt-1 text-xs text-mute">Written by the payment service wallet for every final verdict; only receipts owned by that wallet are shown.</p>
      <ul className="mt-3 flex flex-col gap-1 font-mono text-xs">
        {shownReceipts.length === 0 && <li className="text-mute">No receipts yet.</li>}
        {shownReceipts.map((r) => (
          <li key={r.entityKey} className="flex flex-wrap gap-3 border-t border-line py-1.5">
            <span className="text-mute">{new Date(r.at * 1000).toLocaleString()}</span>
            <span className={r.decision === "EXECUTED" ? "text-lime" : "text-red"}>{r.decision}</span>
            <span>{usdc(r.amount)} USDC → {r.target}</span>
            {r.failedCheck && <span className="text-red">failed: {r.failedCheck}</span>}
            <span className="text-mute">{r.leafName}</span>
            <a className="underline" target="_blank" rel="noreferrer" href={`https://rabdi.explorer.arkiv.network/entity/${r.entityKey}`}>Arkiv ↗</a>
            {r.txHash && <a className="underline" target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${r.txHash}`}>tx ↗</a>}
            <button className="text-mute hover:text-ink" onClick={() => { void navigator.clipboard.writeText(r.entityKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>copy key</button>
          </li>
        ))}
      </ul>
      {copied && <div role="status" className="fixed bottom-4 right-4 rounded-md border border-lime bg-panel px-3 py-2 text-sm">Copied</div>}
    </>
  );
}
