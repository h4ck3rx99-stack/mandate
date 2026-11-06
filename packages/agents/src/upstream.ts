import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delegationToWire, type Delegation } from "@mandate/core";
import { names } from "./env";
import { issueRoot } from "./owner";
import { delegateToProcure } from "./ops";
import { publishLink, type PublishedLink } from "./publish";

const USDC = 1_000_000n;
const STATE = "data/chain.json";

export interface Upstream {
  chain: [Delegation, Delegation]; // owner->ops, ops->procure
  published: PublishedLink[];
  revoked: boolean;
}

const revive = (d: any): Delegation => ({ ...d, scope: { ...d.scope, maxAmount: BigInt(d.scope.maxAmount), expiry: BigInt(d.scope.expiry) } });

export function readUpstream(): Upstream | undefined {
  if (!existsSync(STATE)) return undefined;
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  return { chain: s.chain.map(revive), published: s.published ?? [], revoked: !!s.revoked };
}

export function markRevoked() {
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  writeFileSync(STATE, JSON.stringify({ ...s, revoked: true }, null, 2));
}

/** Reuse the current owner->ops->procure mandates, or issue + publish fresh ones (demo numbers: 500 / 300). */
export async function ensureUpstream(opts: { reseed?: boolean; publish?: boolean; log?: (s: string) => void } = {}): Promise<Upstream> {
  const cur = readUpstream();
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (!opts.reseed && cur && !cur.revoked && cur.chain[0].issuerName === names().treasury && cur.chain[0].scope.expiry > now + 600n) return cur;
  const expiry = now + 24n * 3600n;
  const root = await issueRoot({ actions: ["pay"], maxAmount: 500n * USDC, expiry, targets: ["supplier-A"] });
  const opsLink = await delegateToProcure(root, { actions: ["pay"], maxAmount: 300n * USDC, expiry, targets: ["supplier-A"] });
  const published: PublishedLink[] = [];
  if (opts.publish !== false) {
    opts.log?.("publishing root mandate to Arkiv + ENS…");
    published.push(await publishLink("OWNER", root, root.id, 0));
    opts.log?.("publishing ops→procure mandate to Arkiv + ENS…");
    published.push(await publishLink("OPS", opsLink, root.id, 1));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(STATE, JSON.stringify({ chain: [root, opsLink].map(delegationToWire), published, revoked: false }, null, 2));
  return { chain: [root, opsLink], published, revoked: false };
}
