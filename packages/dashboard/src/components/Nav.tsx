import Link from "next/link";
import { repoUrl } from "@/lib/server";

const LINKS = [["/stage", "Demo"], ["/explorer", "Registry"], ["/docs", "Docs"]] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95">
      <nav className="mx-auto flex max-w-[1500px] items-center gap-8 px-6 py-3" aria-label="Main">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          MANDATE<span className="text-lime">.</span>
        </Link>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="text-sm text-mute hover:text-ink">{label}</Link>
        ))}
        <span className="ml-auto hidden font-mono text-xs text-mute lg:inline">Sepolia · Arkiv · World sandbox · testnets only</span>
        <a href={repoUrl()} target="_blank" rel="noreferrer" className="border border-line px-3 py-1 text-sm hover:border-lime">GitHub ↗</a>
      </nav>
    </header>
  );
}
