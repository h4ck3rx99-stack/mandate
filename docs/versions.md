# Versions, addresses, APIs (from official docs)

Checked 2026-11-06 19:20–19:40 IST. npm versions came from `npm view <pkg> version` on the same date. Anything marked **UNVERIFIED** has not been confirmed by a probe script yet.

## Toolchain
| Item | Version | Note |
|---|---|---|
| Node | 24.14.1 (installed) | The prompt said Node 22. The machine has 24, which works for everything below |
| pnpm | 12.18.0 | |
| TypeScript | 7.0.2 | |
| Foundry `forge` | not installed on Windows | WSL Ubuntu-22.04 is available, so try installing it there in Phase B |

## Libraries (npm latest)
| Package | Version | Used in |
|---|---|---|
| viem | 2.57.16 | everywhere (EIP-712, Sepolia, ENS) |
| zod | 4.6.7 | core schemas |
| fast-check | 4.10.2 | core property tests |
| vitest | 5.1.0 | tests |
| express | 5.3.0 | payment-service, sdk |
| better-sqlite3 | 13.0.3 | payment-service nonces/requests |
| Groq API (OpenAI-compatible, `https://api.groq.com/openai/v1`) | model `openai/gpt-oss-120b` | procure agent. A probe at 20:24 IST confirmed a forced tool call returns JSON args. Gemini was rejected: its free tier gave 403 on this account |
| next | 16.4.5 | dashboard |
| tailwindcss | 4.3.4 | dashboard |
| tsx | 4.23.15 | scripts |
| @ensdomains/ensjs | 5.2.12 | ENSv2 helpers in `@ensdomains/ensjs/wallet/v2` (docs: ≥ 5.2.5) |
| @arkiv-network/sdk | 1.0.1 | Arkiv |

## Ethereum Sepolia
| Item | Value | Source |
|---|---|---|
| chainId | 11155111 | viem `sepolia` |
| USDC (Circle) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | https://developers.circle.com/stablecoins/usdc-contract-addresses |
| USDC decimals | 6 (verified by an onchain `decimals()` probe) | |
| USDC faucet | https://faucet.circle.com | |

## ENS v2 (Sepolia)
Docs: https://docs.ens.domains/ensv2/tutorial-app-developers/ , https://docs.ens.domains/ensv2/permissioned-resolver/ , https://docs.ens.domains/ensv2/subnames , https://docs.ens.domains/learn/deployments#sepolia-ensv2

| Contract | Address |
|---|---|
| RootRegistry | 0xb458d6a3a77919449d03e7a6903c26827c1ec43f |
| ETHRegistry | 0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4 |
| ETHRegistrar | 0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3 |
| UserRegistryImpl | 0x9bd8a88719068d09ecee662f36c0e3856708366a |
| PermissionedResolverImpl | 0x115eb53f0c60696633855f90b138178fb40b2b2c |
| VerifiableFactory | 0xda70306c98e97ece36f997a21368e53298572991 |
| UniversalResolverV2 | 0x24e1d8e068620b647ca097f961a61055f4f42d72 |
| UpgradableUniversalResolverProxy | 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe |
| MockUSDC (registration fees) | 0x240b0316df57887dbbe58b586508b19e633a14aa |

APIs confirmed in the docs:
- Text records: `setText(bytes name, string key, string value)`, where name = `toHex(packetToBytes(normalize(n)))`. The caller needs the setter role on the resolver; owning the name is not enough.
- Read path: viem `getEnsText` / `getEnsAddress`. Don't hardcode the Universal Resolver address.
- PermissionedResolver: `grantSetterRoles(setter, account)`, where `setter = encodeFunctionData(setText, ['0x', key, ''])`. The grantee can write only that key; writes to any other key revert with `EACUnauthorizedAccountRoles`. Revoke with `revokeRoles(keccak256(key), ROLE_SET_TEXT (1<<4), account)`. The grant covers every name on that resolver instance.
- Subnames: deploy a UserRegistry proxy through VerifiableFactory, attach it with `setSubregistry()` on the parent's registry, then call `register(label, owner, subregistry, resolver, roleBitmap, expiry)`.
- **UNVERIFIED (Phase D):** exact `deployProxy`/`initialize` args and role constant values. Get them from https://docs.ens.domains/ensv2/registry-template plus the ENS contracts ABI, then confirm with a probe.

## Arkiv
Docs: https://docs.arkiv.network/ , https://docs.arkiv.network/start-here/first-entity/
| Item | Value |
|---|---|
| Testnet | Rabdi DB-chain, network ID 7794095 |
| RPC / WS | https://rpc.rabdi.db-chain.testnet.arkiv.network , wss://… same host |
| Explorer | https://rabdi.explorer.arkiv.network |
| Faucet / access keys | https://hub.arkiv.network/faucet , https://hub.arkiv.network/access-keys |
| Chain helper | `rabdi({ accessKey })` from `@arkiv-network/sdk/chains` |

API from the docs: `defineSchema(name, { f: str()/dec()/addr()/bytes() .indexed() })`; `walletClient.createEntity(Schema, {...}, { expiration: ExpirationTime.fromDays(n) })` → `{ entityKey }`; `publicClient.select({...}).from(Schema).ownedBy(addr).fetch()`. **UNVERIFIED:** how to filter on an attribute value, and expiration in seconds (probe in Phase D).

## World: Agent Pass (OIDC), chosen path
Prize page: https://ethglobal.com/events/mumbai/prizes/world ("We are mocking proofs now, so you don't need sandbox app anymore"; proofs use fake identities).
Docs: https://auth.world.org/docs , step-up guide https://auth.world.org/docs/guides/step-up , agent guide https://auth.world.org/docs/guides/coding-agent-setup.md

| Item | Production | Sandbox |
|---|---|---|
| Issuer | https://auth.world.org | https://sandbox.auth.world.org |
| Discovery | /.well-known/openid-configuration | same path on sandbox |
| Authorize / token | /api/v1/authorize , /api/v1/token | same paths |
| Portal | https://auth.world.org/portal (Google sign-in) | |

Facts from the discovery doc: response_type `code`; PKCE `S256`; scope `openid`; claims `iss sub aud exp iat jti nonce auth_time acr amr`; ACR `https://world.org/oidc/acr/orb` and `/orb-face`; `claims_parameter_supported: true`; ID token signed RS256; client auth `client_secret_basic` (the default).

Step-up rules: `max_age=0` plus `claims={"id_token":{"acr":{"essential":true,"values":[...]}}}`. Validate state, nonce, `acr`, `amr` and `auth_time` (must be ≥ when the attempt started). Persist the exact action bound to the attempt, and consume the approval once, in the same DB transaction that authorizes the action.
**Constraint:** callbacks must be exact HTTPS URLs, and HTTP localhost is not supported, so the service needs an HTTPS URL (a deployed host or a tunnel).

Fallback (IDKit, $2.5k): `@worldcoin/idkit` 4.6.0, simulator https://simulator.worldcoin.org , portal https://developer.worldcoin.org .

## Mandate deployments (Sepolia)
| Contract | Address | Deploy tx |
|---|---|---|
| RevocationRegistry | [0x7ebd3ef7f01892d216f590e4da45d2c681e664b8](https://sepolia.etherscan.io/address/0x7ebd3ef7f01892d216f590e4da45d2c681e664b8) | [0x0dc513d1…256d](https://sepolia.etherscan.io/tx/0x0dc513d1ff2e9e4960a3ac4ddfe65632957affe82eb715b518e774f663d8256d) (block 12076167) |

USDC `decimals()` was probed on Sepolia on 2026-11-06 (~20:05 IST) and returned **6** (verified).

## ENS root (verified by a probe, `scripts/probes/ens-root.mts`)
- `mandate.eth`: ETHRegistry `findOwner("mandate")` returns OWNER `0x1d8a886CB0df503e7b21805048395ef7Fc98b586`. Resolver `0x416a24F94AaEaf21BbaE285882a9Dfd56Fda7c25` (set by the app); no subregistry yet; expires 1825539456 (Nov 2027).
- MockUSDC on Sepolia has a public `mint(address,uint256)` (confirmed by probe); OWNER minted 50 to pay the registration fee.
- PermissionedRegistry role values come from https://docs.ens.domains/ensv2/permissioned-registry: REGISTRAR 1<<0, REGISTER_RESERVED 1<<4, SET_PARENT 1<<8, UNREGISTER 1<<12, RENEW 1<<16, SET_SUBREGISTRY 1<<20, SET_RESOLVER 1<<24, CAN_TRANSFER_ADMIN (1<<28)<<128, SET_URI 1<<36, UPGRADE 1<<124. The admin form of each role is role<<128.
