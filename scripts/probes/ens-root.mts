// Probe: who owns <label>.eth in the ENSv2 ETHRegistry, and its resolver/subregistry/expiry.
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
process.loadEnvFile("C:/Mandate/.env");
const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const ETH_REGISTRY = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4";
const abi = parseAbi([
  "function findOwner(string) view returns (address)",
  "function getResolver(string) view returns (address)",
  "function getSubregistry(string) view returns (address)",
  "function findExpiry(string) view returns (uint64)",
]);
const label = process.argv[2] ?? "mandate";
for (const fn of ["findOwner", "getResolver", "getSubregistry", "findExpiry"] as const) {
  try { console.log(fn, await pub.readContract({ address: ETH_REGISTRY, abi, functionName: fn, args: [label] })); }
  catch (e: any) { console.log(fn, "ERR", (e.shortMessage ?? String(e)).slice(0, 100)); }
}
console.log("OWNER_ADDRESS", process.env.OWNER_ADDRESS);
