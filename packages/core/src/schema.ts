import { z } from "zod";

/** Bounds enforced at the trust boundary (POST /execute). */
export const MAX_CHAIN_DEPTH = 8;
const MAX_LIST = 32;
const MAX_STR = 128;
const UINT256_MAX = 2n ** 256n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte hex");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected address");
const sigHex = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "expected 65-byte signature");
const name = z.string().min(1).max(255);
const ident = z.string().min(1).max(MAX_STR).regex(/^[A-Za-z0-9._:-]+$/, "invalid identifier");

/** Decimal string (JSON transport for bigint). Strictly a non-negative integer, no leading +, no exponent. */
const uintString = (max: bigint) =>
  z
    .string()
    .regex(/^(0|[1-9][0-9]{0,77})$/, "expected non-negative integer string")
    .transform((s) => BigInt(s))
    .refine((n) => n <= max, "out of range");

const isSortedUnique = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1]! < x);

export const scopeSchema = z
  .strictObject({
    actions: z.array(ident).min(1).max(MAX_LIST).refine(isSortedUnique, "actions must be sorted and deduped"),
    maxAmount: uintString(UINT256_MAX).refine((n) => n > 0n, "maxAmount must be positive"),
    expiry: uintString(UINT64_MAX),
    targets: z
      .array(z.union([z.literal("*"), ident]))
      .min(1)
      .max(MAX_LIST)
      .refine(isSortedUnique, "targets must be sorted and deduped")
      .refine((ts) => !ts.includes("*") || ts.length === 1, 'targets is ["*"] or concrete IDs, never both'),
  });

export const delegationSchema = z.strictObject({
  v: z.literal(1),
  id: hex32,
  parent: hex32,
  issuer: address,
  subject: address,
  issuerName: name,
  subjectName: name,
  scope: scopeSchema,
  nonce: hex32,
  sig: sigHex,
});

export const executionRequestSchema = z.strictObject({
  leafId: hex32,
  audience: z.string().min(1).max(MAX_STR),
  action: ident,
  amount: uintString(UINT256_MAX).refine((n) => n > 0n, "amount must be positive"),
  target: ident,
  nonce: hex32,
  deadline: uintString(UINT64_MAX),
  worldApprovalRef: z.string().min(1).max(MAX_STR).optional(),
  sig: sigHex,
});

/** POST /execute body: root-first delegation chain + request. */
export const executeBodySchema = z.strictObject({
  chain: z.array(delegationSchema).min(1, "empty chain").max(MAX_CHAIN_DEPTH, `chain depth > ${MAX_CHAIN_DEPTH}`),
  request: executionRequestSchema,
});

export type ScopeInput = z.input<typeof scopeSchema>;
export type ExecuteBody = z.output<typeof executeBodySchema>;
