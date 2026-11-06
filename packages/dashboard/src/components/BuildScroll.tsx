"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";

/**
 * Scroll-driven illustration: eight cursors (agents + services) build the page; procure gets hijacked and the breaker trips.
 * Numbers mirror the live demo (500 → 300 → 150 permits, 450 injected, 5.00 honest, 2.00 World threshold).
 * Everything is a pure function of scroll progress p ∈ [0,1]. Autoplays on open until the visitor scrolls, clicks or presses a key.
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

// Geometry in % of the canvas.
const CARD_TOP = 40, CARD_H = 25, CARD_W = 19;
const cardLeft = (i: number) => 3 + i * 24.5;
const ri = (i: number) => cardLeft(i) + CARD_W;
const CARD_DRAW: [number, number][] = [[0.26, 0.31], [0.31, 0.36], [0.36, 0.41], [0.41, 0.46]];
const ENS_AT = (i: number) => 0.46 + i * 0.016;
const ARKIV_AT = (i: number) => 0.47 + i * 0.016;
const MAX = ["ROOT", "500.00", "300.00", "150.00"];
const WIRE = [14, 10, 6, 3];
const PAY = { l: 3, t: 77, w: 54, h: 15, draw: [0.53, 0.56] as const };
const VERDICT = { l: 61, t: 73, w: 36, h: 21, draw: [0.62, 0.645] as const };

const L1 = "Agents can subcontract work.";
const L2 = "Authority must not expand.";

const STEPS: { from: number; n: string; title: string; body: string }[] = [
  { from: 0, n: "01", title: "A human owns the treasury.", body: "The root issuer is linked to one World ID human. It is the only root the payment service trusts." },
  { from: 0.26, n: "02", title: "Agents subcontract.", body: "Each hop signs a narrower EIP-712 permit: 500 → 300 → 150. Authority can shrink. It cannot grow." },
  { from: 0.46, n: "03", title: "Named on ENS, stored on Arkiv.", body: "Every agent gets an ENS name; every signed permit is an Arkiv entity anyone can query and re-verify." },
  { from: 0.53, n: "04", title: "A poisoned invoice asks for 450.", body: "The service re-checks every signature and every limit on the chain. Denied. Nothing moves." },
  { from: 0.74, n: "05", title: "The honest invoice: 5.00.", body: "Above the 2.00 threshold, so the owner approves this one request with World ID. Then it pays." },
  { from: 0.92, n: "06", title: "Now try to break it.", body: "Every run on the demo stage is live on Sepolia, ENS and Arkiv." },
];

/** Figma-style selection: dashed outline, 8 handles, size label. Parent must be positioned. */
export function Sel({ show, label, tone = "lime" }: { show: boolean; label?: string; tone?: "lime" | "red" }) {
  if (!show) return null;
  const c = tone === "red" ? "border-red" : "border-lime";
  const h = `absolute h-2 w-2 border ${c} bg-bg`;
  return (
    <div className={`pointer-events-none absolute -inset-1.5 border border-dashed ${c}`} aria-hidden>
      {["-left-1 -top-1", "left-1/2 -top-1 -ml-1", "-right-1 -top-1", "-right-1 top-1/2 -mt-1", "-right-1 -bottom-1", "left-1/2 -bottom-1 -ml-1", "-left-1 -bottom-1", "-left-1 top-1/2 -mt-1"].map((pos) => (
        <span key={pos} className={`${h} ${pos}`} />
      ))}
      {label && <span className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] text-bg ${tone === "red" ? "bg-red" : "bg-lime"}`}>{label}</span>}
    </div>
  );
}

function Inner({ d, children, className = "" }: { d: number; children: ReactNode; className?: string }) {
  return <div className={`h-full w-full overflow-hidden ${className}`} style={{ opacity: seg(d, 0.6, 1) }}>{children}</div>;
}

export function BuildScroll({ names }: { names: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [raw, setRaw] = useState(0);
  const [auto, setAuto] = useState(false);
  const [run, setRun] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setRaw);
  const p = reduce ? 1 : raw;

  // Autoplay: scroll through the build on open; any user input hands control back.
  useEffect(() => {
    if (reduce || !ref.current || (run === 0 && window.scrollY > 10)) return;
    const el = ref.current;
    const top = el.offsetTop;
    // Hero build in ~11 s, then the rest of the page at the same speed so every section builds as it passes.
    const speed = (el.offsetHeight - window.innerHeight) / 11_000;
    const dist = document.documentElement.scrollHeight - window.innerHeight - top;
    const DURATION = dist / speed;
    let start: number | undefined;
    let id = 0;
    const stop = () => {
      cancelAnimationFrame(id);
      setAuto(false);
      for (const e of ["wheel", "touchstart", "keydown", "mousedown"]) window.removeEventListener(e, stop);
    };
    const step = (t: number) => {
      start ??= t;
      const k = Math.min(1, (t - start) / DURATION);
      window.scrollTo(0, top + dist * k);
      if (k < 1) id = requestAnimationFrame(step);
      else stop();
    };
    for (const e of ["wheel", "touchstart", "keydown", "mousedown"]) window.addEventListener(e, stop, { passive: true });
    window.scrollTo(0, top);
    setAuto(true);
    id = requestAnimationFrame(step);
    return stop;
  }, [reduce, run]);

  const W = canvas.current?.clientWidth ?? 1200;
  const H = canvas.current?.clientHeight ?? 600;
  const px = (pctW: number, pctH: number) => `${Math.round((pctW / 100) * W)} × ${Math.round((pctH / 100) * H)}`;

  // State
  const l1 = typed(L1, p, 0.02, 0.12);
  const l2 = typed(L2, p, 0.13, 0.22);
  const rogueAmt = typed("450.00", p, 0.57, 0.61);
  const honestAmt = typed("5.00", p, 0.75, 0.79);
  const denied = p >= 0.645 && p < 0.74;
  const pending = p >= 0.8 && p < 0.875;
  const executed = p >= 0.875;
  const rogue = p >= 0.555 && p < 0.74;
  const shake = p >= 0.645 && p < 0.68 ? Math.sin(p * 2400) : 0;
  const typingOwner = p >= 0.02 && p < 0.225;
  const typingRogue = p >= 0.565 && p < 0.62;
  const typingSettle = p >= 0.745 && p < 0.8;
  const worldChip = seg(p, 0.23, 0.25);

  const caretPos = (): [number, number] | undefined => {
    const c = caret.current?.getBoundingClientRect();
    const b = canvas.current?.getBoundingClientRect();
    if (!c || !b || !b.width) return undefined;
    return [((c.right - b.left) / b.width) * 100, ((c.bottom - b.top) / b.height) * 100];
  };
  const cp = typingOwner || typingRogue || typingSettle ? caretPos() : undefined;

  const cursors: { id: string; label: string; tag: string; pos: [number, number] }[] = [
    { id: "owner", label: names[0] ?? "treasury", tag: "bg-lime text-bg",
      pos: typingOwner && cp ? cp : at([[0, 104, 8], [0.02, 6, 16], [0.225, 60, 30], [0.26, cardLeft(0), CARD_TOP], [0.31, ri(0), CARD_TOP + CARD_H], [0.34, 20, 104]], p) },
    { id: "world", label: "World ID", tag: "bg-ink text-bg",
      pos: at([[0.2, -4, 30], [0.23, 4, 33], [0.26, 6, 34], [0.29, -4, 40], [0.81, -4, 90], [0.85, VERDICT.l + 3, VERDICT.t + 17], [0.88, VERDICT.l + 3, VERDICT.t + 17], [0.92, 104, 100]], p) },
    { id: "ops", label: names[1] ?? "ops", tag: "bg-ink text-bg",
      pos: at([[0.27, cardLeft(1), 104], [0.31, cardLeft(1), CARD_TOP], [0.36, ri(1), CARD_TOP + CARD_H], [0.4, 40, 104]], p) },
    { id: "procure", label: rogue ? `${names[2] ?? "procure"} · injected` : names[2] ?? "procure", tag: rogue ? "bg-red text-bg" : "bg-ink text-bg",
      pos: typingRogue && cp ? cp : at([[0.32, cardLeft(2), 104], [0.36, cardLeft(2), CARD_TOP], [0.41, ri(2), CARD_TOP + CARD_H], [0.555, 22, 87], [0.565, 22, 87], [0.7, 30, 88], [0.74, 50, 104]], p) },
    { id: "settle", label: names[3] ?? "settle", tag: "bg-ink text-bg",
      pos: typingSettle && cp ? cp : at([[0.37, 104, CARD_TOP], [0.41, cardLeft(3), CARD_TOP], [0.46, ri(3), CARD_TOP + CARD_H], [0.53, PAY.l, PAY.t], [0.56, PAY.l + PAY.w, PAY.t + PAY.h], [0.6, 70, 104], [0.74, 24, 88], [0.8, 26, 88], [0.84, 104, 92]], p) },
    { id: "ens", label: "ENS resolver", tag: "bg-ink text-bg",
      pos: at([[0.44, cardLeft(0), -4], ...[0, 1, 2, 3].map((i): Key => [ENS_AT(i) + 0.016, cardLeft(i) + 14, CARD_TOP + 4]), [0.54, 104, 20]], p) },
    { id: "arkiv", label: "Arkiv", tag: "bg-ink text-bg",
      pos: at([[0.45, cardLeft(0), 104], ...[0, 1, 2, 3].map((i): Key => [ARKIV_AT(i) + 0.016, ri(i) - 3, CARD_TOP + CARD_H - 3]), [0.55, 104, 70]], p) },
    { id: "service", label: "payment service", tag: denied ? "bg-red text-bg" : "bg-ink text-bg",
      pos: at([[0.6, 104, VERDICT.t], [0.62, VERDICT.l, VERDICT.t], [0.645, VERDICT.l + VERDICT.w, VERDICT.t + VERDICT.h], [0.7, VERDICT.l + VERDICT.w - 2, VERDICT.t + VERDICT.h], [0.74, 104, 104]], p) },
    { id: "model", label: "Groq · invoice reader", tag: rogue ? "bg-red text-bg" : "bg-ink text-bg",
      pos: at([[0.5, -4, 70], [0.54, 14, 72], [0.57, 16, 74], [0.6, -4, 80]], p) },
    { id: "registry", label: "RevocationRegistry", tag: "bg-ink text-bg",
      pos: at([[0.6, 50, 104], [0.635, VERDICT.l + 20, VERDICT.t + 8], [0.66, VERDICT.l + 24, VERDICT.t + 10], [0.7, 50, 104]], p) },
    { id: "usdc", label: "USDC · Sepolia", tag: executed ? "bg-lime text-bg" : "bg-ink text-bg",
      pos: at([[0.86, 104, 60], [0.9, VERDICT.l + 26, VERDICT.t + 14], [0.94, VERDICT.l + 28, VERDICT.t + 15], [0.98, 104, 60]], p) },
    { id: "auditor", label: "auditor · mandate verify", tag: "bg-ink text-bg",
      pos: at([[0.84, cardLeft(0), -4], [0.88, cardLeft(1) + 8, CARD_TOP + 6], [0.91, cardLeft(2) + 8, CARD_TOP + 6], [0.94, cardLeft(3) + 8, CARD_TOP + 6], [0.98, 104, 30]], p) },
  ];

  const step = [...STEPS].reverse().find((s) => p >= s.from) ?? STEPS[0]!;
  const caretEl = <span ref={caret} className="caret" aria-hidden />;
  const amount = p < 0.74 ? rogueAmt : honestAmt;
  const payD = seg(p, ...PAY.draw);
  const verdictD = seg(p, ...VERDICT.draw);

  const box = (b: { l: number; t: number; w: number; h: number }, d: number) => ({
    left: `${b.l}%`, top: `${b.t}%`, width: `${b.w * d}%`, height: `${b.h * d}%`, opacity: d > 0 ? 1 : 0,
  });

  return (
    <section ref={ref} className={reduce ? "" : "relative h-[400vh] overflow-x-clip"} aria-label="How Mandate works">
      <div className={reduce ? "px-4 py-8" : "sticky top-[53px] flex h-[calc(100vh-53px)] flex-col px-6 pb-4 pt-3"}>
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
          <div ref={canvas} className="relative min-h-[520px] flex-1">
            <div className="orb pointer-events-none absolute -right-[10%] -top-[25%] aspect-square w-[60%] rounded-full" aria-hidden />
            {/* Headline */}
            <h1 className="absolute left-[3%] top-[6%] font-display text-[clamp(30px,5vw,80px)] font-medium leading-[0.98] tracking-tight">
              <span>{l1}{typingOwner && l2 === "" && caretEl}</span>
              <br />
              <span className="text-lime">{l2}{typingOwner && l2 !== "" && caretEl}</span>
              <Sel show={typingOwner} label={`h1 · ${names[0] ?? "owner"}`} />
            </h1>

            {/* World chip */}
            <div className="absolute left-[3%] top-[31%] flex items-center gap-2 border border-line bg-panel px-3 py-1.5 font-mono text-[11px]" style={{ opacity: worldChip }}>
              <span className="h-1.5 w-1.5 bg-lime" /> {names[0]} · linked to one World ID human
            </div>

            {/* Wires: thinner each hop because authority narrows */}
            {[0, 1, 2].map((i) => {
              const d = seg(p, CARD_DRAW[i + 1]![0], CARD_DRAW[i + 1]![0] + 0.03);
              const tripped = denied && i === 2;
              return (
                <div key={i} className={`absolute origin-left ${tripped ? "bg-red" : "bg-lime"} ${d >= 1 && !tripped ? "wire-pulse" : ""}`}
                  style={{ left: `${ri(i)}%`, width: `${cardLeft(i + 1) - ri(i)}%`, top: `calc(${CARD_TOP + CARD_H / 2}% - ${WIRE[i + 1]! / 2}px)`, height: WIRE[i + 1], transform: `scaleX(${d})` }} />
              );
            })}

            {/* Permit cards, dragged out by their issuers */}
            {[0, 1, 2, 3].map((i) => {
              const d = seg(p, CARD_DRAW[i]![0], CARD_DRAW[i]![1]);
              const tripped = denied && i === 3;
              const named = typed(names[i] ?? "", p, ENS_AT(i), ENS_AT(i) + 0.016);
              const stored = p >= ARKIV_AT(i) + 0.012;
              return (
                <div key={i} className={`absolute rounded-2xl border bg-panel ${tripped ? "border-red" : "border-transparent"}`}
                  style={box({ l: cardLeft(i), t: CARD_TOP, w: CARD_W, h: CARD_H }, ease(d))}>
                  <Inner d={d} className="p-[6%]">
                    <div className="truncate font-mono text-[11px] text-lime">{named || <span className="text-mute">unnamed agent</span>}</div>
                    <div className="mt-1 font-mono text-[11px] text-mute">pay · supplier-A</div>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-mute">{i === 0 ? "issuer · World-linked" : "max / request"}</div>
                    <div className={`font-display text-[clamp(18px,2.2vw,34px)] font-medium tabular-nums ${tripped ? "text-red" : "text-pink"}`}>
                      {typed(MAX[i]!, p, CARD_DRAW[i]![1] - 0.02, CARD_DRAW[i]![1])}
                    </div>
                    {stored && <div className="absolute bottom-2 right-2 border border-line px-1.5 font-mono text-[10px] text-mute">arkiv ✓ signed</div>}
                  </Inner>
                  <Sel show={d > 0 && p < CARD_DRAW[i]![1] + 0.012} label={px(CARD_W * ease(d), CARD_H * ease(d))} />
                </div>
              );
            })}

            {/* Payment request */}
            <div className={`absolute rounded-md border bg-panel ${rogue ? "border-red" : "border-transparent"}`} style={{ ...box(PAY, ease(payD)), transform: `translateX(${shake * 0.8}%)` }}>
              <Inner d={payD} className="flex items-center gap-3 px-4">
                <span className="font-mono text-xs text-mute">pay</span>
                <span className={`min-w-[7ch] border-b font-display text-[clamp(20px,2.4vw,38px)] font-medium tabular-nums ${p < 0.74 ? "border-red text-red" : "border-lime"} ${denied ? "line-through" : ""}`}>
                  {amount}{(typingRogue || typingSettle) && caretEl}
                </span>
                <span className="font-mono text-xs text-mute">USDC → supplier-A</span>
              </Inner>
              <Sel show={(payD > 0 && p < PAY.draw[1] + 0.01) || typingRogue} tone={typingRogue ? "red" : "lime"} label={typingRogue ? "input · injected" : px(PAY.w * payD, PAY.h * payD)} />
            </div>

            {/* Breaker verdict */}
            <div className={`absolute rounded-md border-l-4 bg-panel ${denied ? "border-red" : pending ? "border-amber" : executed ? "border-lime" : "border-line"}`} style={box(VERDICT, ease(verdictD))}>
              <Inner d={verdictD} className="px-4 py-3">
                <div className={`font-display text-[clamp(18px,2vw,30px)] font-medium ${denied ? "text-red" : pending ? "text-amber" : "text-lime"}`}>
                  {denied ? "DENIED · leaf_scope" : pending ? "PENDING · World approval" : executed ? "EXECUTED" : "checking 12 steps…"}
                </div>
                <div className="mt-1 font-mono text-xs text-mute">
                  {denied ? "asked 450.00 · allowed 150.00 · no funds moved" : pending ? "5.00 > 2.00 threshold · owner must approve" : executed ? "5.00 USDC sent on Sepolia · receipt on Arkiv" : "signatures · narrowing · revocation"}
                </div>
                {(pending || executed) && (
                  <div className={`mt-2 inline-block px-3 py-1 text-xs font-semibold ${executed ? "border border-lime text-lime" : "bg-lime text-bg"}`}>
                    {executed ? "Approved by World ID ✓" : "Approve with World ID"}
                  </div>
                )}
              </Inner>
              <Sel show={verdictD > 0 && p < VERDICT.draw[1] + 0.01} label={px(VERDICT.w * verdictD, VERDICT.h * verdictD)} />
            </div>

            {/* CTA */}
            <div className="absolute bottom-[4%] right-[3%] flex gap-2" style={{ opacity: seg(p, 0.92, 0.96), pointerEvents: p > 0.92 ? "auto" : "none" }}>
              <Link href="/stage" className="btn-aurora px-6 py-4">Run it live →</Link>
              <Link href="/docs" className="btn-ghost bg-bg px-6 py-4">Read the docs</Link>
            </div>

            {/* Cursors */}
            {!reduce && cursors.map((c) => (
              <div key={c.id} className="pointer-events-none absolute z-10" aria-hidden
                style={{ left: `${c.pos[0]}%`, top: `${c.pos[1]}%`, opacity: c.pos[0] > -1 && c.pos[0] < 101 && c.pos[1] > -1 && c.pos[1] < 101 ? 1 : 0, transform: `translateX(${c.id === "procure" ? shake * 6 : 0}px)` }}>
                <svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.5 11.5 L13 11.5 Z" fill={c.tag.includes("bg-red") ? "#ff4d4d" : c.tag.includes("bg-lime") ? "#c6ff3d" : "#e6e8eb"} stroke="#0b0d10" strokeWidth="1.2" /></svg>
                <span className={`ml-3 whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] ${c.tag}`}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Narration */}
          <div className="flex items-baseline gap-4 border-t border-line py-3" aria-live="polite">
            <span className="font-mono text-xs text-lime">{step.n}</span>
            <span className="font-mono text-[10px] uppercase text-mute">illustration</span>
            <span className="font-display text-lg font-medium">{step.title}</span>
            <span className="hidden text-sm text-mute md:inline">{step.body}</span>
            {!reduce && (
              <button onClick={() => (auto ? window.dispatchEvent(new Event("wheel")) : setRun((r) => r + 1))}
                className="ml-auto shrink-0 border border-line px-2 py-1 font-mono text-xs text-mute hover:text-ink">
                {auto ? "autoplay · scroll to take over" : "▶ replay"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
