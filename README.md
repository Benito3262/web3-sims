# Web3 Sims 💎

A Sims-style browser life sim for Web3 grinders. Farm airdrops, trade a news-driven fake market, mint and flip NFTs, grind Crypto Twitter, land SOL gigs, pay rent, and move from a studio to a Dubai villa.

**Play:** https://web3sims.vercel.app

- Static HTML/CSS/JS, no build step, no backend. Progress saves to `localStorage`.
- Fake money only (no wallet connection, no real crypto).
- Works on phones: tap to walk, tap objects/buildings/sims for menus (bottom sheet on small screens).

## Code layout
| File | What |
|---|---|
| `sim.js` | Core sim: needs, clock, actions, CT creator loop, gigs, buy mode, careers, homes/rent, achievements, module system (`Sim.use`) |
| `market.js` | Tokens, random-walk prices, news shocks, whales, rugs, spot trading, portfolio |
| `airdrop.js` | Protocols, farming tasks, points, sybil wallets, snapshot → TGE → claim |
| `nft.js` | Drops (WL / public gas war), reveal + traits, floors, listings, marketplace |
| `social.js` | NPC sims, follows, relationships, feed interactions, DMs. All "other player" traffic goes through a swappable `Adapter` so a real multiplayer backend can replace `LocalNPCAdapter` later |
| `world.js` | Outside world: town map, locations + hours, NPC daily schedules and walking, in-person interactions, friend/rival/romance, timed events (meetups, Onchain Summit, Whale Party, Hackathon Weekend), rides |
| `townview.js` | Town + building interior layouts and canvas drawing |
| `compat.js` | Shims for older phones (canvas `roundRect` for iOS Safari < 16 / Android WebView < 99, etc.) |
| `ui.js` | Canvas scenes (apartment, town, interiors), pathing + travel, tap menus, HUD, side-panel apps, modals, save/load with corrupted-save recovery |

Built by Trex ([@Trextxxy](https://x.com/Trextxxy)).
