import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95">
      <nav className="mx-auto flex max-w-[1500px] items-center gap-8 px-6 py-3" aria-label="Main">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          MANDATE<span className="text-lime">.</span>
        </Link>
        <Link href="/" className="text-sm text-mute hover:text-ink">Stage</Link>
        <Link href="/explorer" className="text-sm text-mute hover:text-ink">Registry</Link>
        <span className="ml-auto font-mono text-xs text-mute">Sepolia · Arkiv Rabdi · World sandbox · testnets only</span>
      </nav>
    </header>
  );
}
