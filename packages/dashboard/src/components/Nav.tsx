import Link from "next/link";
import { repoUrl } from "@/lib/server";

const LINKS = [["/stage", "Demo"], ["/explorer", "Registry"], ["/docs", "Docs"]] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-bg/90 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-[1500px] items-center gap-8 px-6 py-3" aria-label="Main">
        <Link href="/" className="font-display text-lg font-medium tracking-tight">
          MANDATE<span className="text-pink">.</span>
        </Link>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="text-xs uppercase tracking-[0.12em] text-mute hover:text-white">{label}</Link>
        ))}
        <span className="ml-auto hidden font-mono text-xs text-mute lg:inline">Sepolia · Arkiv · World sandbox · testnets only</span>
        <a href={repoUrl()} target="_blank" rel="noreferrer" className="btn-aurora px-4 py-1.5 !text-xs">GitHub ↗</a>
      </nav>
    </header>
  );
}
