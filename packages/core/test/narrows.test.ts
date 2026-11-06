import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { narrows, narrowsChain, type Scope, type Dimension } from "../src/index";

const USDC = 1_000_000n;
const T = 2_000_000_000n;
const scope = (o: Partial<Scope> = {}): Scope => ({
  actions: ["pay"],
  maxAmount: 500n * USDC,
  expiry: T,
  targets: ["supplier-A"],
  ...o,
});

describe("narrows (examples)", () => {
  it("allows equality and strict narrowing", () => {
    expect(narrows(scope(), scope())).toEqual([]);
    expect(narrows(scope(), scope({ maxAmount: 150n * USDC, expiry: T - 1n }))).toEqual([]);
    expect(narrows(scope({ targets: ["*"] }), scope())).toEqual([]);
  });

  it("reports widened amount with values", () => {
    const v = narrows(scope({ maxAmount: 300n * USDC }), scope({ maxAmount: 1000n * USDC }));
    expect(v).toEqual([
      expect.objectContaining({ dimension: "maxAmount", parentValue: "300000000", childValue: "1000000000" }),
    ]);
  });

  it("reports changed action, changed target, wildcard escalation, later expiry — all at once", () => {
    const v = narrows(scope(), scope({ actions: ["pay", "withdraw"], targets: ["*"], expiry: T + 1n }));
    expect(v.map((x) => x.dimension).sort()).toEqual(["actions", "expiry", "targets"]);
    expect(narrows(scope(), scope({ targets: ["supplier-B"] }))[0]?.dimension).toBe("targets");
  });

  it("tags edge index at chain level", () => {
    const v = narrowsChain([scope(), scope({ maxAmount: 300n * USDC }), scope({ maxAmount: 1000n * USDC })]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ dimension: "maxAmount", edgeIndex: 1 });
  });
});

// ---------- property tests ----------
const ACTIONS = ["pay", "refund", "withdraw", "approve"];
const TARGETS = ["supplier-A", "supplier-B", "supplier-C"];
const sortedSubset = (pool: string[]) =>
  fc.subarray(pool, { minLength: 1 }).map((xs) => [...xs].sort());
const arbScope: fc.Arbitrary<Scope> = fc.record({
  actions: sortedSubset(ACTIONS),
  maxAmount: fc.bigInt({ min: 1n, max: 10n ** 12n }),
  expiry: fc.bigInt({ min: 0n, max: 4_000_000_000n }),
  targets: fc.oneof(fc.constant<string[]>(["*"]), sortedSubset(TARGETS)),
});

/** A child derived from parent that never widens. */
const arbNarrower = (p: Scope): fc.Arbitrary<Scope> =>
  fc.record({
    actions: sortedSubset(p.actions),
    maxAmount: fc.bigInt({ min: 1n, max: p.maxAmount }),
    expiry: fc.bigInt({ min: 0n, max: p.expiry }),
    targets: p.targets.includes("*") ? fc.oneof(fc.constant<string[]>(["*"]), sortedSubset(TARGETS)) : sortedSubset(p.targets),
  });

describe("narrows (properties)", () => {
  it("is reflexive", () => {
    fc.assert(fc.property(arbScope, (s) => narrows(s, s).length === 0));
  });

  it("is transitive", () => {
    const chain = arbScope.chain((a) => arbNarrower(a).chain((b) => arbNarrower(b).map((c) => [a, b, c] as const)));
    fc.assert(
      fc.property(chain, ([a, b, c]) => {
        expect(narrows(a, b)).toEqual([]);
        expect(narrows(b, c)).toEqual([]);
        expect(narrows(a, c)).toEqual([]);
      }),
    );
  });

  it("reports any widened dimension", () => {
    const dims: Dimension[] = ["actions", "maxAmount", "expiry", "targets"];
    fc.assert(
      fc.property(arbScope, fc.constantFrom(...dims), fc.bigInt({ min: 1n, max: 10n ** 6n }), (p, dim, delta) => {
        const c: Scope = { ...p };
        if (dim === "maxAmount") c.maxAmount = p.maxAmount + delta;
        if (dim === "expiry") c.expiry = p.expiry + delta;
        if (dim === "actions") {
          const extra = ACTIONS.find((a) => !p.actions.includes(a));
          fc.pre(extra !== undefined);
          c.actions = [...p.actions, extra!].sort();
        }
        if (dim === "targets") {
          fc.pre(!p.targets.includes("*"));
          c.targets = ["*"];
        }
        return narrows(p, c).some((v) => v.dimension === dim);
      }),
    );
  });
});
