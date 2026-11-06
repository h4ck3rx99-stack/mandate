// Splits Sepolia ETH from DEPLOYER to every other role key that holds less than the target. Testnet only.
import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(".env");
const rpc = process.env.SEPOLIA_RPC_URL;
if (!rpc) throw new Error("SEPOLIA_RPC_URL missing");
if (Number(process.env.CHAIN_ID) !== sepolia.id) throw new Error("CHAIN_ID is not Sepolia; refusing");
const from = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account: from });
const TARGET = parseEther(process.argv[2] ?? "0.006");

for (const role of ["SERVICE", "PLAYGROUND_SERVICE", "OWNER", "OPS", "PROCURE", "SETTLE", "SUPPLIER_A"]) {
  const to = privateKeyToAccount(process.env[`${role}_PRIVATE_KEY`] as Hex).address;
  const bal = await pub.getBalance({ address: to });
  if (bal >= TARGET) { console.log(role.padEnd(20), "ok", formatEther(bal)); continue; }
  const hash = await wallet.sendTransaction({ to, value: TARGET - bal });
  await pub.waitForTransactionReceipt({ hash });
  console.log(role.padEnd(20), "funded", formatEther(TARGET - bal), `https://sepolia.etherscan.io/tx/${hash}`);
}
console.log("DEPLOYER left".padEnd(20), formatEther(await pub.getBalance({ address: from.address })));
