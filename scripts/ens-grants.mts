// Scoped write permissions on each agent's PermissionedResolver (admin: OWNER):
//  - the issuer of a name's delegation may write ONLY mandate:delegation-id / parent-id / delegation-uri
//  - (subject status grants were made in ens-setup.mts: the agent may write ONLY mandate:status)
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { resolverAbi, ISSUER_KEYS } from "@mandate/agents";
process.loadEnvFile(".env");
const st = JSON.parse(readFileSync("data/ens.json", "utf8"));
const rpc = process.env.SEPOLIA_RPC_URL!;
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
const w = createWalletClient({ chain: sepolia, transport: http(rpc), account: owner });
// resolver of name -> issuer of that name's delegation
const plan: [string, Address][] = [
  ["resolver.ops", owner.address],
  ["resolver.procure", process.env.OPS_ADDRESS as Address],
  ["resolver.settle", process.env.PROCURE_ADDRESS as Address],
];
for (const [key, issuer] of plan) {
  if (st[`issuerGrant.${key}`]) continue;
  const hashes: Hex[] = [];
  for (const k of ISSUER_KEYS) {
    const setter = encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x", k, ""] });
    const hash = await w.writeContract({ address: st[key].address, abi: resolverAbi, functionName: "grantSetterRoles", args: [setter, issuer] });
    await pub.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  st[`issuerGrant.${key}`] = hashes;
  writeFileSync("data/ens.json", JSON.stringify(st, null, 2));
  console.log(`${key}: issuer ${issuer} may write ${ISSUER_KEYS.join(", ")}`);
}
