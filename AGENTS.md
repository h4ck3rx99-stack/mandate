# MANDATE — agent rules

Project: MANDATE ("Agents can subcontract work. Authority must not expand.") for ETHGlobal Mumbai 2026.
Deadline Sat 7 Nov 2026 09:00 IST; target submit 07:30 IST. Full spec: `AI/prompts/00-build-prompt.md`.

## Rules
- **Commits:** commit + push every 2-3 small steps or every 10-20 min, only when build/tests pass. Before any new step run `git log -1 --format=%cr`; if >15 min, commit + push first. Clear messages (`core: reject child expiry beyond parent`). After each commit print `✓ committed: <msg> (<HH:MM>)`. Never squash, force-push or rewrite pushed history.
- **AI disclosure:** after every commit append one line to `AI/AI_USAGE.md`. Ask the human to make/approve real decisions (numbers, names, copy, design) in batches; record them in `AI/DECISIONS.md`.
- **Official docs only:** before each sponsor integration read its official docs; record package names, versions, addresses, APIs with URLs in `docs/versions.md`. Never guess SDK methods; when unsure write a tiny probe script, run it, report.
- **Testnets only:** Ethereum Sepolia, Arkiv testnet, World staging/simulator.
- **No hardcoded values:** addresses, chain IDs, names, keys come from env/config. `.env.example` lists every variable; `.env` is never committed.
- **Security:** deny by default; never weaken a check to make a demo pass; every rule has a test; failed authorization has NO side effect (tests assert balances unchanged).
- **Honesty:** never present mock data as live; never fabricate model output, tx hashes, test counts or traction; label fixtures.
- **Scope:** build only what's in the spec; propose additions and wait for a yes.
- **Blocked >30 min:** stop, show the exact error, propose the smallest fallback and the question to ask that sponsor's booth.
- **UI work:** use the `hackathon-prereqs` skill (`docs/hackathon-prereqs.md`).

## graphify
If `graphify-out/graph.json` exists, run `graphify query "<question>"` before grepping/reading source for a codebase question; after modifying code run `graphify update .`.
