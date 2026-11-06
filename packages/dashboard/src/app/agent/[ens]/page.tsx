import { inspect, receipts } from "@/lib/server";

export const dynamic = "force-dynamic";
const usdc = (m: unknown) => (Number(m) / 1e6).toFixed(2);
const tone: Record<string, string> = { USABLE: "text-lime", REVOKED: "text-red", EXPIRED: "text-amber", DENIED: "text-red" };

export default async function Agent({ params }: { params: Promise<{ ens: string }> }) {
  const name = decodeURIComponent((await params).ens).toLowerCase();
  const [r, rs] = await Promise.all([inspect(name), receipts({ leafName: name })]);
  const leaf = r.links.at(-1)?.delegation;
  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
      <p className="font-mono text-xs text-mute">agent profile</p>
      <h1 className="break-all font-display text-3xl font-medium tracking-tight">{name}</h1>
      <p className={`mt-2 font-display text-2xl font-medium ${tone[r.status]}`}>{r.status}</p>
      <p className="text-sm text-mute">{r.reasons.join(" ")}</p>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-line bg-panel p-4">
          <h2 className="mb-3 font-display text-lg font-semibold">ENS records (discovery only)</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt className="text-mute">address</dt><dd className="break-all">{r.ens.address ?? "—"}</dd>
            <dt className="text-mute">mandate:status</dt><dd className="break-all">{r.ens.status ?? "—"}</dd>
            <dt className="text-mute">mandate:delegation-id</dt><dd className="break-all">{r.ens.delegationId ?? "—"}</dd>
            <dt className="text-mute">mandate:delegation-uri</dt>
            <dd className="break-all">{r.ens.delegationUri ? <a className="underline" href={r.ens.delegationUri} target="_blank" rel="noreferrer">{r.ens.delegationUri}</a> : "—"}</dd>
          </dl>
          {r.ens.address && <a className="mt-3 inline-block font-mono text-xs underline" href={`https://sepolia.etherscan.io/address/${r.ens.address}`} target="_blank" rel="noreferrer">agent wallet on Etherscan ↗</a>}
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <h2 className="mb-3 font-display text-lg font-semibold">Current mandate</h2>
          {leaf ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
              <dt className="text-mute">issued by</dt><dd>{leaf.issuerName}</dd>
              <dt className="text-mute">maxAmount</dt><dd>{usdc(leaf.scope.maxAmount)} USDC / request</dd>
              <dt className="text-mute">actions</dt><dd>{leaf.scope.actions.join(", ")}</dd>
              <dt className="text-mute">targets</dt><dd>{leaf.scope.targets.join(", ")}</dd>
              <dt className="text-mute">expiry</dt><dd>{new Date(Number(leaf.scope.expiry) * 1000).toISOString()}</dd>
              <dt className="text-mute">id</dt><dd className="break-all">{leaf.id}</dd>
            </dl>
          ) : <p className="text-sm text-mute">No verifiable delegation found.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Chain of authority (from Arkiv)</h2>
        <ol className="flex flex-col gap-2">
          {r.links.map((l, i) => (
            <li key={i} className="rounded-md border border-line bg-panel p-3 font-mono text-xs">
              {l.delegation.issuerName} → {l.delegation.subjectName} · {usdc(l.delegation.scope.maxAmount)} USDC{" "}
              {l.revoked && <span className="text-red">REVOKED</span>}
              <a className="ml-3 underline" href={`https://rabdi.explorer.arkiv.network/entity/${l.entityKey}`} target="_blank" rel="noreferrer">Arkiv entity ↗</a>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Request history (decision receipts on Arkiv)</h2>
        {rs.length === 0 && <p className="text-sm text-mute">No receipts for this agent yet.</p>}
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {rs.map((x) => (
            <li key={x.entityKey} className="flex flex-wrap gap-3 border-t border-line py-1.5">
              <span className="text-mute">{new Date(x.at * 1000).toLocaleString()}</span>
              <span className={x.decision === "EXECUTED" ? "text-lime" : "text-red"}>{x.decision}</span>
              <span>{usdc(x.amount)} USDC</span>
              {x.failedCheck && <span className="text-red">failed: {x.failedCheck}</span>}
              {x.txHash && <a className="underline" href={`https://sepolia.etherscan.io/tx/${x.txHash}`} target="_blank" rel="noreferrer">tx ↗</a>}
              <a className="underline" href={`https://rabdi.explorer.arkiv.network/entity/${x.entityKey}`} target="_blank" rel="noreferrer">Arkiv ↗</a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
