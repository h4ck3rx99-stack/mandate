# Hackathon building blocks (43) — Mandate decisions

USE = build. MAYBE = only if ahead of schedule at 23:00. SKIP = not built (reason given).

Design theme (superseded 01:27 by deep-teal terminal, see AI/DECISIONS.md): "CIRCUIT BREAKER" (dark mission control). Colors #0B0D10 bg, #12151A panels, #232831 borders, one accent lime #C6FF3D, red #FF4D4D, amber pending; status always has text. Fonts: Bricolage Grotesque (headings/numbers), Geist (body), Geist Mono (hashes/amounts); never Inter/Arial. Banned: purple/blue gradients, aurora/particles, glassmorphism, emoji icons, stat-tile grids, >1 decorative effect, lorem ipsum.

| # | Block | Decision | Note |
|---|-------|----------|------|
| 1 | Landing page: attractive hero | USE | Minimal hero above the stage |
| 2 | Navbar: working links, z-index right | USE | |
| 3 | Sidebar | SKIP | 2-3 pages, navbar enough |
| 4 | Footer | SKIP | Sheet says judges never check it |
| 5 | Notifications: working notification logic | USE | Toasts per outcome |
| 6 | Popups: small action confirmations | USE | Copied, revocation sent |
| 7 | Modals: forms in small space | USE | Revoke confirm, World approval, issue mandate |
| 8 | Dropdowns / radio / date range | USE | Registry filters, expiry picker |
| 9 | Fully integrated forms: one of each input type | USE | Issue-mandate form |
| 10 | Multilingual | SKIP | Not needed for demo |
| 11 | Maps | SKIP | Not relevant |
| 12 | Text-heavy cards with hover | USE | Permit cards |
| 13 | Image cards | SKIP | Not relevant |
| 14 | Carousel | SKIP | Not relevant |
| 15 | Login/signup FE | SKIP | Wallet + World are identity |
| 16 | Login/signup BE + hashing/salting/pepper | SKIP | Same reason: wallet + World are identity |
| 17 | CRUD GET/POST/PATCH/DELETE | USE | Service API |
| 18 | AI chatbot | SKIP | Not relevant |
| 19 | WhatsApp bot | SKIP | Not relevant |
| 20 | Voice navigation | SKIP | Not relevant |
| 21 | Video call | SKIP | Not relevant |
| 22 | Recommendation / search engine | SKIP | Filters enough |
| 23 | OCR (read uploaded docs) | MAYBE | Invoice image -> text |
| 24 | IVR | SKIP | Not relevant |
| 25 | Calendar | SKIP | Not relevant |
| 26 | Dashboard page | USE | The stage |
| 27 | Profile page | USE | Agent profile |
| 28 | Buy/sell | SKIP | Not relevant |
| 29 | Checkout | SKIP | Not relevant |
| 30 | Blogs/community | SKIP | Not relevant |
| 31 | Messaging via websockets | USE | As live SSE timeline (not chat) |
| 32 | Reels | SKIP | Not relevant |
| 33 | Quiz | SKIP | Not relevant |
| 34 | Color palettes (formal/creative/edu/health) | USE | Circuit theme |
| 35 | Dummy JSONs | USE | Fixtures, clearly labelled |
| 36 | Dummy images | SKIP | Not relevant |
| 37 | Cross-app live working ("winning strategy") | USE | Agents in terminals + dashboard + Etherscan updating live |
| 38 | Export CSV/PDF | USE | Evidence export |
| 39 | File handling (store + retrieve) | USE | Invoice .txt upload |
| 40 | Text-to-speech | MAYBE | Voice-read the verdict |
| 41 | Speech-to-text | MAYBE | |
| 42 | Points mechanism | SKIP | Not relevant |
| 43 | Redeeming mechanism | SKIP | Not relevant |

Presentation tips (use in DEMO.md): presentation matters as much as product; open with a fact/data point; add an emotional hook; explain tech non-technically; show something live across apps.
