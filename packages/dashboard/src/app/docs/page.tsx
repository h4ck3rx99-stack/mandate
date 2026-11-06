import { Box, Type } from "@/components/Build";
import { who } from "@/lib/cast";
import { agentNames, cfg, repoUrl, rootName, usdcAddress } from "@/lib/server";

export const metadata = { title: "Docs — Mandate" };

const TOC = [
  ["overview", "Overview"],
  ["quickstart", "Quickstart"],
  ["chain", "Delegation chain"],
  ["checks", "What the service checks"],
  ["api", "API"],
  ["cli", "CLI"],
  ["sponsors", "ENS · Arkiv · World"],
  ["addresses", "Deployments"],
  ["repo", "Repo docs"],
] as const;

const CHECKS = [
  ["schema", "Strict body schema: unknown fields, bad amounts or chains deeper than 8 are rejected."],
  ["root", "The first issuer equals the pinned root."],
  ["signatures", "Every delegation id and signature is recomputed (EIP-712)."],
  ["continuity", "Each link's parent is the previous id and its issuer is the previous subject; no cycles."],
  ["narrowing", "Each child scope is inside its parent: actions, maxAmount, expiry, targets."],
  ["freshness", "Request deadline is in the future and at most 300 s away."],
  ["audience_signer", "Request is addressed to this service and signed by the leaf subject."],
  ["leaf_scope", "Action, amount and target fit the leaf scope."],
  ["world_approval", "Above the threshold: an unused World approval bound to this exact request hash."],
  ["nonce", "Nonce (and approval) consumed atomically in one SQLite transaction."],
  ["revocation", "No link is revoked onchain. If the registry cannot be read, deny."],
  ["transfer", "Sign, persist the tx hash, then broadcast. Reconcile by rebroadcasting the same raw tx, never re-signing."],
];

const H = ({ id, children }: { id: string; children: string }) => (
  <h2 id={id} className="scroll-mt-20 border-t border-line pt-10 font-display text-3xl font-extrabold tracking-tight">
    <Type text={children} by={who(id.length)} />
  </h2>
);
const Code = ({ children }: { children: string }) => (
  <Box by={who(children.length)} className="mt-4" dur={500}>
    <pre className="overflow-x-auto border border-line bg-panel p-4 font-mono text-xs leading-relaxed">{children}</pre>
  </Box>
);

export default function Docs() {
  const repo = repoUrl();
  const c = cfg();
  const names = [`treasury.${rootName()}`, ...agentNames()];
  const gh = (path: string) => `${repo}/blob/main/${path}`;
  const addr = (a: string) => (
    <a className="font-mono text-xs text-lime hover:underline" href={`https://sepolia.etherscan.io/address/${a}`} target="_blank" rel="noreferrer">{a}</a>
  );

  return (
    <div className="mx-auto grid max-w-[1500px] gap-12 px-6 py-12 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="font-mono text-xs uppercase tracking-widest text-mute">Docs</p>
        <ul className="mt-4 space-y-2 text-sm">
          {TOC.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="text-mute hover:text-ink">{label}</a></li>
          ))}
        </ul>
        <a href={repo} target="_blank" rel="noreferrer" className="mt-6 inline-block border border-line px-3 py-1 text-sm hover:border-lime">GitHub ↗</a>
      </aside>

      <article className="max-w-3xl space-y-6 pb-24 leading-relaxed text-ink/90">
        <div>
          <h1 id="overview" className="font-display text-5xl font-extrabold tracking-tight"><Type text="Mandate docs" by={who(11)} tone="lime" /></h1>
          <p className="mt-4 text-lg text-mute">
            Agents can subcontract work. Authority must not expand. Mandate is a chain of signed, narrowing permits from a human-owned treasury down to the agent that pays, and a payment service that re-checks the whole chain before moving a single cent.
          </p>
        </div>

        <H id="quickstart">Quickstart</H>
        <p>Node 24, pnpm, and Foundry (for the contract only). Testnets only.</p>
        <Code>{`git clone ${repo}
cd mandate && pnpm install
cp .env.example .env        # fill RPC, Arkiv key, Groq key
pnpm keygen                  # creates role keys, writes *_ADDRESS
pnpm test                    # core, service, contract tests
pnpm service                 # payment service on :8787
pnpm -C packages/agents runner      # scenario runner on :8788
pnpm -C packages/dashboard dev      # this site on :3000`}</Code>

        <H id="chain">Delegation chain</H>
        <p>Each link is an EIP-712 <code className="font-mono text-lime">Delegation</code> signed by its issuer. Its id is the typed-data digest; the child points at it with <code className="font-mono">parent</code>.</p>
        <Code>{names.slice(0, 3).map((n, i) => `${n}  ──${["500", "300", "150"][i]} USDC──▶  ${names[i + 1]}`).join("\n")}</Code>
        <Code>{`Scope      { actions: string[], maxAmount: uint256, expiry: uint64, targets: string[] }
Delegation { v, parent, issuer, subject, issuerName, subjectName, scope, nonce }
Request    { leafId, audience, action, amount, target, nonce, deadline }
domain     { name: "Mandate", version: "1", chainId, verifyingContract: RevocationRegistry }`}</Code>
        <p className="text-mute">Amounts are USDC minor units (6 decimals). <code className="font-mono">targets: ["*"]</code> means any target; a child can never add one its parent lacks.</p>

        <H id="checks">What the service checks</H>
        <p>In this order. The first failure denies the request, and a denial has no side effect.</p>
        <ol className="mt-4 divide-y divide-line border border-line">
          {CHECKS.map(([n, d], i) => (
            <li key={n} className="grid grid-cols-[2.5rem_10rem_1fr] gap-3 px-4 py-3 text-sm">
              <span className="font-mono text-mute">{i + 1}</span>
              <code className="font-mono text-lime">{n}</code>
              <span className="text-mute">{d}</span>
            </li>
          ))}
        </ol>

        <H id="api">API</H>
        <Code>{`POST /execute          { chain: Delegation[], request: Request }
  200 EXECUTED          { decision, checks[], txHash, balanceBefore, balanceAfter }
  202 PENDING           needs World approval; nonce NOT consumed
  403 DENIED            { decision, checks[], violations[] }
GET  /requests          last 100 decisions
GET  /events            SSE: request · world · receipt
GET  /world/approve?requestHash=0x…   start a World ID step-up for one request`}</Code>

        <H id="cli">CLI</H>
        <Code>{`pnpm -C packages/cli mandate verify ${names[3]}
pnpm -C packages/cli mandate receipts ${names[3]}`}</Code>
        <p className="text-mute">verify walks ENS → Arkiv → local re-verification → onchain revocation and prints USABLE, REVOKED, EXPIRED or DENIED.</p>

        <H id="sponsors">ENS · Arkiv · World</H>
        <p><b>ENS (v2, Sepolia).</b> {rootName()} has a subregistry per level and a PermissionedResolver per name. Each agent can write only its own <code className="font-mono">mandate:status</code>; each issuer can write the delegation pointer on the names it hired.</p>
        <p><b>Arkiv.</b> Delegations (<code className="font-mono">mandate.delegation.v1</code>) are owned by their signer and expire with the permit. Every final decision is a <code className="font-mono">mandate.receipt.v1</code> entity written by the service.</p>
        <p><b>World ID Agent Pass.</b> The root is linked to one human (one human, one root). Payments above the threshold need a fresh login (max_age=0) that approves one request hash.</p>

        <H id="addresses">Deployments (Sepolia)</H>
        <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
          <dt className="text-mute">RevocationRegistry</dt><dd>{addr(c.registry)}</dd>
          <dt className="text-mute">USDC</dt><dd>{addr(usdcAddress())}</dd>
          <dt className="text-mute">Pinned root</dt><dd>{addr(c.pinnedRoot)}</dd>
          <dt className="text-mute">ENS root</dt><dd className="font-mono text-xs">{rootName()}</dd>
          <dt className="text-mute">Chain id</dt><dd className="font-mono text-xs">{c.chainId}</dd>
        </dl>

        <H id="repo">Repo docs</H>
        <ul className="list-inside list-disc text-mute">
          <li><a className="text-lime hover:underline" href={gh("docs/evidence.md")}>evidence.md</a>: live scenario runs with tx hashes</li>
          <li><a className="text-lime hover:underline" href={gh("docs/ens.md")}>ens.md</a>: ENS deployments and the permission demo</li>
          <li><a className="text-lime hover:underline" href={gh("docs/versions.md")}>versions.md</a>: every package, address and API we rely on</li>
          <li><a className="text-lime hover:underline" href={gh("packages/contracts/src/RevocationRegistry.sol")}>RevocationRegistry.sol</a></li>
          <li><a className="text-lime hover:underline" href={gh("AI/AI_USAGE.md")}>AI_USAGE.md</a>: what was AI-generated</li>
        </ul>
      </article>
    </div>
  );
}
