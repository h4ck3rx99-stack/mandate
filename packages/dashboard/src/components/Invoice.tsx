"use client";
import type { StageState } from "@/lib/stage";

export function Invoice({ s }: { s: StageState }) {
  const inv = s.invoice;
  return (
    <section aria-label="Invoice" className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mute">Invoice</h2>
      <div className="min-h-[260px] rounded-md border border-line bg-panel p-4">
        {!inv ? (
          <p className="text-sm text-mute">Pick a scenario. The procurement agent will read an invoice here.</p>
        ) : (
          <>
            <p className="mb-2 font-mono text-[11px] text-mute">{inv.file}</p>
            <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink">
              {inv.text.split(/\r?\n/).map((line, i) =>
                inv.injectedLines.includes(line) ? (
                  <span key={i} className="block">
                    <span className="underline decoration-red decoration-2 underline-offset-4">{line}</span>{" "}
                    <span className="rounded-md bg-red px-1 font-sans text-[10px] font-medium uppercase text-bg">injected</span>
                  </span>
                ) : (
                  <span key={i} className="block">{line || " "}</span>
                ),
              )}
            </pre>
          </>
        )}
      </div>
      {s.models.map((m, i) => (
        <div key={i} className={`rounded-md border p-3 ${m.source === "llm" ? "border-line bg-panel" : "border-amber/60 bg-panel"}`}>
          <p className="mb-1 text-xs font-semibold">
            {m.source === "llm" ? <>Live model output <span className="font-mono text-mute">({m.model})</span>, verbatim</> : <span className="text-amber">ROGUE-AGENT FIXTURE: simulated fully-injected output, not model output</span>}
          </p>
          {m.note && <p className="mb-1 text-[11px] text-mute">{m.note}</p>}
          <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] text-ink/90">{m.raw}</pre>
        </div>
      ))}
    </section>
  );
}
