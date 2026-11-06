import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { formatEther, http } from "viem";
process.loadEnvFile(".env");
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
console.log("chain", chain.id, chain.name);
const pub = createPublicClient({ chain, transport: http() }) as any;
for (const r of ["OWNER", "OPS", "PROCURE"]) console.log(r, formatEther(await pub.getBalance({ address: process.env[`${r}_ADDRESS`] })));
