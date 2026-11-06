=====================================================================
MANDATE: SETUP + FULL BUILD (ETHGlobal Mumbai 2026, from scratch)
=====================================================================
You are the lead engineer building MANDATE from scratch in this EMPTY folder
on my Windows 11 machine (Node 22, pnpm, git). I'm awake all night and will
work with you. Deadline: Sat 7 Nov 2026 09:00 IST; TARGET SUBMIT 07:30 IST.
Check the current time now and at every checkpoint.

=====================================================================
PHASE 0: SETUP THIS FOLDER (do this first, then commit + push)
=====================================================================
1. `git init -b main`. Check if `gh` is installed and logged in
   (`gh auth status`). If yes, ask me for a repo name, then
   `gh repo create <name> --public --source . --remote origin`. If not, ask
   me to create an EMPTY GitHub repo and give you the URL, then
   `git remote add origin <url>`.
2. Create .gitignore: node_modules/, .next/, dist/, build/, out/, cache/,
   .env, .env.*, !.env.example, *.db, *.db-*, graphify-out/, coverage/.
3. Create AGENTS.md with the rules in section "0. RULES" below (short
   form), and CLAUDE.md containing just: @AGENTS.md
4. Create docs/hackathon-prereqs.md AND
   .claude/skills/hackathon-prereqs/SKILL.md (frontmatter name:
   hackathon-prereqs, description: "Use for any Mandate UI work; lists
   the 43 prepared hackathon building blocks and which to build") with
   the full 43-item table from section 7 of this prompt, including each
   item's note.
5. Create AI/AI_USAGE.md (header: "time | files | AI-generated | human
   review needed"), AI/DECISIONS.md, and save THIS ENTIRE PROMPT verbatim
   as AI/prompts/00-build-prompt.md.
6. `git add -A && git commit -m "init: agent rules, prereqs skill, AI log"
   && git push -u origin main`. Print "✓ committed". Then start Phase A.

=====================================================================
0. RULES (also copy into AGENTS.md)
=====================================================================
- COMMITS: commit + push after every 2-3 small steps OR every 10-20
  minutes, whichever comes first, only when build/tests pass. Before
  starting ANY new step run `git log -1 --format=%cr`; if over 15 minutes,
  commit + push first. Clear messages ("core: reject child expiry beyond
  parent"). After each commit print "✓ committed: <msg> (<HH:MM>)". Never
  squash, never force-push, never rewrite pushed history.
- AI DISCLOSURE: after every commit append one line to AI/AI_USAGE.md.
  ETHGlobal can rule out fully AI-built projects, so ask me to make or
  approve real decisions (numbers, names, copy, design picks) in batches,
  and record them in AI/DECISIONS.md.
- OFFICIAL DOCS ONLY: before each sponsor integration, open its official
  docs (section 6), confirm package names, versions, addresses and APIs,
  record them with URLs in docs/versions.md. Never guess SDK methods; when
  unsure, write a tiny probe script, run it, report.
- TESTNETS ONLY: Ethereum Sepolia, Arkiv testnet, World staging/simulator.
- NO HARDCODED VALUES: addresses, chain IDs, names, keys from env/config.
  .env.example lists every variable; .env is never committed.
- SECURITY: deny by default; never weaken a check to make a demo pass;
  every rule has a test; failed authorization has NO side effect (tests
  assert balances unchanged).
- HONESTY: never present mock data as live; never fabricate model output,
  tx hashes, test counts or traction; label fixtures.
- SCOPE: build only what's here; propose additions and wait for my yes.
- BLOCKED >30 min: stop, show the exact error, propose the smallest
  fallback and the question to ask that sponsor's booth.

=====================================================================
1. PRODUCT
=====================================================================
MANDATE. Tagline: "Agents can subcontract work. Authority must not expand."
A treasury owner authorizes an operations agent -> it delegates to a
procurement agent (LLM reading invoices) -> it delegates to a settlement
agent -> which calls a payment service. The service can't currently verify
provenance, amplification, revocation or possession. Prompt injection makes
it real: a malicious invoice can push the procurement agent to grant more
power than it has.

Chain: Owner (World-verified human, root issuer) -> ops.treasury.<root>.eth
-> procure.ops.treasury.<root>.eth (LLM) -> settle.procure.ops.treasury.
<root>.eth -> Payment service POST /execute (enforcement boundary).

The service executes ONLY if: (1) chain traces to the root issuer pinned
in the SERVICE config; (2) no hop expands its parent's scope in any
dimension; (3) request signed by the leaf delegation's key; (4) nothing in
the chain revoked (Ethereum RevocationRegistry); (5) request fresh and
single-use; (6) above the threshold, a fresh World approval bound to THIS
exact request. Any check unable to complete -> deny ("fails closed").

Demo numbers (ask me to confirm, then use everywhere): ops maxAmount 500
USDC/request, procure 300, settle 150, actions [pay], targets [supplier-A].
Honest invoice 100 -> EXECUTED (real Sepolia transfer). Injected invoice:
settle request 450 -> DENIED. Injected delegation: procure grants settle
1000 -> DENIED at that edge. Revoke ops -> retry 100 -> DENIED. Replay ->
DENIED. World threshold 15 USDC.
Pitch opener: "This agent signed a request for 450. It was only authorized
for 150. The payment service refused."

=====================================================================
2. PERMISSION MODEL + FORMATS
=====================================================================
Scope has exactly 4 caveats: actions string[] (sorted, deduped);
maxAmount bigint in USDC minor units (6 decimals), PER-REQUEST ceiling;
expiry unix seconds; targets ["*"] OR concrete IDs, never both.
narrows(parent, child) returns EVERY violation {dimension, reason,
parentValue, childValue} (+ edgeIndex at chain level). Equality allowed.
fast-check property tests: reflexive, transitive, any widened dimension
reported.
Delegation (EIP-712 via viem hashTypedData): v, id (= digest), parent (zero
hash for root), issuer, subject, issuerName, subjectName (ENS), scope,
nonce, sig.
ExecutionRequest: leafId, audience, action, amount, target, nonce (single
use), deadline, worldApprovalRef?, sig (by leaf subject).
Domain {name:"Mandate", version:"1", chainId, verifyingContract =
RevocationRegistry} from the SERVICE config only.

=====================================================================
3. VERIFICATION PIPELINE (POST /execute), IN ORDER
=====================================================================
1 zod strict schema + bounds (unknown fields, non-positive/non-integer
amounts, depth > 8, empty chain -> deny). 2 first link is root; root issuer
== pinned. 3 recompute ids; verify all signatures. 4 continuity
(child.parent == parent.id, child.issuer == parent.subject), no repeats or
cycles. 5 narrows() on every edge, all violations with edge index.
6 unexpired chain; request deadline in future. 7 audience == this service;
request signed by leaf subject. 8 action/amount/target within leaf scope.
9 above threshold: World approval valid, fresh, bound to THIS request hash
(never widens scope). 10 nonce checked + consumed atomically (SQLite
transaction + UNIQUE, durable file). 11 RevocationRegistry.anyRevoked(...);
read failure = deny. 12 transfer with the SERVICE key only; persist tx hash
before broadcast; on timeout reconcile, never re-send.
Response: {decision EXECUTED|DENIED|PENDING, checks[{name, ok,
plainEnglish, detail}], violations[], txHash?, balanceBefore, balanceAfter}.

=====================================================================
4. REPO LAYOUT (pnpm workspace, TypeScript)
=====================================================================
packages/core (types, zod, narrows, hashing, signing, verifyChain, config;
vitest + fast-check) | packages/contracts (RevocationRegistry; Foundry if
`forge` installs cleanly, try WSL, else Hardhat/viem+solc; ask before
switching) | packages/payment-service (Express: POST /execute, GET
/requests, GET /events SSE, /world/* routes, SQLite) | packages/agents (ops,
procure LLM, settle, rogue; each holds only its own key) | packages/sdk
(requireMandate() Express middleware, a 5-line integration) | packages/cli
(`mandate verify <ens-name>`: ENS -> Arkiv -> local verify -> revocation
-> USABLE/DENIED + why) | packages/dashboard (Next.js App Router +
Tailwind) | scripts/ (seed, reset, scenarios, e2e) | fixtures/ (honest +
injected invoices) | arkiv/ | docs/ | AI/

=====================================================================
5. CONTRACT: RevocationRegistry
=====================================================================
revoked[issuer][id]; revoke(bytes32) in msg.sender's namespace only, emits
Revoked; anyRevoked(address[], bytes32[]) view; statusOf(address[],
bytes32[]) view. Revoking an ancestor kills all descendants, no
enumeration. Tests: own namespace only, stranger can't affect victim,
double revoke, events, length mismatch reverts. Deploy to Sepolia; record
address + Etherscan link.

=====================================================================
6. SPONSORS (select exactly these 3 at submission)
=====================================================================
Re-read first: https://ethglobal.com/events/mumbai/prizes and
https://ethglobal.com/events/mumbai/info/details
A) ENS "Best Use of ENSv2" ($7k). Docs:
 https://docs.ens.domains/ensv2/tutorial-app-developers/ ,
 https://docs.ens.domains/ensv2/permissioned-resolver/ ,
 https://docs.ens.domains/learn/deployments ; app
 https://sepolia.app.ens.domains (I register the root name; fees in mock
 USDC, approve first). viem + @ensdomains/ensjs v2 wallet module (check
 version). Build: hierarchical names via ENSv2 subregistries; text records
 mandate:delegation-id, mandate:delegation-uri, mandate:parent-id,
 mandate:subject, mandate:registry, mandate:status; PermissionedResolver +
 Enhanced Access Control so each agent key may write ONLY mandate:status
 (demo one allowed + one reverted write with tx links). ENS = discovery,
 never proof. Plain resolution alone doesn't qualify.
B) ARKIV "Build on Arkiv (from scratch)" ($4k). Docs
 https://docs.arkiv.network/ , keys/faucet hub.arkiv.network, prize page
 https://ethglobal.com/events/mumbai/prizes/arkiv . @arkiv-network/sdk
 (check version and testnet chain helper). Each delegation = entity owned
 by the ISSUER wallet, indexed attributes id, parentId, rootId, issuer,
 subject, actions, maxAmount, expiry, targets, depth; signed payload;
 native expiration = delegation expiry. Dashboard explorer + CLI READ from
 Arkiv then re-verify locally + check revocation; missing/stale = DENIED.
 Required: /arkiv/schema.md, friction.md, reach.md, why-arkiv.md,
 how-you-use-arkiv.md, writer addresses + runnable query in README. No
 private data in public records.
C) WORLD: pick ONE path in the first hour (whichever works on staging).
 Prize page https://ethglobal.com/events/mumbai/prizes/world .
 Agent Pass ($5k): https://auth.world.org/docs ; OIDC step-up, max_age=0 +
 essential acr; server validates acr, auth_time, nonce, state; bound to the
 pending action. OR IDKit ($2.5k): @worldcoin/idkit v4; backend signs rp
 context with RP signing key; verify at
 https://developer.world.org/api/v4/verify/{rp_id}; staging simulator
 https://simulator.worldcoin.org ; nullifiers UNIQUE.
 Either way: root issuance needs server-verified World check (one human,
 one root); requests above 15 USDC need fresh approval bound to the request
 hash; deny path (cancel/expire/wrong account) = no side effect + reason in
 UI; docs/world-feedback.md (time to first success, friction, docs gaps,
 top improvement); disclose test identities. Authentication != permission.
Payments: Sepolia test USDC (https://faucet.circle.com ; confirm address
+ 6 decimals in Circle docs). Fund the service key; record balances.
LLM (procure agent): ask me which provider/key (my perks). JSON tool-call
output; model output shown verbatim; if the model resists injection, use a
clearly labelled "rogue-agent fixture".

=====================================================================
7. DASHBOARD + THE 43 BUILDING BLOCKS
=====================================================================
Design "CIRCUIT BREAKER" (dark mission control): authority is current
flowing down a wire owner -> ops -> procure -> settle, each hop's wire
THINNER (14 -> 10 -> 6 -> 3 px); the payment service is a BREAKER: honest
requests flow through (lime), over-limit ones TRIP it (red spark, wire
snaps, "No money moved"). Colors: #0B0D10 bg, #12151A panels, #232831
borders, ONE accent lime #C6FF3D, red #FF4D4D, amber pending; status always
has text. Fonts (next/font/google): Bricolage Grotesque headings/numbers,
Geist body, Geist Mono hashes/amounts; never Inter/Arial. Components only
where they serve the metaphor: Componentry (shadcn registry @componentry:
circuit-board header bg, spotlight-card permits), 21st.dev Magic MCP if
installed (scenario switcher, timeline, toasts), shadcn primitives, Framer
Motion. Check React/Tailwind compatibility; no core-dep upgrades for a
component; no GSAP. BANNED: purple/blue gradients, aurora/particles,
glassmorphism, emoji icons, stat-tile grids, >1 decorative effect,
lorem ipsum.
Pages: STAGE (/): scenarios [1 Honest] [2 Injected invoice] [3 Revoke
upstream] [4 Replay] [5 Attack it yourself], keys 1-5, Space next beat, R
reset, presenter mode +25% text. Left invoice (plain text, injected line
red-underlined + "injected"); middle wire + permit cards (ENS name, 4
caveats, signature chip, revocation chip, Arkiv link); right breaker
checklist (plain English + mono detail), result, tx link or "No money
moved", balance before/after. Beats ~700 ms apart. Money shot (scenario 2):
"ASKED 450.00 USDC / ALLOWED 150.00 USDC", excess bar spills red. Scenario
5: a judge types any invoice -> real procure agent -> real /execute ->
live result (rate-limited, plain text, separate test funds).
REGISTRY (/explorer): root/ENS input -> Arkiv -> local verify ->
revocation -> table with USABLE / REVOKED / EXPIRED / DENIED (stale read),
filters, "Export evidence" CSV/JSON. AGENT PROFILE (/agent/[ens]): ENS
records, delegation, status history, Arkiv entity, Etherscan links.
ISSUE MANDATE modal: form -> World check -> wallet signature -> root
accepted -> written to Arkiv + ENS; cancel = nothing created.
Live timeline via SSE/polling 1-2 s (cross-app live demo).

THE 43 BLOCKS (write this table to docs/hackathon-prereqs.md + the skill;
build USE; MAYBE only if ahead at 23:00; SKIP with the reason written):
1 Landing page: attractive hero -> USE minimal hero above the stage
2 Navbar: working links, z-index right -> USE
3 Sidebar -> SKIP (2-3 pages, navbar enough)
4 Footer: sheet says judges never check it -> SKIP
5 Notifications: working notification logic -> USE toasts per outcome
6 Popups: small action confirmations -> USE (copied, revocation sent)
7 Modals: forms in small space -> USE (revoke confirm, World approval,
  issue mandate)
8 Dropdowns/radio/date range -> USE registry filters, expiry picker
9 Fully integrated forms: one of each input type -> USE issue-mandate form
10 Multilingual -> SKIP
11 Maps -> SKIP
12 Text-heavy cards with hover -> USE permit cards
13 Image cards -> SKIP
14 Carousel -> SKIP
15 Login/signup FE -> SKIP (wallet + World are identity)
16 Login/signup BE + hashing/salting/pepper -> SKIP (same reason)
17 CRUD GET/POST/PATCH/DELETE -> USE service API
18 AI chatbot -> SKIP
19 WhatsApp bot -> SKIP
20 Voice navigation -> SKIP
21 Video call -> SKIP
22 Recommendation/search engine -> SKIP (filters enough)
23 OCR (read uploaded docs) -> MAYBE invoice image -> text
24 IVR -> SKIP
25 Calendar -> SKIP
26 Dashboard page -> USE the stage
27 Profile page -> USE agent profile
28 Buy/sell -> SKIP
29 Checkout -> SKIP
30 Blogs/community -> SKIP
31 Messaging via websockets -> USE as live SSE timeline (not chat)
32 Reels -> SKIP
33 Quiz -> SKIP
34 Color palettes (formal/creative/edu/health) -> USE circuit theme
35 Dummy JSONs -> USE fixtures, clearly labelled
36 Dummy images -> SKIP
37 Cross-app live working ("winning strategy") -> USE agents in terminals
   + dashboard + Etherscan updating live
38 Export CSV/PDF -> USE evidence export
39 File handling (store + retrieve) -> USE invoice .txt upload
40 Text-to-speech -> MAYBE voice-read the verdict
41 Speech-to-text -> MAYBE
42 Points mechanism -> SKIP
43 Redeeming mechanism -> SKIP
Presentation tips from the same sheet (use in DEMO.md): presentation
matters as much as product; open with a fact/data point; add an emotional
hook; explain tech non-technically; show something live across apps.

=====================================================================
8. TESTS
=====================================================================
core matrix: valid; widened amount; changed target/action; expiry beyond
parent; wrong signer; substituted parent; root not pinned; request signed
by non-leaf; expired; replay incl. concurrent; revoked ancestor;
revocation read failure; World approval missing/stale/other request;
unknown fields. contracts: section 5. e2e on Sepolia (scripts/e2e.ts):
scenarios 1-4 with balance assertions + tx links -> docs/evidence.md.

=====================================================================
9. TIMELINE (no sleep; adjust to the real clock)
=====================================================================
Phase 0  setup (above)
Phase A  +45m   versions.md from official docs, list my manual tasks
                with links (faucets, ENS root name, Arkiv key, World
                portal, LLM key, Vercel/host), core types + narrows + tests
Phase B  ->21:00 verifier + full matrix; RevocationRegistry tested +
                 deployed
Phase C  ->22:30 payment service + agents; scenarios 1-4 LIVE on Sepolia
                 [CHECKPOINT P0]
Phase D  ->00:30 Arkiv write+read; ENSv2 names + permissioned resolver
                 demo; World path + deny path [CHECKPOINT P1]
Phase E  ->02:30 dashboard stage, registry, profile, issue modal, live
                 timeline, attack-it-yourself; sdk + cli
Phase F  03:00   CODE FREEZE (proven bugs only)
Phase G  ->04:30 README, DEMO.md, sponsor files, deploy (dashboard
                 Vercel; service on one always-on host), phone test
Phase H  ->06:00 I record the 2:30-2:59 video (my voice); you draft
                 submission text
Phase I  ->07:30 submit; verify "submitted"
Cut order if behind: TTS/OCR -> agent profile -> export ->
attack-it-yourself -> filters. NEVER cut P0 scenarios, deny paths,
tests, sponsor-required files.

=====================================================================
10. DELIVERABLES
=====================================================================
README (problem, 30-s pitch, Mermaid architecture, live links, all
testnet addresses + Etherscan/Arkiv/ENS links, run/test, trust limits,
prior art UCAN/Biscuit/Steg/ENSign/ENSFirewall + what we add, sponsor
requirement -> file map); DEMO.md (2:45 video beats, 4-min pitch, 10 Q&A);
docs/threat-model.md (trusted gateway, per-request ceilings, revocation
freshness, compromised root key out of scope); docs/evidence.md;
docs/versions.md; docs/world-feedback.md; arkiv/*.md; submission draft
(short/long description, how it's made, category Security, partners ENS,
Arkiv, World).

=====================================================================
11. WORKING WITH ME
=====================================================================
Before each phase: 5-line plan. After each: works (evidence), broken,
UNVERIFIED, my manual tasks, next. Ask decisions in batches. Run
autonomously between checkpoints; stop only for a missing key, a sponsor
blocker >30 min, or a decision that changes the demo.

Begin with PHASE 0 now.
