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
