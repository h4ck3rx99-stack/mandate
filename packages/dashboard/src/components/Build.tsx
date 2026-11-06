"use client";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Sel } from "./BuildScroll";


export function Cursor({ label, tone = "ink" }: { label: string; tone?: "ink" | "lime" | "red" }) {
  const fill = tone === "red" ? "#ff4d4d" : tone === "lime" ? "#c6ff3d" : "#e6e8eb";
  return (
    <span className="pointer-events-none flex items-start" aria-hidden>
      <svg width="16" height="20" viewBox="0 0 16 20" className="shrink-0"><path d="M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.5 11.5 L13 11.5 Z" fill={fill} stroke="#0b0d10" strokeWidth="1.2" /></svg>
      <span className={`ml-1 mt-3 whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] font-normal normal-case not-italic tracking-normal ${tone === "lime" ? "bg-lime text-bg" : tone === "red" ? "bg-red text-bg" : "bg-ink text-bg"}`}>{label}</span>
    </span>
  );
}

/** 0→1 once the element is on screen, after `delay` ms, over `dur` ms. Reduced motion: always 1. */
function useBuild(delay: number, dur: number) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const [d, setD] = useState(0);
  useEffect(() => {
    if (reduce || !inView) return;
    let id = 0;
    let start: number | undefined;
    const step = (t: number) => {
      start ??= t + delay;
      const k = Math.min(1, Math.max(0, (t - start) / dur));
      setD(k);
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [inView, reduce, delay, dur]);
  return { ref, d: reduce ? 1 : d, reduce };
}

/** A block that a cursor drags out from its top-left corner, with resize handles and a live size label. */
export function Box({ children, by, delay = 0, dur = 650, as: Tag = "div", className = "" }: {
  children: ReactNode; by: string; delay?: number; dur?: number; as?: ElementType; className?: string;
}) {
  const { ref, d, reduce } = useBuild(delay, dur);
  const e = d * d * (3 - 2 * d);
  const building = d > 0 && d < 1;
  const w = ref.current?.offsetWidth ?? 0, h = ref.current?.offsetHeight ?? 0;
  return (
    <Tag ref={ref} className={`relative ${className}`}>
      <div style={{ clipPath: reduce ? undefined : `inset(0 ${(1 - e) * 100}% ${(1 - e) * 100}% 0)`, opacity: d > 0 ? 1 : 0 }}>{children}</div>
      {building && (
        <>
          <div className="pointer-events-none absolute left-0 top-0" style={{ width: `${e * 100}%`, height: `${e * 100}%` }}>
            <Sel show label={`${Math.round(w * e)} × ${Math.round(h * e)}`} />
          </div>
          <div className="absolute z-20" style={{ left: `${e * 100}%`, top: `${e * 100}%` }}><Cursor label={by} /></div>
        </>
      )}
    </Tag>
  );
}

/** Text typed in place by a cursor. Untyped text stays invisible so layout never shifts. */
export function Type({ text, by, delay = 0, cps = 70, tone = "ink" }: { text: string; by: string; delay?: number; cps?: number; tone?: "ink" | "lime" | "red" }) {
  const { ref, d } = useBuild(delay, (text.length / cps) * 1000);
  const n = Math.round(text.length * d);
  const typing = d > 0 && d < 1;
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      {typing && (
        <span className="relative inline-block" aria-hidden>
          <span className="caret" />
          <span className="absolute left-0 top-[85%] z-20"><Cursor label={by} tone={tone} /></span>
        </span>
      )}
      <span className="invisible" aria-hidden>{text.slice(n)}</span>
    </span>
  );
}
