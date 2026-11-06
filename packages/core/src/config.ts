import { z } from "zod";
import type { Address, Hex } from "viem";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s as Address);
const pk = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s as Hex);
const big = z.string().regex(/^[0-9]+$/).transform(BigInt);

/** Payment-service config. Everything security-relevant comes from here, never from the request. */
export const serviceConfigSchema = z.object({
  CHAIN_ID: z.coerce.number().int().positive(),
  SEPOLIA_RPC_URL: z.string().url(),
  USDC_ADDRESS: address,
  REVOCATION_REGISTRY_ADDRESS: address,
  SERVICE_PRIVATE_KEY: pk,
  SERVICE_AUDIENCE: z.string().min(1),
  SERVICE_PORT: z.coerce.number().int().positive().default(8787),
  SERVICE_DB_PATH: z.string().min(1),
  PINNED_ROOT_ISSUER: address,
  WORLD_THRESHOLD_USDC_MINOR: big,
  MAX_REQUEST_TTL_SEC: big.default(300n),
  WORLD_APPROVAL_TTL_SEC: big.default(300n),
  // World ID Agent Pass (optional: /world routes are disabled when unset)
  WORLD_ISSUER: z.string().url().optional(),
  WORLD_CLIENT_ID: z.string().min(1).optional(),
  WORLD_CLIENT_SECRET: z.string().min(1).optional(),
  WORLD_REDIRECT_URI: z.string().url().optional(),
  WORLD_ACCEPTED_ACR: z.string().default("https://world.org/oidc/acr/orb,https://world.org/oidc/acr/orb-face"),
  /** JSON map target-id -> payee address, e.g. {"supplier-A":"0x..."} */
  TARGETS_JSON: z.string().transform((s, ctx) => {
    try {
      return z.record(z.string(), address).parse(JSON.parse(s));
    } catch {
      ctx.addIssue({ code: "custom", message: "TARGETS_JSON must be a JSON object of target -> address" });
      return z.NEVER;
    }
  }),
});
export type ServiceConfig = z.output<typeof serviceConfigSchema>;

export function loadServiceConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const r = serviceConfigSchema.safeParse(env);
  if (!r.success) throw new Error("Invalid service config:\n" + r.error.issues.map((i) => ` ${i.path.join(".")}: ${i.message}`).join("\n"));
  return r.data;
}

/** Load only ONE agent key from env (each agent holds only its own key). */
export function loadAgentKey(role: "OWNER" | "OPS" | "PROCURE" | "SETTLE" | "ROGUE", env: NodeJS.ProcessEnv = process.env): Hex {
  return pk.parse(env[`${role}_PRIVATE_KEY`]);
}
