// Probe: issuer writes a real signed delegation to Arkiv, then we read it back by id and by root, and re-verify.
import { issueRoot, agentAccount } from "@mandate/agents";
import { publishDelegation, fetchById, fetchByRoot, entityUrl } from "@mandate/arkiv";
import { hashDelegation, mandateDomain } from "@mandate/core";
process.loadEnvFile(".env");
const d = await issueRoot({ actions: ["pay"], maxAmount: 500_000_000n, expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), targets: ["supplier-A"] });
const t0 = Date.now();
const key = await publishDelegation(agentAccount("OWNER"), d, d.id, 0);
console.log("written", key, `${Date.now() - t0}ms`, entityUrl(key));
const byId = await fetchById(d.id);
console.log("byId owner", byId?.owner, "error", byId?.error, "idMatch", byId?.delegation?.id === d.id);
const { id, sig, ...u } = byId!.delegation!;
console.log("recomputed id matches:", hashDelegation(mandateDomain(Number(process.env.CHAIN_ID), process.env.REVOCATION_REGISTRY_ADDRESS as `0x${string}`), u as any) === id);
console.log("byRoot count", (await fetchByRoot(d.id)).length);
