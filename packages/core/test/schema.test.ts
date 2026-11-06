import { describe, expect, it } from "vitest";
import { executeBodySchema, scopeSchema } from "../src/index";

const h32 = "0x" + "11".repeat(32);
const sig = "0x" + "22".repeat(65);
const addr = "0x" + "33".repeat(20);
const scope = { actions: ["pay"], maxAmount: "150000000", expiry: "2000000000", targets: ["supplier-A"] };
const link = { v: 1, id: h32, parent: h32, issuer: addr, subject: addr, issuerName: "a.eth", subjectName: "b.a.eth", scope, nonce: h32, sig };
const request = { leafId: h32, audience: "svc", action: "pay", amount: "100000000", target: "supplier-A", nonce: h32, deadline: "2000000000", sig };

describe("schema", () => {
  it("accepts a valid body and parses amounts to bigint", () => {
    const r = executeBodySchema.parse({ chain: [link], request });
    expect(r.request.amount).toBe(100_000_000n);
    expect(r.chain[0]!.scope.maxAmount).toBe(150_000_000n);
  });

  it.each([
    ["unknown field on request", { chain: [link], request: { ...request, extra: 1 } }],
    ["unknown top-level field", { chain: [link], request, x: 1 }],
    ["unknown field on scope", { chain: [{ ...link, scope: { ...scope, foo: 1 } }], request }],
    ["zero amount", { chain: [link], request: { ...request, amount: "0" } }],
    ["negative amount", { chain: [link], request: { ...request, amount: "-5" } }],
    ["non-integer amount", { chain: [link], request: { ...request, amount: "1.5" } }],
    ["number instead of string", { chain: [link], request: { ...request, amount: 100 } }],
    ["empty chain", { chain: [], request }],
    ["depth > 8", { chain: Array(9).fill(link), request }],
  ])("rejects %s", (_name, body) => {
    expect(executeBodySchema.safeParse(body).success).toBe(false);
  });

  it("rejects mixed wildcard targets, unsorted or duplicate lists", () => {
    expect(scopeSchema.safeParse({ ...scope, targets: ["*", "supplier-A"] }).success).toBe(false);
    expect(scopeSchema.safeParse({ ...scope, actions: ["refund", "pay"] }).success).toBe(false);
    expect(scopeSchema.safeParse({ ...scope, actions: ["pay", "pay"] }).success).toBe(false);
    expect(scopeSchema.safeParse({ ...scope, targets: ["*"] }).success).toBe(true);
  });
});
