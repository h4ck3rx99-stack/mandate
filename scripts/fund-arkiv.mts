// Arkiv testnet: OWNER (faucet-funded) tops up the other issuers so each can own its own entities.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { formatEther, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
process.loadEnvFile(".env");
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain, transport: http() }) as any;
const w = createWalletClient({ chain, transport: http(), account: owner }) as any;
const amount = parseEther(process.argv[2] ?? "2");
for (const r of (process.argv[3] ?? "OPS,PROCURE").split(",")) {
  const to = process.env[`${r}_ADDRESS`] as Address;
  const hash = await w.sendTransaction({ to, value: amount, chain });
  await pub.waitForTransactionReceipt({ hash });
  console.log(r, "funded", formatEther(amount), `https://rabdi.explorer.arkiv.network/tx/${hash}`);
}
