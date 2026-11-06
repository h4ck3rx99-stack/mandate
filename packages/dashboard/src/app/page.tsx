import Link from "next/link";
import { BuildScroll } from "@/components/BuildScroll";
import { Box, Type } from "@/components/Build";
import { who } from "@/lib/cast";
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
        <p className="font-mono text-xs uppercase tracking-widest text-lime"><Type text="The payment service" by={who(6)} /></p>
        <h2 className="mt-3 max-w-4xl font-display text-5xl font-medium tracking-tight"><Type text="Six rules. Every one fails closed." by={who(11)} tone="lime" delay={250} /></h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([t, b], i) => (
            <Box as="li" key={t} by={who(i)} delay={150 * i} className="h-full">
              <div className="h-full rounded-2xl bg-panel p-9">
                <span className="font-mono text-xs text-mute">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-display text-2xl font-medium">{t}</h3>
                <p className="mt-2 text-mute">{b}</p>
              </div>
            </Box>
          ))}
        </ol>
        <p className="mt-6 max-w-3xl text-mute">
          <Type by={who(7)} cps={140} text="A denied request has no side effect: no nonce burned, no funds moved, no transaction signed. The model reading the invoice can be fooled; the service doesn't care what the model believes." />
        </p>
      </section>

      <section className="mx-auto max-w-[1500px] px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-lime"><Type text="Built on" by={who(4)} /></p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {STACK.map(([name, role, body], i) => (
            <Box key={name} by={[who(3), who(4), who(5)][i]!} delay={200 * i} className="h-full">
              <div className="h-full rounded-2xl bg-panel p-9">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-display text-4xl font-medium">{name}</h3>
                  <span className="font-mono text-xs text-mute">{role}</span>
                </div>
                <p className="mt-4 text-mute">{body}</p>
              </div>
            </Box>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-12 px-6 py-24 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-5xl font-medium tracking-tight"><Type text="Check any agent yourself." by={who(8)} /></h2>
          <p className="mt-4 max-w-xl text-mute">
            <Type by={who(3)} cps={140} delay={300} text="The CLI resolves the name on ENS, walks the signed chain on Arkiv, re-verifies every signature and limit locally, and reads revocations from Sepolia." />
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Box by={who(11)} delay={500} dur={400}><Link href="/stage" className="block btn-aurora px-6 py-4">Run the live demo →</Link></Box>
            <Box by={who(5)} delay={650} dur={400}><Link href="/docs" className="block btn-ghost px-6 py-4">Docs</Link></Box>
            <Box by={who(9)} delay={800} dur={400}><a href={repo} target="_blank" rel="noreferrer" className="block btn-ghost px-6 py-4">GitHub ↗</a></Box>
          </div>
        </div>
        <Box by={who(8)} delay={200} dur={800}>
          <pre className="overflow-x-auto rounded-2xl bg-deep p-8 font-mono text-xs leading-relaxed">
            <span className="text-mute">$ </span>pnpm -C packages/cli mandate verify {names[3]}{"\n"}
            <span className="text-lime">USABLE</span>  {names[3]}{"\n"}
            {"  Signatures, continuity, narrowing, expiry and revocation all check out.\n"}
            {names.slice(0, 3).map((n, i) => `  ${i}. ${n} -> ${names[i + 1]}  max ${["500.00", "300.00", "150.00"][i]} USDC  pay/supplier-A\n`).join("")}
          </pre>
          <p className="mt-2 font-mono text-[11px] text-mute">Real output, recorded 7 Nov 2026 (Arkiv entity links trimmed).</p>
        </Box>
      </section>

      <Box as="footer" by={who(10)} dur={900} className="bg-deep">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-6 px-6 py-16 font-mono text-xs text-mute">
          <span>MANDATE · ETHGlobal Mumbai 2026</span>
          <a className="hover:text-ink" href={`https://sepolia.etherscan.io/address/${cfg().registry}`} target="_blank" rel="noreferrer">RevocationRegistry ↗</a>
          <a className="hover:text-ink" href={repo} target="_blank" rel="noreferrer">Source ↗</a>
          <span className="ml-auto">Testnets only. The build animations are illustrations; the demo stage is live.</span>
        </div>
      </Box>
    </>
  );
}
