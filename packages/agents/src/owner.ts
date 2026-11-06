import { ROOT_PARENT, signDelegation, type Delegation, type Scope } from "@mandate/core";
import { keccak256, toHex } from "viem";
import { addressOf, agentAccount, domain, names } from "./env";

/** Treasury owner (root issuer) grants the operations agent its mandate. Holds only OWNER key. */
export async function issueRoot(scope: Scope): Promise<Delegation> {
  const owner = agentAccount("OWNER");
  const n = names();
  return signDelegation(owner, domain(), {
    parent: ROOT_PARENT,
    subject: addressOf("OPS"),
    issuerName: n.treasury,
    subjectName: n.ops,
    scope,
    nonce: keccak256(toHex(`root-${Date.now()}-${Math.random()}`)),
  });
}

/** Owner revokes a delegation it issued (its own namespace in RevocationRegistry). Returns tx hash. */
export async function revokeOnchain(id: `0x${string}`): Promise<`0x${string}`> {
  const { createPublicClient, createWalletClient, http } = await import("viem");
  const { sepolia } = await import("viem/chains");
  const owner = agentAccount("OWNER");
  const rpc = process.env.SEPOLIA_RPC_URL;
  const registry = process.env.REVOCATION_REGISTRY_ADDRESS as `0x${string}`;
  if (!rpc || !registry) throw new Error("SEPOLIA_RPC_URL / REVOCATION_REGISTRY_ADDRESS missing");
  const abi = [{ type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes32" }], outputs: [] }] as const;
  const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account: owner });
  const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const hash = await wallet.writeContract({ address: registry, abi, functionName: "revoke", args: [id] });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`revoke reverted: ${hash}`);
  return hash;
}
