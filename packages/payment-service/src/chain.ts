import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { ServiceConfig } from "@mandate/core";

export const revocationRegistryAbi = [
  {
    type: "function",
    name: "anyRevoked",
    stateMutability: "view",
    inputs: [{ name: "issuers", type: "address[]" }, { name: "ids", type: "bytes32[]" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "issuers", type: "address[]" }, { name: "ids", type: "bytes32[]" }],
    outputs: [{ type: "bool[]" }],
  },
  { type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
] as const;

/** Side-effecting chain operations, injected so tests can fake them. */
export interface ChainPort {
  anyRevoked(issuers: Address[], ids: Hex[]): Promise<boolean>;
  usdcBalance(): Promise<bigint>;
  /** Sign a USDC transfer with the SERVICE key; returns the hash + raw tx WITHOUT broadcasting. */
  signTransfer(to: Address, amount: bigint): Promise<{ hash: Hex; raw: Hex }>;
  broadcast(raw: Hex): Promise<void>;
  /** "confirmed" | "reverted" | "pending" (not mined within timeout) */
  waitFor(hash: Hex, timeoutMs: number): Promise<"confirmed" | "reverted" | "pending">;
}

export function sepoliaChain(cfg: ServiceConfig): ChainPort {
  if (cfg.CHAIN_ID !== sepolia.id) throw new Error(`CHAIN_ID ${cfg.CHAIN_ID} is not Sepolia; refusing (testnets only)`);
  const transport = http(cfg.SEPOLIA_RPC_URL, { timeout: 15_000 });
  const account = privateKeyToAccount(cfg.SERVICE_PRIVATE_KEY);
  const pub = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ chain: sepolia, transport, account });

  return {
    anyRevoked: (issuers, ids) =>
      pub.readContract({ address: cfg.REVOCATION_REGISTRY_ADDRESS, abi: revocationRegistryAbi, functionName: "anyRevoked", args: [issuers, ids] }),
    usdcBalance: () => pub.readContract({ address: cfg.USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    async signTransfer(to, amount) {
      const req = await wallet.prepareTransactionRequest({
        to: cfg.USDC_ADDRESS,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
      });
      const raw = await wallet.signTransaction(req);
      return { hash: keccak256(raw), raw };
    },
    async broadcast(raw) {
      await pub.sendRawTransaction({ serializedTransaction: raw });
    },
    async waitFor(hash, timeoutMs) {
      try {
        const r = await pub.waitForTransactionReceipt({ hash, timeout: timeoutMs });
        return r.status === "success" ? "confirmed" : "reverted";
      } catch {
        return "pending";
      }
    },
  };
}
