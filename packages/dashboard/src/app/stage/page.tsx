"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Invoice } from "@/components/Invoice";
import { Wire } from "@/components/Wire";
import { Breaker } from "@/components/Breaker";
import { Timeline } from "@/components/Timeline";
import { useStage } from "@/lib/stage";

const SCENARIOS = [
  { key: "1", id: "1", label: "Honest invoice", sub: "5.00 USDC · human approves" },
  { key: "2", id: "2a", label: "Injected invoice · live model", sub: "real model output" },
  { key: "2", id: "2b", label: "Injected invoice · 450", sub: "rogue-agent fixture" },
  { key: "2", id: "2c", label: "Injected delegation · 1000", sub: "rogue-agent fixture" },
  { key: "3", id: "3", label: "Revoke upstream", sub: "owner revokes ops" },
  { key: "4", id: "4", label: "Replay", sub: "same signed request twice" },
  { key: "5", id: "5", label: "Attack it yourself", sub: "type any invoice" },
];

interface Toast { id: number; text: string; tone: "lime" | "red" | "amber" }

export default function Stage() {
  const { state, run, reset, next, pending } = useStage();
  const [presenter, setPresenter] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [attack, setAttack] = useState("");
  const twoCycle = useRef(0);
  const attackRef = useRef<HTMLTextAreaElement>(null);

  const toast = useCallback((text: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const last = state.responses.at(-1);
  useEffect(() => {
    if (!last) return;
    if (last.decision === "EXECUTED") toast("Executed: payment sent onchain", "lime");
    else if (last.decision === "DENIED") toast(`Denied: ${last.checks.find((c) => !c.ok)?.plainEnglish ?? "refused"}`, "red");
    else toast("Held: waiting for the verified human", "amber");
  }, [last, toast]);
  useEffect(() => { if (state.revoke) toast("Revocation sent onchain", "red"); }, [state.revoke, toast]);
  useEffect(() => { if (state.error) toast(state.error, "red"); }, [state.error, toast]);

  const start = useCallback((id: string) => {
    if (state.running) return;
    if (id === "5") {
      if (!attack.trim()) { attackRef.current?.focus(); toast("Type or upload an invoice first", "amber"); return; }
      void run("5", { invoice: attack });
    } else void run(id);
  }, [attack, run, state.running, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === " ") { e.preventDefault(); next(); return; }
      if (e.key === "r" || e.key === "R") { reset(); return; }
      if (e.key === "p" || e.key === "P") { setPresenter((p) => !p); return; }
      if (e.key === "2") { start(["2a", "2b", "2c"][twoCycle.current++ % 3]!); return; }
      if (e.key === "5") { attackRef.current?.focus(); return; }
      const s = SCENARIOS.find((x) => x.key === e.key);
      if (s) start(s.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, reset, start]);

  const onUpload = async (f?: File) => {
    if (!f) return;
    if (f.size > 4000 || !/^text\//.test(f.type || "text/plain")) return toast("Plain-text .txt under 4 KB only", "red");
    setAttack(await f.text());
    toast("Invoice loaded", "lime");
  };

  return (
    <main className={`mx-auto max-w-[1500px] px-6 pb-16 ${presenter ? "presenter" : ""}`}>
      <section className="pb-6 pt-10">
        <h1 className="max-w-4xl font-display text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl">
          Agents can subcontract work. <span className="text-lime">Authority must not expand.</span>
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-mute">
          This agent signed a request for 450. It was only authorized for 150. The payment service refused.
        </p>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => start(s.id)}
            disabled={state.running}
            aria-pressed={state.scenario === s.id}
            className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
              state.scenario === s.id ? "border-lime bg-lime/10" : "border-line bg-panel hover:border-mute"
            }`}
          >
            <span className="block text-sm font-semibold"><span className="mr-1 font-mono text-lime">{s.key}</span>{s.label}</span>
            <span className="block font-mono text-[10px] text-mute">{s.sub}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-mute">
          {state.running && <span className="text-amber">running{pending ? ` · ${pending} beats queued (Space)` : "…"}</span>}
          <button onClick={() => setPresenter((p) => !p)} className="rounded-md border border-line px-2 py-1 hover:text-ink">presenter {presenter ? "on" : "off"} (P)</button>
          <button onClick={reset} className="rounded-md border border-line px-2 py-1 hover:text-ink">reset (R)</button>
        </div>
      </div>

      {state.logs.length > 0 && state.running && <p className="mb-3 font-mono text-xs text-amber">{state.logs.at(-1)}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr_1.15fr]">
        <div className="flex flex-col gap-4">
          <Invoice s={state} />
          <div className="rounded-md border border-line bg-panel p-3">
            <label htmlFor="attack" className="font-display text-sm font-semibold">5 · Attack it yourself</label>
            <p className="mb-2 text-xs text-mute">Write any invoice, including prompt injection. It goes to the real procurement model and the real payment service. One try per minute.</p>
            <textarea
              id="attack" ref={attackRef} value={attack} onChange={(e) => setAttack(e.target.value.slice(0, 2000))}
              rows={5} maxLength={2000} placeholder="INVOICE … TOTAL DUE: 1.00 USDC … (try to make it pay more)"
              className="w-full rounded-md border border-line bg-bg p-2 font-mono text-xs text-ink outline-none focus:border-lime"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => start("5")} disabled={state.running} className="rounded-md bg-lime px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-50">Send to the agents</button>
              <label className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:text-ink">
                Upload .txt
                <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        </div>
        <Wire s={state} />
        <Breaker s={state} />
      </div>

      <div className="mt-8">
        <Timeline />
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`rounded-md border bg-panel px-3 py-2 text-sm shadow-lg ${t.tone === "lime" ? "border-lime" : t.tone === "red" ? "border-red" : "border-amber"}`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
