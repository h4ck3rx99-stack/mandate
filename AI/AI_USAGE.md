# AI usage log

time | files | AI-generated | human review needed
---|---|---|---
19:21 | .gitignore AGENTS.md CLAUDE.md docs/hackathon-prereqs.md .claude/skills/hackathon-prereqs AI/* | all (from human spec) | prereqs table + rules wording
19:25 | docs/versions.md docs/manual-tasks.md .env.example packages/core/* | all (docs-sourced facts in versions.md) | narrows semantics, schema bounds
19:28 | packages/core/src/{eip712,verify}.ts test/verify.test.ts | all | check order, world-approval binding (ref unsigned, hash-bound), cycle rule
19:29 | packages/contracts/* scripts/keygen.ts | all | double-revoke reverts (AlreadyRevoked) instead of no-op
20:08 | packages/contracts/{deploy.sh,broadcast/} scripts/fund-eth.ts docs/{versions,evidence}.md | all | deploy target + funding amounts
20:14 | AI/DECISIONS.md .env.example docs/versions.md | config edits | yes: decisions are human
20:24 | .env.example docs/versions.md AI/DECISIONS.md | config | model choice made by AI
20:31 | packages/payment-service/* packages/core/src/config.ts .env.example | all | PENDING semantics (missing approval doesn't burn nonce), tx lock, reconcile
20:36 | packages/agents/* scripts/scenarios.ts fixtures/* docs/evidence.md | all code; invoice copy AI-written | invoice/injection copy, procure system prompt
20:38 | scripts/recycle-usdc.ts scripts/fund-eth.ts | all | none
21:49 | scripts/probes/* docs/versions.md | all | none
22:00 | scripts/ens-*.mts packages/agents/src/ens.ts docs/ens.md docs/evidence.md | all | per-name resolver design; issuer-writes-delegation-records rule
22:03 | packages/payment-service/src/world.ts test/world.test.ts packages/core/src/config.ts docs/world/callback | all | link-by-wallet-signature design, GitHub Pages callback bounce
22:04 | packages/arkiv/* | all | schema field choices (UNVERIFIED until probe)
22:22 | packages/arkiv scripts/fund-arkiv.mts scripts/probes/* docs/versions.md | all | none
22:26 | packages/cli packages/arkiv/src/inspect.ts packages/agents/src/publish.ts packages/core/src/verify.ts scripts/scenarios.ts | all | fail-closed rules for stale/foreign-owned Arkiv records
22:27 | packages/cli/package.json | fix | none
22:33 | AI/DECISIONS.md | no | decisions are human
22:44 | packages/arkiv/src/receipts.ts packages/payment-service/* packages/agents/src/{runner,upstream}.ts packages/cli | all | receipt spam rule (only signed chains), runner design
22:47 | packages/dashboard/* | all UI code | layout, copy, visual design per human decisions
22:49 | packages/dashboard/src/app/{explorer,agent} tsconfig.base.json imports | all | none
23:43 | packages/dashboard/src/app/layout.tsx | fix | none
00:56 | dashboard landing BuildScroll.tsx, stage route move | AI-generated | human review of motion/design
