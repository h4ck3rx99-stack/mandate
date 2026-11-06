/** Cast of cursors that build the site. Pick by index so neighbours differ. Plain module: usable from server and client. */
export const CAST = [
  "ops.treasury", "procure.ops", "settle.procure", "ENS resolver", "Arkiv", "World ID", "payment service",
  "RevocationRegistry", "auditor", "Groq · invoice reader", "USDC · Sepolia", "treasury owner",
];
export const who = (i: number) => CAST[i % CAST.length]!;
