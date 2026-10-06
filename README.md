# Web3 Sims 💎

A Sims-style browser life sim for Web3 grinders. Farm airdrops, trade a news-driven fake market, mint and flip NFTs, grind Crypto Twitter, land SOL gigs, pay rent, and move from a studio to a Dubai villa.

**Play:** https://web3sims.vercel.app

- Static HTML/CSS/JS, no build step, no backend. Progress saves to `localStorage`.
- Fake money only (no wallet connection, no real crypto).
- Works on phones: tap to walk, tap objects/buildings/sims for menus (bottom sheet on small screens).

## Real-life rules
- **Start from ◎0.** No tokens, no NFTs, crashing at a friend's place. Earn through phone jobs (raids, Discord mod, bounties), PC jobs (ghostwriting, QA), café/market shifts in town, free testnet airdrop tasks and gigs. Rent starts once you have earned ◎1.
- **Devices.** Apps (feed, DMs, gigs, market, farm, NFTs, wallet) only open while your sim is on the phone or at the home PC. Phone: quick trades (≤ ◎0.5), DMs, jobs. PC: big trades, airdrop farming, coding, threads.
- **Phone pings.** DMs, mentions, gig offers, price alerts and airdrop/NFT news buzz the phone, with a toast and an optional sound (🔔/🔕). The phone never opens on its own.
- **Gas.** Every swap, listing and floor buy costs gas, so you need SOL in the wallet.
- **Paid posts.** Gig posts are marked #ad and collect follower reactions (likes, replies, shill call-outs) over a few hours. That moves the project's token price and your rep. NPC KOLs you follow post paid shills too, and you can hype them or call them out.

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
| `life.js` | Real-life layer: starter jobs, phone alerts (price/airdrop/NFT), paid-post reactions, NPC KOL paid posts |
| `compat.js` | Shims for older phones (canvas `roundRect` for iOS Safari < 16 / Android WebView < 99, etc.) |
| `ui.js` | Canvas scenes (apartment, town, interiors), pathing + travel, tap menus, HUD, side-panel apps, modals, save/load with corrupted-save recovery |

Built by Trex ([@Trextxxy](https://x.com/Trextxxy)).
