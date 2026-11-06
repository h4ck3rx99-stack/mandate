// Resolve Mandate names through viem's standard ENS path (Universal Resolver), no hardcoded resolver.
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
process.loadEnvFile(".env");
const c = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
for (const name of process.argv.slice(2)) {
  try {
    const [addr, subject, status, delegationId] = await Promise.all([
      c.getEnsAddress({ name: normalize(name) }),
      c.getEnsText({ name: normalize(name), key: "mandate:subject" }),
      c.getEnsText({ name: normalize(name), key: "mandate:status" }),
      c.getEnsText({ name: normalize(name), key: "mandate:delegation-id" }),
    ]);
    console.log(name, { addr, subject, status, delegationId });
  } catch (e: any) { console.log(name, "ERR", (e.shortMessage ?? String(e)).slice(0, 160)); }
}
