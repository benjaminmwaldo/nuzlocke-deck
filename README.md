# NuzLocke Deck 🔴

A GBA + NDS emulator web app built for **Pokémon nuzlocke challenges** — installable on your iPhone home screen like a native app. No Mac, no App Store, no sideloading.

## What's inside

| Tab | What it does |
|---|---|
| **Play** | ROM library + emulator. GBA via mGBA, NDS via melonDS (EmulatorJS/WebAssembly). Save states + battery saves in browser storage. Reads each ROM's header to identify the game. |
| **Patch** | On-device IPS / UPS / BPS / xdelta3 (VCDIFF) patcher for ROM hacks, with checksum verification. Patched game goes straight into your library. |
| **Tracker** | Full run tracker: first-encounter log with dupes warning, team (max 6), box, graveyard, missed list — plus a live **level-cap banner** that follows the boss progression for your game. |
| **Calc** | Gen 3–5 damage calculator. Pokémon + move stats auto-fill from PokéAPI (cached offline after first use), everything hand-editable for ROM hacks. Shows damage range, % HP, and OHKO/N-HKO verdicts. Handles STAB, type chart, crits, burn, screens, weather, and the Gen 3 physical/special type split. |
| **Rules** | Core + Hardcore nuzlocke rules, common clauses, strategy notes, and **hardcore level caps for every game Gen 1–5** plus popular ROM hacks (Renegade Platinum, Blaze Black/Volt White (+2 Redux), Sacred Gold/Storm Silver, Rising Ruby/Sinking Sapphire, Emerald Kaizo). |
| **Docs** | Import & store any documentation (encounter tables, boss guides, PDFs, markdown) plus a built-in notes editor. All offline, on-device. |

### Rare Candy cheats 🍬
When you hit **Play**, the app detects the game from the ROM header and offers **verified Rare Candy codes** (the hardcore-nuzlocke convention for candy-leveling to the cap):

- Ruby/Sapphire, Emerald, FireRed/LeafGreen (GameShark/CodeBreaker)
- Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black/White, Black 2/White 2 (Action Replay)

Selected cheats are pre-loaded into the emulator's cheat manager — toggle them in-game, withdraw your candies, then **turn the cheat off**. ROM hacks built on these bases are detected too (codes work unless the hack moved item tables).

### Speed-up mode ⏩
Fast-forward is enabled by default at 3×. Use the **FF ⏩** button in the top bar while playing, or the emulator's ⚙ settings menu to change the ratio.

---

## How to deploy (one-time, ~5 minutes)

The app is static files — it needs any HTTPS host. Easiest: **GitHub Pages**.

1. Create a GitHub account (if needed) and a new repository, e.g. `nuzlocke-deck`.
2. Upload **everything in this folder** (keep the folder structure: `index.html` at the root).
3. Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
4. Wait ~1 minute. Your app is live at `https://<username>.github.io/nuzlocke-deck/`.

Alternatives: drag-and-drop the folder to [Netlify Drop](https://app.netlify.com/drop) or Cloudflare Pages — same result.

### Install on your iPhone
1. Open the URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Launch from the icon — it runs full-screen, standalone, offline-capable.

### Test locally (optional)
```
python -m http.server 8000
```
then open `http://localhost:8000`. (Opening `index.html` directly via `file://` won't work — service workers need a server.)

---

## Notes & honest limitations

- **Bring your own ROMs.** Only play games you legally own. ROMs never leave your device (stored in IndexedDB).
- **NDS performance:** melonDS-in-WASM runs well on modern iPhones (A14+), but demanding 3D moments can dip. GBA is flawless. For DS, closing other Safari tabs helps.
- **iOS storage:** Safari can evict website data if your phone runs critically low on space, and "Add to Home Screen" apps have their own storage silo. **Export important saves** occasionally (in-game 💾 → save file export) and keep ROM backups.
- **Cheat codes** are for US/NA ROM versions. EU/JP ROMs use different addresses.
- The emulator cores load from the EmulatorJS CDN on first play, then stay cached for offline use.

## Credits / sources
- Emulation: [EmulatorJS](https://emulatorjs.org) (mGBA, melonDS cores)
- Level caps: [Nuzlocke University](https://nuzlockeuniversity.ca/2022/01/18/hardcore-nuzlocke-level-caps-by-generation/)
- Cheat codes verified via [PokemonCoders](https://www.pokemoncoders.com)
- Live Pokémon data: [PokéAPI](https://pokeapi.co) · Sprites: pokemondb.net
