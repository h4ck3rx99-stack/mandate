// ENSv2 hierarchy for Mandate on Sepolia. Idempotent: progress is saved to data/ens.json.
//   mandate.eth (OWNER)
//     └ treasury.mandate.eth            owner OWNER   — registered by OWNER in R_mandate
//        └ ops.treasury…                owner OPS     — registered by OWNER in R_treasury
//           └ procure.ops.treasury…     owner PROCURE — registered by OPS in R_ops
//              └ settle.procure.ops…    owner SETTLE  — registered by PROCURE in R_procure
// Each name gets its own PermissionedResolver (admin: OWNER). Its agent is granted the setter role for
// ONLY the `mandate:status` text key on its own resolver.
// Docs: docs.ens.domains/ensv2/{verifiable-factory,permissioned-registry,permissioned-resolver,subnames}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseAbi, parseEventLogs, toHex,
  type Address, type Hex, type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { labelhash, namehash, packetToBytes } from "viem/ens";

process.loadEnvFile(".env");
const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
if (Number(env("CHAIN_ID")) !== sepolia.id) throw new Error("not Sepolia");
const rpc = env("SEPOLIA_RPC_URL");
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
const acct = (role: string) => privateKeyToAccount(env(`${role}_PRIVATE_KEY`) as Hex);
const OWNER = acct("OWNER"), OPS = acct("OPS"), PROCURE = acct("PROCURE");
const SETTLE_ADDR = env("SETTLE_ADDRESS") as Address;

// Sepolia ENSv2 deployments (docs.ens.domains/learn/deployments#sepolia-ensv2)
const ETH_REGISTRY = env("ENS_ETH_REGISTRY") as Address;
const FACTORY = env("ENS_VERIFIABLE_FACTORY") as Address;
const USER_REGISTRY_IMPL = env("ENS_USER_REGISTRY_IMPL") as Address;
const RESOLVER_IMPL = env("ENS_PERMISSIONED_RESOLVER_IMPL") as Address;

const ALL_ROLES = BigInt("0x" + "1".repeat(64));
const ROLE_RENEW = 1n << 16n;
const root = env("ENS_ROOT_NAME"); // mandate.eth
const rootLabel = root.replace(/\.eth$/, "");
const N = { treasury: `treasury.${root}` } as Record<string, string>;
N.ops = `ops.${N.treasury}`; N.procure = `procure.${N.ops}`; N.settle = `settle.${N.procure}`;

const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const registryAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function findOwner(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function findExpiry(string label) view returns (uint64)",
]);
export const resolverAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function grantSetterRoles(bytes setter, address account)",
]);

const STATE = "data/ens.json";
const st: Record<string, any> = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => { mkdirSync("data", { recursive: true }); writeFileSync(STATE, JSON.stringify(st, null, 2)); };
const etx = (h: Hex) => `https://sepolia.etherscan.io/tx/${h}`;

async function send(who: LocalAccount, req: { address: Address; abi: any; functionName: string; args: any[] }) {
  const w = createWalletClient({ chain: sepolia, transport: http(rpc), account: who });
  const { request } = await pub.simulateContract({ ...req, account: who } as any);
  const hash = await w.writeContract(request as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted ${etx(hash)}`);
  return { hash, r };
}

async function deploy(key: string, who: LocalAccount, impl: Address, data: Hex) {
  if (st[key]) return st[key].address as Address;
  const salt = BigInt(keccak256(toHex(`mandate:${key}:v1`)));
  const { hash, r } = await send(who, { address: FACTORY, abi: factoryAbi, functionName: "deployProxy", args: [impl, salt, data] });
  const ev = parseEventLogs({ abi: factoryAbi, logs: r.logs, eventName: "ProxyDeployed" })[0];
  if (!ev) throw new Error(`no ProxyDeployed in ${etx(hash)}`);
  st[key] = { address: ev.args.proxyAddress, tx: hash, deployer: who.address };
  save();
  console.log(`deployed ${key} ${ev.args.proxyAddress} ${etx(hash)}`);
  return ev.args.proxyAddress;
}

const regInit = (admin: Address) => encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: admin, roleBitmap: ALL_ROLES }]] });
const resInit = (admin: Address) => encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [[{ account: admin, roleBitmap: ALL_ROLES }], []] });

// --- resolvers (admin OWNER) ---
const res: Record<string, Address> = {};
for (const k of ["treasury", "ops", "procure", "settle"]) res[k] = await deploy(`resolver.${k}`, OWNER, RESOLVER_IMPL, resInit(OWNER.address));

// --- registries: each name's children live in a registry administered by that name's owner ---
const R_mandate = await deploy("registry.mandate", OWNER, USER_REGISTRY_IMPL, regInit(OWNER.address));
const R_treasury = await deploy("registry.treasury", OWNER, USER_REGISTRY_IMPL, regInit(OWNER.address));
const R_ops = await deploy("registry.ops", OPS, USER_REGISTRY_IMPL, regInit(OPS.address));
const R_procure = await deploy("registry.procure", PROCURE, USER_REGISTRY_IMPL, regInit(PROCURE.address));

// --- attach R_mandate under mandate.eth ---
const currentSub = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getSubregistry", args: [rootLabel] });
if (currentSub.toLowerCase() !== R_mandate.toLowerCase()) {
  const { hash } = await send(OWNER, { address: ETH_REGISTRY, abi: registryAbi, functionName: "setSubregistry", args: [BigInt(labelhash(rootLabel)), R_mandate] });
  st.attachRoot = hash; save();
  console.log(`setSubregistry(${root}) -> ${R_mandate} ${etx(hash)}`);
}

// --- register the chain of names, each by its parent's owner ---
const rootExpiry = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "findExpiry", args: [rootLabel] });
const expiry = rootExpiry; // subnames never outlive the root
const regs: [string, LocalAccount, Address, string, Address, Address, Address][] = [
  ["treasury", OWNER, R_mandate, "treasury", OWNER.address, R_treasury, res.treasury!],
  ["ops", OWNER, R_treasury, "ops", OPS.address, R_ops, res.ops!],
  ["procure", OPS, R_ops, "procure", PROCURE.address, R_procure, res.procure!],
  ["settle", PROCURE, R_procure, "settle", SETTLE_ADDR, "0x0000000000000000000000000000000000000000", res.settle!],
];
for (const [key, by, registry, label, owner, sub, resolver] of regs) {
  const cur = await pub.readContract({ address: registry, abi: registryAbi, functionName: "findOwner", args: [label] });
  if (cur.toLowerCase() === owner.toLowerCase()) continue;
  const { hash } = await send(by, { address: registry, abi: registryAbi, functionName: "register", args: [label, owner, sub, resolver, ROLE_RENEW, expiry] });
  st[`name.${key}`] = { name: N[key], owner, registry, resolver, tx: hash }; save();
  console.log(`registered ${N[key]} -> ${owner} ${etx(hash)}`);
}

// --- base records + scoped grant: agent may write ONLY mandate:status on its own resolver ---
const dns = (n: string) => toHex(packetToBytes(n));
const subjectOf: Record<string, Address> = { treasury: OWNER.address, ops: OPS.address, procure: PROCURE.address, settle: SETTLE_ADDR };
for (const k of ["treasury", "ops", "procure", "settle"]) {
  if (st[`records.${k}`]) continue;
  await send(OWNER, { address: res[k]!, abi: resolverAbi, functionName: "setAddress", args: [dns(N[k]!), 60n, subjectOf[k]!] });
  await send(OWNER, { address: res[k]!, abi: resolverAbi, functionName: "setText", args: [dns(N[k]!), "mandate:subject", subjectOf[k]!] });
  await send(OWNER, { address: res[k]!, abi: resolverAbi, functionName: "setText", args: [dns(N[k]!), "mandate:registry", env("REVOCATION_REGISTRY_ADDRESS")] });
  if (k !== "treasury") {
    const setter = encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x", "mandate:status", ""] });
    const { hash } = await send(OWNER, { address: res[k]!, abi: resolverAbi, functionName: "grantSetterRoles", args: [setter, subjectOf[k]!] });
    st[`grant.${k}`] = hash;
  }
  st[`records.${k}`] = true; save();
  console.log(`records + status grant for ${N[k]}`);
}
console.log("names:", N, "\nnamehash(settle):", namehash(N.settle!));
