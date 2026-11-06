// ENSv2 PermissionedResolver demo: the settle agent may write ONLY mandate:status on its own name.
// One allowed write + one write that is sent anyway and reverts onchain (EACUnauthorizedAccountRoles).
import { appendFileSync } from "node:fs";
import { names, setStatus, writeText } from "@mandate/agents";
process.loadEnvFile(".env");
const name = names().settle;
const ok = await setStatus("SETTLE", name, `active ${new Date().toISOString()}`);
console.log("allowed  mandate:status        ", ok.status, `https://sepolia.etherscan.io/tx/${ok.hash}`);
const bad = await writeText("SETTLE", name, "mandate:delegation-id", "0xforged", true);
console.log("denied   mandate:delegation-id ", bad.status, `https://sepolia.etherscan.io/tx/${bad.hash}`);
if (ok.status !== "success" || bad.status !== "reverted") throw new Error("unexpected result");
appendFileSync("docs/evidence.md", `\n## ENSv2 scoped resolver permissions (${new Date().toISOString()})\nSettle agent key on \`${name}\` (resolver ${ok.resolver}):\n- write \`mandate:status\`: **success** https://sepolia.etherscan.io/tx/${ok.hash}\n- write \`mandate:delegation-id\`: **reverted** https://sepolia.etherscan.io/tx/${bad.hash}\n`);
