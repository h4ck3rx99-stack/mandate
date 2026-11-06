import { createPublicClient, createWalletClient, http, parseAbi, toHex, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import type { Delegation } from "@mandate/core";
import { agentAccount } from "./env";

/** ENS is discovery, never proof: the payment service never reads these records. */
export const resolverAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
  "function grantSetterRoles(bytes setter, address account)",
]);
export const STATUS_KEY = "mandate:status";
export const ISSUER_KEYS = ["mandate:delegation-id", "mandate:parent-id", "mandate:delegation-uri"] as const;

const clients = (role: Parameters<typeof agentAccount>[0]) => {
  const rpc = process.env.SEPOLIA_RPC_URL;
  if (!rpc) throw new Error("SEPOLIA_RPC_URL missing");
  const account = agentAccount(role);
  return {
    account,
    pub: createPublicClient({ chain: sepolia, transport: http(rpc) }),
    wallet: createWalletClient({ chain: sepolia, transport: http(rpc), account }),
  };
};

export const dnsName = (name: string): Hex => toHex(packetToBytes(normalize(name)));

/** Write one text record as `role`. With force=true the tx is sent even if simulation reverts (to record a denied write onchain). */
export async function writeText(role: Parameters<typeof agentAccount>[0], name: string, key: string, value: string, force = false) {
  const { pub, wallet, account } = clients(role);
  const resolver = (await pub.getEnsResolver({ name: normalize(name) })) as Address;
  const args = [dnsName(name), key, value] as const;
  if (!force) await pub.simulateContract({ address: resolver, abi: resolverAbi, functionName: "setText", args, account });
  const hash = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: "setText", args, ...(force ? { gas: 120_000n } : {}) });
  const r = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: r.status, resolver };
}

/** Agent updates its own status (the only key it may write). */
export const setStatus = (role: Parameters<typeof agentAccount>[0], name: string, status: string) => writeText(role, name, STATUS_KEY, status);

/** Issuer publishes the delegation it just signed onto its subject's name. */
export async function publishDelegation(issuerRole: Parameters<typeof agentAccount>[0], d: Delegation, uri: string) {
  const out: Hex[] = [];
  for (const [k, v] of [["mandate:delegation-id", d.id], ["mandate:parent-id", d.parent], ["mandate:delegation-uri", uri]] as const) {
    out.push((await writeText(issuerRole, d.subjectName, k, v)).hash);
  }
  return out;
}
