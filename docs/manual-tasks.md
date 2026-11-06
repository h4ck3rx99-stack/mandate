# Manual tasks for the human

Never paste keys into chat. Put them in `.env` (it's gitignored).

| # | Task | Link | Unblocks | Needed by |
|---|---|---|---|---|
| 1 | Get a Sepolia RPC URL (Alchemy, Infura or similar) and set `SEPOLIA_RPC_URL` | https://dashboard.alchemy.com | everything onchain | Phase B (~20:30) |
| 2 | Fund the deployer + service addresses with Sepolia ETH (I'll print the addresses once keys are generated) | https://cloud.google.com/application/web3/faucet/ethereum/sepolia | contract deploy, transfers | Phase B |
| 3 | Get Sepolia test USDC for the service address (≥ 500 USDC; the playground key needs some too) | https://faucet.circle.com | scenario 1 transfer | Phase C (22:00) |
| 4 | Register the ENS v2 root name on Sepolia (fees are in mock USDC, so approve first), then send me the name | https://sepolia.app.ens.domains | ENS names | Phase D (23:00) |
| 5 | Create an Arkiv access key and get faucet funds for the issuer wallets; set `ARKIV_ACCESS_KEY` | https://hub.arkiv.network/access-keys , https://hub.arkiv.network/faucet | Arkiv writes | Phase D |
| 6 | World Agent Pass: sign into the portal (Google) and register an OIDC client with `client_secret_basic` and an **HTTPS** callback (I'll give you the exact URL after we choose a host or tunnel); set `WORLD_CLIENT_ID`/`SECRET` | https://auth.world.org/portal (sandbox issuer https://sandbox.auth.world.org) | World step-up | Phase D |
| 7 | Anthropic API key for the procure agent; set `ANTHROPIC_API_KEY` | https://console.anthropic.com | procure agent | Phase C |
| 8 | Hosting: a Vercel account for the dashboard plus one always-on host for the service (e.g. Railway or Fly) | https://vercel.com | live demo link, HTTPS callback | Phase G (earlier if World needs HTTPS) |
