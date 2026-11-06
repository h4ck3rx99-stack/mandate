import Link from "next/link";
import { BuildScroll } from "@/components/BuildScroll";
import { agentNames, cfg, repoUrl, rootName } from "@/lib/server";

const RULES = [
  ["Pinned root", "The chain must start at the one owner key the service was configured with."],
  ["No widening", "Every hop's actions, amount, expiry and targets must be inside its parent's."],
  ["Leaf signs", "Only the last agent in the chain can sign the payment request."],
  ["Not revoked", "Any link revoked onchain kills everything below it. If the registry can't be read, deny."],
  ["Fresh, single use", "Requests expire in 5 minutes and each nonce is consumed atomically. Replays fail."],
  ["Human above threshold", "Payments over the threshold wait for the owner's World ID approval of that exact request."],
];

const STACK = [
  ["ENS", "Names", "Every agent has a name under the treasury (settle.procure.ops.treasury…). Per-key resolver permissions: an agent can only write its own status; issuers write the delegation pointer of the agents they hired."],
  ["Arkiv", "Memory", "Every signed delegation and every service decision is an Arkiv entity owned by its signer. Anyone can query a chain by root, rebuild it, and re-verify it without trusting us."],
  ["World", "Humans", "The treasury root is linked to one World ID human. Payments above the threshold need a fresh World login that approves one request hash and nothing else."],
];

export default function Home() {
  const names = [`treasury.${rootName()}`, ...agentNames()];
  const repo = repoUrl();
  return (
    <>
      <BuildScroll names={names} />

      <section className="mx-auto max-w-[1500px] px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-lime">The payment service</p>
        <h2 className="mt-3 max-w-4xl font-display text-5xl font-extrabold tracking-tight">Six rules. Every one fails closed.</h2>
        <ol className="mt-12 grid gap-px border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([t, b], i) => (
            <li key={t} className="bg-bg p-6">
              <span className="font-mono text-xs text-mute">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-display text-2xl font-bold">{t}</h3>
              <p className="mt-2 text-mute">{b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-3xl text-mute">
          A denied request has no side effect: no nonce burned, no funds moved, no transaction signed. The model reading the invoice can be fooled; the service doesn't care what the model believes.
        </p>
      </section>

      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-[1500px] px-6 py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-lime">Built on</p>
          <div className="mt-10 grid gap-12 lg:grid-cols-3">
            {STACK.map(([name, role, body]) => (
              <div key={name}>
                <div className="flex items-baseline gap-3">
                  <h3 className="font-display text-4xl font-extrabold">{name}</h3>
                  <span className="font-mono text-xs text-mute">{role}</span>
                </div>
                <p className="mt-4 text-mute">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-12 px-6 py-24 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-5xl font-extrabold tracking-tight">Check any agent yourself.</h2>
          <p className="mt-4 max-w-xl text-mute">
            The CLI resolves the name on ENS, walks the signed chain on Arkiv, re-verifies every signature and limit locally, and reads revocations from Sepolia.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/stage" className="bg-lime px-5 py-3 font-semibold text-bg">Run the live demo →</Link>
            <Link href="/docs" className="border border-line px-5 py-3 font-semibold hover:border-lime">Docs</Link>
            <a href={repo} target="_blank" rel="noreferrer" className="border border-line px-5 py-3 font-semibold hover:border-lime">GitHub ↗</a>
          </div>
        </div>
        <div>
          <pre className="overflow-x-auto border border-line bg-panel p-6 font-mono text-xs leading-relaxed">
            <span className="text-mute">$ </span>pnpm -C packages/cli mandate verify {names[3]}{"\n"}
            <span className="text-lime">USABLE</span>  {names[3]}{"\n"}
            {"  Signatures, continuity, narrowing, expiry and revocation all check out.\n"}
            {names.slice(0, 3).map((n, i) => `  ${i}. ${n} -> ${names[i + 1]}  max ${["500.00", "300.00", "150.00"][i]} USDC  pay/supplier-A\n`).join("")}
          </pre>
          <p className="mt-2 font-mono text-[11px] text-mute">Real output, recorded 7 Nov 2026 (Arkiv entity links trimmed).</p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-6 px-6 py-8 font-mono text-xs text-mute">
          <span>MANDATE · ETHGlobal Mumbai 2026</span>
          <a className="hover:text-ink" href={`https://sepolia.etherscan.io/address/${cfg().registry}`} target="_blank" rel="noreferrer">RevocationRegistry ↗</a>
          <a className="hover:text-ink" href={repo} target="_blank" rel="noreferrer">Source ↗</a>
          <span className="ml-auto">Testnets only. The animation above is an illustration; the demo stage is live.</span>
        </div>
      </footer>
    </>
  );
}
