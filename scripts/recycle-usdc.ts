// Testnet budget helper: supplier-A (our own test key) returns the USDC it received to the SERVICE treasury.
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(".env");
const rpc = process.env.SEPOLIA_RPC_URL!;
const usdc = process.env.USDC_ADDRESS as Address;
const to = process.env.SERVICE_ADDRESS as Address;
const supplier = privateKeyToAccount(process.env.SUPPLIER_A_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account: supplier });
const bal = await pub.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [supplier.address] });
if (bal === 0n) { console.log("supplier-A holds 0 USDC; nothing to recycle"); process.exit(0); }
const hash = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "transfer", args: [to, bal] });
await pub.waitForTransactionReceipt({ hash });
console.log(`returned ${(Number(bal) / 1e6).toFixed(2)} USDC to SERVICE: https://sepolia.etherscan.io/tx/${hash}`);
