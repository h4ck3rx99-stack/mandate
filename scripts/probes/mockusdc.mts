import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
process.loadEnvFile("C:/Mandate/.env");
const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex);
const token = "0x240b0316df57887dbbe58b586508b19e633a14aa";
const abi = parseAbi(["function decimals() view returns (uint8)","function balanceOf(address) view returns (uint256)","function mint(address,uint256)","function mint(uint256)","function faucet()","function drip()"]);
console.log("decimals", await pub.readContract({ address: token, abi, functionName: "decimals" }));
console.log("owner bal", await pub.readContract({ address: token, abi, functionName: "balanceOf", args: [owner.address] }));
for (const [fn, args] of [["mint",[owner.address, 100_000_000n]],["mint",[100_000_000n]],["faucet",[]],["drip",[]]] as const) {
  try { await pub.simulateContract({ address: token, abi, functionName: fn as any, args: args as any, account: owner }); console.log("OK", fn, args.length); }
  catch (e: any) { console.log("no", fn, args.length, (e.shortMessage ?? "").slice(0, 80)); }
}
