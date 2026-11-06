"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";

/**
 * Scroll-driven illustration: four agent cursors build the page, one gets hijacked and the breaker trips.
 * Numbers mirror the live demo (500 → 300 → 150 permits, 450 injected, 5.00 honest, 2.00 World threshold).
 * Everything is a pure function of scroll progress p ∈ [0,1].
 */

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, s: number, e: number) => clamp((p - s) / (e - s));
const typed = (text: string, p: number, s: number, e: number) => text.slice(0, Math.round(text.length * seg(p, s, e)));
const ease = (t: number) => t * t * (3 - 2 * t);

type Key = [p: number, x: number, y: number];
function at(keys: Key[], p: number): [number, number] {
  if (p <= keys[0]![0]) return [keys[0]![1], keys[0]![2]];
  for (let i = 1; i < keys.length; i++) {
    const [p1, x1, y1] = keys[i]!;
    const [p0, x0, y0] = keys[i - 1]!;
    if (p <= p1) {
      const t = ease((p - p0) / (p1 - p0 || 1));
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
  }
  const last = keys.at(-1)!;
  return [last[1], last[2]];
}

// Card geometry, in % of the canvas.
const CARD_TOP = 40, CARD_H = 24, CARD_W = 19;
const cardLeft = (i: number) => 3 + i * 24.5;
const CARD_DRAW: [number, number][] = [[0.25, 0.3], [0.3, 0.36], [0.36, 0.42], [0.42, 0.48]];
const MAX = ["500.00", "300.00", "150.00", "150.00"];
const WIRE = [14, 10, 6, 3];

const L1 = "Agents can subcontract work.";
const L2 = "Authority must not expand.";

const STEPS: { from: number; n: string; title: string; body: string }[] = [
  { from: 0, n: "01", title: "A human owns the treasury.", body: "The root is World-verified. It is the only issuer the payment service trusts." },
  { from: 0.24, n: "02", title: "Agents subcontract.", body: "Each hop signs a narrower permit: 500 → 300 → 150. Authority can shrink. It cannot grow." },
  { from: 0.48, n: "03", title: "A poisoned invoice asks for 450.", body: "The service re-checks every signature and every limit on the chain. Denied. Nothing moves." },
  { from: 0.72, n: "04", title: "The honest invoice: 5.00.", body: "Above the 2.00 threshold, so the owner approves this one request with World ID. Then it pays." },
  { from: 0.9, n: "05", title: "Now try to break it.", body: "Every run on the stage is live: Sepolia, ENS, Arkiv." },
];

export function BuildScroll({ names }: { names: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [raw, setRaw] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setRaw);
  const p = reduce ? 1 : raw;

  // Typing state
  const l1 = typed(L1, p, 0.02, 0.13);
  const l2 = typed(L2, p, 0.14, 0.23);
  const rogueAmt = typed("450.00", p, 0.51, 0.57);
  const honestAmt = typed("5.00", p, 0.74, 0.79);
  const denied = p >= 0.58 && p < 0.72;
  const pending = p >= 0.8 && p < 0.88;
  const executed = p >= 0.88;
  const rogue = p >= 0.49 && p < 0.72;
  const shake = p >= 0.58 && p < 0.63 ? Math.sin(p * 2400) * 0.8 : 0;
  const typingOwner = p >= 0.02 && p < 0.235;
  const typingRogue = p >= 0.505 && p < 0.58;
  const typingSettle = p >= 0.735 && p < 0.8;

  // Cursor follows the caret while typing (measured from the previous frame; one-frame lag is invisible).
  const caretPos = (): [number, number] | undefined => {
    const c = caret.current?.getBoundingClientRect();
    const b = canvas.current?.getBoundingClientRect();
    if (!c || !b || !b.width) return undefined;
    return [((c.right - b.left) / b.width) * 100, ((c.bottom - b.top) / b.height) * 100];
  };
  const cp = typingOwner || typingRogue || typingSettle ? caretPos() : undefined;
  const ri = (i: number) => cardLeft(i) + CARD_W;

  const cursors = [
    {
      id: "owner", label: names[0] ?? "treasury", tag: "bg-lime text-bg",
      pos: typingOwner && cp ? cp : at([[0, 104, 8], [0.02, 6, 16], [0.235, 60, 30], [0.25, cardLeft(0), CARD_TOP], [0.3, ri(0), CARD_TOP + CARD_H], [0.34, 30, 104], [0.82, 90, 104], [0.86, 81, 86], [0.9, 81, 86], [0.94, 104, 96]], p),
    },
    {
      id: "ops", label: names[1] ?? "ops", tag: "bg-ink text-bg",
      pos: at([[0.26, cardLeft(1), 104], [0.3, cardLeft(1), CARD_TOP], [0.36, ri(1), CARD_TOP + CARD_H], [0.4, 40, 104]], p),
    },
    {
      id: "procure", label: rogue ? `${names[2] ?? "procure"} · injected` : names[2] ?? "procure", tag: rogue ? "bg-red text-bg" : "bg-ink text-bg",
      pos: typingRogue && cp ? cp : at([[0.32, cardLeft(2), 104], [0.36, cardLeft(2), CARD_TOP], [0.42, ri(2), CARD_TOP + CARD_H], [0.5, 24, 86], [0.58, 30, 86], [0.66, 32, 87], [0.72, 50, 104]], p),
    },
    {
      id: "settle", label: names[3] ?? "settle", tag: "bg-ink text-bg",
      pos: typingSettle && cp ? cp : at([[0.38, 104, CARD_TOP], [0.42, cardLeft(3), CARD_TOP], [0.48, ri(3), CARD_TOP + CARD_H], [0.6, 96, 72], [0.73, 24, 86], [0.8, 28, 86], [0.84, 104, 90]], p),
    },
  ];

  const step = [...STEPS].reverse().find((s) => p >= s.from) ?? STEPS[0]!;
  const caretEl = <span ref={caret} className="caret" aria-hidden />;
  const amount = p < 0.72 ? rogueAmt : honestAmt;

  return (
    <section ref={ref} className={reduce ? "" : "relative h-[700vh]"} aria-label="How Mandate works">
      <div className={reduce ? "px-4 py-8" : "sticky top-[53px] flex h-[calc(100vh-53px)] flex-col px-4 pb-4 pt-3"}>
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
          <div className="flex items-center gap-3 border border-b-0 border-line bg-panel px-3 py-2 font-mono text-[11px] text-mute">
            <span className="h-2 w-2 rounded-full bg-line" /><span className="h-2 w-2 rounded-full bg-line" /><span className="h-2 w-2 rounded-full bg-line" />
            <span className="ml-2">mandate · illustration of the live flow</span>
            <span className="ml-auto tabular-nums">{String(Math.round(p * 100)).padStart(3, "0")}%</span>
          </div>

          <div ref={canvas} className="relative min-h-[520px] flex-1 overflow-hidden border border-line bg-bg"
            style={{ backgroundImage: "radial-gradient(#1a1e25 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
            {/* Headline being typed */}
            <h1 className="absolute left-[3%] top-[7%] max-w-[94%] font-display text-[clamp(30px,5.2vw,84px)] font-extrabold leading-[0.98] tracking-tight">
              <span>{l1}{typingOwner && l2 === "" && caretEl}</span>
              <br />
              <span className="text-lime">{l2}{typingOwner && l2 !== "" && caretEl}</span>
            </h1>

            {/* Wires: thinner at each hop because authority narrows */}
            {[0, 1, 2].map((i) => {
              const d = seg(p, CARD_DRAW[i + 1]![0], CARD_DRAW[i + 1]![0] + 0.03);
              const tripped = denied && i === 2;
              return (
                <div key={i} className={`absolute origin-left ${tripped ? "bg-red" : "bg-lime"}`}
                  style={{ left: `${ri(i)}%`, width: `${cardLeft(i + 1) - ri(i)}%`, top: `calc(${CARD_TOP + CARD_H / 2}% - ${WIRE[i + 1]! / 2}px)`, height: WIRE[i + 1], transform: `scaleX(${d})` }} />
              );
            })}

            {/* Permit cards, dragged out by their issuers */}
            {[0, 1, 2, 3].map((i) => {
              const d = seg(p, CARD_DRAW[i]![0], CARD_DRAW[i]![1]);
              const tripped = denied && i === 3;
              const inset = `${(1 - d) * 100}%`;
              return (
                <div key={i} className={`absolute border bg-panel p-[1.1%] ${tripped ? "border-red" : d >= 1 ? "border-line" : "border-dashed border-lime"}`}
                  style={{ left: `${cardLeft(i)}%`, top: `${CARD_TOP}%`, width: `${CARD_W}%`, height: `${CARD_H}%`, clipPath: `inset(0 ${inset} ${inset} 0)`, opacity: d > 0 ? 1 : 0 }}>
                  <div className="truncate font-mono text-[11px] text-mute">{names[i]}</div>
                  <div className="mt-1 font-mono text-[11px] text-mute">pay · supplier-A</div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-mute">max / request</div>
                  <div className={`font-display text-[clamp(18px,2.2vw,34px)] font-bold tabular-nums ${tripped ? "text-red" : ""}`}>
                    {typed(MAX[i]!, p, CARD_DRAW[i]![1] - 0.02, CARD_DRAW[i]![1])}
                  </div>
                </div>
              );
            })}

            {/* Payment request */}
            <div className="absolute left-[3%] top-[76%] flex w-[56%] items-center gap-3 border border-line bg-panel px-4 py-3"
              style={{ opacity: seg(p, 0.47, 0.5), transform: `translateX(${shake}%)` }}>
              <span className="font-mono text-xs text-mute">pay</span>
              <span className={`min-w-[7ch] border-b font-display text-[clamp(20px,2.4vw,38px)] font-bold tabular-nums ${p < 0.72 ? "border-red text-red" : "border-lime"} ${denied ? "line-through" : ""}`}>
                {amount}{(typingRogue || typingSettle) && caretEl}
              </span>
              <span className="font-mono text-xs text-mute">USDC → supplier-A</span>
            </div>

            {/* Breaker verdict */}
            {(denied || pending || executed) && (
              <div className={`absolute left-[62%] top-[73%] w-[35%] border-l-4 bg-panel px-4 py-3 ${denied ? "border-red" : pending ? "border-amber" : "border-lime"}`}>
                <div className={`font-display text-[clamp(18px,2vw,30px)] font-extrabold ${denied ? "text-red" : pending ? "text-amber" : "text-lime"}`}>
                  {denied ? "DENIED · leaf_scope" : pending ? "PENDING · World approval" : "EXECUTED"}
                </div>
                <div className="mt-1 font-mono text-xs text-mute">
                  {denied ? "asked 450.00 · allowed 150.00 · no funds moved" : pending ? "5.00 > 2.00 threshold · owner must approve" : "5.00 USDC sent on Sepolia"}
                </div>
                {pending && <div className="mt-2 inline-block bg-lime px-3 py-1 text-xs font-semibold text-bg">Approve with World ID</div>}
              </div>
            )}

            {/* CTA */}
            <div className="absolute bottom-[5%] right-[3%] flex gap-2 transition-opacity" style={{ opacity: seg(p, 0.92, 0.97), pointerEvents: p > 0.92 ? "auto" : "none" }}>
              <Link href="/stage" className="bg-lime px-5 py-3 font-semibold text-bg">Run it live →</Link>
              <Link href="/explorer" className="border border-line bg-panel px-5 py-3 font-semibold">Inspect the registry</Link>
            </div>

            {/* Agent cursors */}
            {!reduce && cursors.map((c) => (
              <div key={c.id} className="pointer-events-none absolute z-10 transition-transform duration-75"
                style={{ left: `${c.pos[0]}%`, top: `${c.pos[1]}%`, transform: `translate(${c.id === "procure" ? shake * 6 : 0}px, 0)` }} aria-hidden>
                <svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.5 11.5 L13 11.5 Z" fill="#e6e8eb" stroke="#0b0d10" strokeWidth="1.2" /></svg>
                <span className={`ml-3 whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] ${c.tag}`}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Narration */}
          <div className="flex items-baseline gap-4 border border-t-0 border-line bg-panel px-4 py-3" aria-live="polite">
            <span className="font-mono text-xs text-lime">{step.n}</span>
            <span className="font-display text-lg font-bold">{step.title}</span>
            <span className="text-sm text-mute">{step.body}</span>
            {p < 0.02 && !reduce && <span className="ml-auto animate-pulse font-mono text-xs text-mute">scroll ↓</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
