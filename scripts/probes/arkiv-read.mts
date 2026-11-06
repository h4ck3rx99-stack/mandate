// Probe: Arkiv read path (works without an access key?) + our schema query shape.
import { fetchByRoot } from "@mandate/arkiv";
process.loadEnvFile(".env");
try { console.log("fetchByRoot ->", await fetchByRoot(("0x" + "00".repeat(32)) as `0x${string}`)); }
catch (e: any) { console.log("ERR", e.constructor?.name, (e.shortMessage ?? e.message ?? String(e)).slice(0, 300)); }
