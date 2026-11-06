// Mints ENS v2 Sepolia MockUSDC (registration-fee test token, public mint) to OWNER.
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
process.loadEnvFile("C:/Mandate/.env");
const rpc = process.env.SEPOLIA_RPC_URL;
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex);
const token = "0x240b0316df57887dbbe58b586508b19e633a14aa"; // MockUSDC, docs.ens.domains/learn/deployments#sepolia-ensv2
const abi = parseAbi(["function mint(address,uint256)", "function balanceOf(address) view returns (uint256)"]);
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account: owner });
const hash = await wallet.writeContract({ address: token, abi, functionName: "mint", args: [owner.address, 50_000_000n] });
await pub.waitForTransactionReceipt({ hash });
console.log("minted 50 MockUSDC:", `https://sepolia.etherscan.io/tx/${hash}`);
console.log("balance:", Number(await pub.readContract({ address: token, abi, functionName: "balanceOf", args: [owner.address] })) / 1e6);
