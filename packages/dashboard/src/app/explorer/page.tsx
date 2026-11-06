import { agentNames, inspect, receipts } from "@/lib/server";
import { RegistryTable } from "./RegistryTable";

export const dynamic = "force-dynamic";

export default async function Explorer({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const names = name ? [name.trim().toLowerCase()] : agentNames();
  const [rows, rs] = await Promise.all([Promise.all(names.map(inspect)), receipts()]);
  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Registry</h1>
      <p className="mt-2 max-w-3xl text-mute">
        Each name goes ENS (discovery) → Arkiv (signed delegations) → local re-verification → onchain revocation. Missing, stale or unverifiable data is <span className="text-red">DENIED</span>.
      </p>
      <form className="mt-6 flex gap-2" action="/explorer">
        <label htmlFor="name" className="sr-only">ENS name</label>
        <input id="name" name="name" defaultValue={name ?? ""} placeholder="settle.procure.ops.treasury.mandate.eth"
          className="w-full max-w-xl rounded-sm border border-line bg-panel px-3 py-2 font-mono text-sm outline-none focus:border-lime" />
        <button className="rounded-sm bg-lime px-4 py-2 text-sm font-semibold text-bg">Verify</button>
      </form>
      <RegistryTable rows={rows} receipts={rs} />
    </main>
  );
}
