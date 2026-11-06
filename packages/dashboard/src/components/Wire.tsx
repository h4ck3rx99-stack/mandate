"use client";
import { motion } from "motion/react";
import type { Link, StageState } from "@/lib/stage";
import { short, usdc } from "@/lib/stage";

const WIDTHS = [14, 10, 6, 3]; // owner->ops->procure->settle: authority narrows down the wire

function PermitCard({ link, broken, revoked }: { link: Link; broken?: string[]; revoked?: boolean }) {
  const caveat = (k: string, v: string) => (
    <div className={`flex justify-between gap-2 ${broken?.includes(k) ? "text-red" : ""}`}>
      <span className="text-mute">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
  return (
    <div
      className={`group relative w-full rounded-md border bg-panel p-3 text-[12px] transition-colors hover:border-lime/60 ${
        broken?.length || revoked ? "border-red/70" : "border-line"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <a href={`/agent/${link.subjectName}`} className="truncate font-display text-[13px] font-semibold hover:text-lime">{link.subjectName}</a>
        <span className="shrink-0 font-mono text-[10px] text-mute">from {link.issuerName.split(".")[0]}</span>
      </div>
      <div className="grid gap-0.5">
        {caveat("maxAmount", `${usdc(link.scope.maxAmount)} USDC / req`)}
        {caveat("actions", link.scope.actions.join(", "))}
        {caveat("targets", link.scope.targets.join(", "))}
        {caveat("expiry", new Date(Number(link.scope.expiry) * 1000).toISOString().slice(5, 16).replace("T", " "))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
        <span className="rounded-md border border-line px-1.5 py-0.5" title={link.sig}>sig {short(link.sig, 4)}</span>
        <span className={`rounded-md border px-1.5 py-0.5 ${revoked ? "border-red text-red" : "border-line text-mute"}`}>{revoked ? "REVOKED onchain" : "not revoked"}</span>
        {link.arkivUrl ? (
          <a href={link.arkivUrl} target="_blank" rel="noreferrer" className="rounded-md border border-line px-1.5 py-0.5 hover:border-lime hover:text-lime">Arkiv ↗</a>
        ) : (
          <span className="rounded-md border border-line px-1.5 py-0.5 text-mute">not published</span>
        )}
      </div>
    </div>
  );
}

export function Wire({ s }: { s: StageState }) {
  const last = s.responses.at(-1);
  const links = [...s.links, ...(s.leaf ? [s.leaf] : [])];
  const violations = last?.violations ?? [];
  const brokenEdge = (i: number) => violations.filter((v) => v.edgeIndex === i - 1).map((v) => v.dimension); // link i is edge i-1
  const tripped = last?.decision === "DENIED";
  const passed = last?.decision === "EXECUTED";
  const revokedName = s.revoke?.name;
  const nodes = ["treasury owner", ...links.map((l) => l.subjectName.split(".")[0])];

  return (
    <section aria-label="Delegation wire" className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mute">Authority, flowing down</h2>
      <ol className="flex flex-col">
        <li className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-lime" aria-hidden />
          <span className="font-display text-sm font-semibold">{s.links[0]?.issuerName ?? "treasury owner"}</span>
          <span className="font-mono text-[10px] text-mute">root issuer · World-verified human</span>
        </li>
        {links.map((l, i) => {
          const broken = brokenEdge(i);
          const bad = broken.length > 0 || (revokedName && l.subjectName === revokedName);
          return (
            <li key={l.id} className="flex gap-3">
              <svg width="20" className="shrink-0" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden>
                <line x1="10" y1="0" x2="10" y2="100" stroke="#232831" strokeWidth={WIDTHS[i] ?? 3} />
                {!bad && <line x1="10" y1="0" x2="10" y2="100" stroke="#C6FF3D" strokeWidth={WIDTHS[i] ?? 3} className={s.running ? "wire-live" : ""} opacity={0.9} />}
                {bad && (
                  <>
                    <line x1="10" y1="0" x2="10" y2="42" stroke="#FF4D4D" strokeWidth={WIDTHS[i] ?? 3} />
                    <line x1="10" y1="58" x2="10" y2="100" stroke="#FF4D4D" strokeWidth={WIDTHS[i] ?? 3} opacity={0.35} />
                  </>
                )}
              </svg>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex-1 py-2">
                <PermitCard link={l} broken={broken} revoked={!!revokedName && l.subjectName === revokedName} />
                {broken.length > 0 && <p className="mt-1 text-[11px] font-semibold text-red">This hop tried to widen: {broken.join(", ")}</p>}
              </motion.div>
            </li>
          );
        })}
      </ol>
      {/* the breaker */}
      <div
        className={`flex items-center justify-between rounded-md border-2 px-4 py-3 ${tripped ? "border-red" : passed ? "border-lime" : "border-line"}`}
        role="status"
      >
        <span className="font-display text-sm font-medium uppercase tracking-widest">Payment service breaker</span>
        <span className={`font-mono text-sm font-medium ${tripped ? "text-red" : passed ? "text-lime" : last?.decision === "PENDING" ? "text-amber" : "text-mute"}`}>
          {tripped ? "TRIPPED" : passed ? "CLOSED · current passed" : last?.decision === "PENDING" ? "HELD · needs human" : "armed"}
        </span>
      </div>
      <p className="font-mono text-[10px] text-mute">{nodes.join("  →  ")}  →  breaker</p>
    </section>
  );
}
