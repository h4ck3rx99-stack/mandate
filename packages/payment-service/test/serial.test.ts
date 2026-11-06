import { expect, it } from "vitest";
import { serial } from "../src/serial";

it("serial runs calls one at a time, in order, and survives a failure", async () => {
  let active = 0, maxActive = 0;
  const log: number[] = [];
  const f = serial(async (n: number) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--; log.push(n);
    if (n === 2) throw new Error("boom");
    return n;
  });
  const out = await Promise.allSettled([f(1), f(2), f(3)]);
  expect(maxActive).toBe(1);
  expect(log).toEqual([1, 2, 3]);
  expect(out.map((o) => o.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
});
