"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { TRIP_HOLD_MS, etherscanTx, short, usdc, type ServiceResponse, type StageState } from "@/lib/stage";

function Checklist({ r }: { r: ServiceResponse }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= r.checks.length ? (clearInterval(id), n) : n + 1)), 160);
    return () => clearInterval(id);
  }, [r]);
  return (
    <ol className="flex flex-col gap-1.5">
      {r.checks.slice(0, shown).map((c, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 text-[13px]">
          <span className={`mt-0.5 w-12 shrink-0 font-mono text-[10px] font-bold ${c.ok ? "text-lime" : "text-red"}`}>{c.ok ? "PASS" : "FAIL"}</span>
          <span>
            <span className={c.ok ? "" : "font-semibold text-red"}>{c.plainEnglish}</span>
            <span className="block break-all font-mono text-[10.5px] text-mute">{c.name} · {c.detail}</span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

function MoneyShot({ asked, allowed }: { asked: bigint; allowed: bigint }) {
  const pct = Number((allowed * BigInt(100)) / asked);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-md border border-red/60 bg-panel p-4">
      <div className="flex items-baseline justify-between font-display">
        <span className="text-2xl font-bold text-red">ASKED {usdc(asked.toString())} USDC</span>
        <span className="text-2xl font-bold text-lime">ALLOWED {usdc(allowed.toString())} USDC</span>
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
        <div className="h-full bg-lime" style={{ width: `${pct}%` }} />
        <motion.div className="h-full bg-red" initial={{ width: 0 }} animate={{ width: `${100 - pct}%` }} transition={{ duration: 0.6 }} />
      </div>
      <p className="mt-2 text-xs text-mute">The excess never left the treasury.</p>
    </motion.div>
  );
}

function Result({ r }: { r: ServiceResponse }) {
  const scope = r.violations.find((v) => v.dimension === "maxAmount" && r.checks.some((c) => c.name === "leaf_scope" && !c.ok));
  const [compare, setCompare] = useState(false);
  useEffect(() => {
    setCompare(false);
    if (!scope) return;
    const id = setTimeout(() => setCompare(true), TRIP_HOLD_MS);
    return () => clearTimeout(id);
  }, [r, scope]);
  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-md border-2 p-4 ${r.decision === "EXECUTED" ? "border-lime" : r.decision === "DENIED" ? "border-red" : "border-amber"}`}
        role="status"
      >
        <p className={`font-display text-3xl font-extrabold ${r.decision === "EXECUTED" ? "text-lime" : r.decision === "DENIED" ? "text-red" : "text-amber"}`}>{r.decision}</p>
        {r.decision === "EXECUTED" && r.txHash ? (
          <a className="font-mono text-xs text-lime underline" href={etherscanTx(r.txHash)} target="_blank" rel="noreferrer">Payment on Etherscan: {short(r.txHash)} ↗</a>
        ) : r.decision === "PENDING" && r.txHash ? (
          <a className="font-mono text-xs text-amber underline" href={etherscanTx(r.txHash)} target="_blank" rel="noreferrer">Broadcast, awaiting confirmation ↗</a>
        ) : (
          <p className="font-display text-lg font-semibold">No money moved.</p>
        )}
        <p className="mt-2 font-mono text-xs text-mute">
          treasury USDC {usdc(r.balanceBefore)} → <span className="text-ink">{usdc(r.balanceAfter)}</span>
        </p>
      </div>
      {scope && compare && <MoneyShot asked={BigInt(scope.childValue)} allowed={BigInt(scope.parentValue)} />}
    </div>
  );
}

export function Breaker({ s }: { s: StageState }) {
  const first = s.responses[0];
  const last = s.responses.at(-1);
  return (
    <section aria-label="Payment service checks" className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mute">The breaker checks</h2>
      {s.request && (
        <p className="text-sm">
          settle agent signs a request: <span className="font-mono font-semibold">{usdc(s.request.amount)} USDC</span> to <span className="font-mono">{s.request.target}</span>
        </p>
      )}
      {s.revoke && (
        <p className="rounded-md border border-red/60 bg-panel p-2 text-xs">
          Owner revoked <span className="font-mono">{s.revoke.name}</span> onchain:{" "}
          <a className="font-mono underline" href={etherscanTx(s.revoke.txHash)} target="_blank" rel="noreferrer">{short(s.revoke.txHash)} ↗</a>
        </p>
      )}
      {!last && <p className="text-sm text-mute">Every request is re-checked from the root. Any check that cannot complete denies.</p>}
      {last && <Checklist r={last} />}
      {s.world && (
        <div className="rounded-md border border-amber/70 bg-panel p-3 text-sm">
          <p className="font-semibold text-amber">Above the human threshold: the verified owner must approve this exact request.</p>
          <p className="font-mono text-[10.5px] text-mute">request {short(s.world.requestHash, 8)}</p>
          {!s.world.status && (
            <a href={s.world.approveUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-sm bg-amber px-3 py-1.5 font-semibold text-bg">
              Approve with World ID ↗
            </a>
          )}
          {s.world.status && (
            <p className={`mt-2 font-semibold ${s.world.status === "approved" ? "text-lime" : "text-red"}`}>
              World: {s.world.status}{s.world.reason ? `: ${s.world.reason}` : ""}
            </p>
          )}
        </div>
      )}
      <AnimatePresence>{last && <Result key={s.responses.length} r={last} />}</AnimatePresence>
      {s.replay && (
        <div className="rounded-md border border-red/60 bg-panel p-3">
          <p className="text-sm">Replaying the exact same signed request…</p>
          <p className="font-display text-xl font-bold text-red">{s.replay.decision}</p>
          <p className="text-sm">{s.replay.checks.find((c) => !c.ok)?.plainEnglish}</p>
          <p className="font-mono text-xs text-mute">treasury USDC {usdc(s.replay.balanceBefore)} → {usdc(s.replay.balanceAfter)}</p>
        </div>
      )}
      {first && first !== last && first.decision === "PENDING" && <p className="font-mono text-[10px] text-mute">first attempt: PENDING (held for human approval, nonce not burned)</p>}
    </section>
  );
}
