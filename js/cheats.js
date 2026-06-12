/* Verified rare-candy & QoL cheat library, keyed by ROM internal game code.
   GBA: 4-char code at ROM offset 0xAC.  NDS: 4-char code at offset 0x0C.
   Sources: pokemoncoders.com (verified June 2026). US/NA versions. */

const CHEAT_DB = {
  /* ---------------- GBA ---------------- */
  AXVE: { game: "Pokémon Ruby", sys: "gba", cheats: [
    { name: "Rare Candies in PC (GameShark v3/AR)", how: "Withdraw from PC item storage. Disable after use. v1.0 ROM only.",
      code: "280EA266 88A62E5C" },
  ]},
  AXPE: { game: "Pokémon Sapphire", sys: "gba", cheats: [
    { name: "Rare Candies in PC (GameShark v3/AR)", how: "Withdraw from PC item storage. Disable after use. v1.0 ROM only.",
      code: "280EA266 88A62E5C" },
  ]},
  BPEE: { game: "Pokémon Emerald", sys: "gba", cheats: [
    { name: "Rare Candies in PC (AR/GS v3)", how: "Check PC item storage, withdraw, then disable cheat.",
      code: "BFF956FA 2F9EC50D" },
    { name: "Rare Candy at PokéMart (CodeBreaker)", how: "Buy the first item at any PokéMart — it becomes Rare Candy. Disable after.",
      code: "82005274 0044" },
  ]},
  BPRE: { game: "Pokémon FireRed", sys: "gba", cheats: [
    { name: "Rare Candies in PC (CodeBreaker)", how: "Check PC item storage, withdraw, then disable cheat.",
      code: "82025840 0044" },
  ]},
  BPGE: { game: "Pokémon LeafGreen", sys: "gba", cheats: [
    { name: "Rare Candies in PC (CodeBreaker)", how: "Check PC item storage, withdraw, then disable cheat.",
      code: "82025840 0044" },
  ]},

  /* ---------------- NDS (Action Replay) ---------------- */
  ADAE: { game: "Pokémon Diamond", sys: "nds", cheats: [
    { name: "x999 Rare Candies (Press L+R)", how: "Press L+R in game, then check Medicine pocket.",
      code: "94000130 FCFF0000\nB21C4D28 00000000\nB0000004 00000000\n00000DAC 03E70032\nD2000000 00000000" },
  ]},
  APAE: { game: "Pokémon Pearl", sys: "nds", cheats: [
    { name: "x999 Rare Candies (Press L+R)", how: "Press L+R in game, then check Medicine pocket.",
      code: "94000130 FCFF0000\nB21C4D28 00000000\nB0000004 00000000\n00000DAC 03E70032\nD2000000 00000000" },
  ]},
  CPUE: { game: "Pokémon Platinum", sys: "nds", cheats: [
    { name: "900x All Medicine incl. Rare Candy (Press L+R)", how: "Press L+R, check Medicine pocket. Toss what you don't need.",
      code: "94000130 FCBF0000\n62101D40 00000000\nB2101D40 00000000\nD5000000 03840011\nC0000000 00000025\nD6000000 00000B60\nD4000000 00000001\nD2000000 00000000" },
  ]},
  IPKE: { game: "Pokémon HeartGold", sys: "nds", cheats: [
    { name: "x999 Rare Candies (Press L+R)", how: "Press L+R in game, then check Medicine pocket.",
      code: "94000130 FCFF0000\nB2111880 00000000\n00000B74 03E70032\nD2000000 00000000" },
  ]},
  IPGE: { game: "Pokémon SoulSilver", sys: "nds", cheats: [
    { name: "x999 Rare Candies (Press L+R)", how: "Press L+R in game, then check Medicine pocket.",
      code: "94000130 FCFF0000\nB2111880 00000000\n00000B74 03E70032\nD2000000 00000000" },
  ]},
  IRBO: { game: "Pokémon Black", sys: "nds", cheats: [
    { name: "900 Rare Candies (Press L+R)", how: "Press L+R — first slot of recovery pouch becomes 900 Rare Candies.",
      code: "94000130 FCFF0000\n02234784 03840032\nD2000000 00000000" },
  ]},
  IRAO: { game: "Pokémon White", sys: "nds", cheats: [
    { name: "900 Rare Candies (Press L+R)", how: "Press L+R — first slot of recovery pouch becomes 900 Rare Candies.",
      code: "94000130 FCFF0000\n022347A4 03840032\nD2000000 00000000" },
  ]},
  IREO: { game: "Pokémon Black 2", sys: "nds", cheats: [
    { name: "Unlimited Rare Candies (Press Select)", how: "Press Select, check Healing Items pocket. Disable after withdrawing.",
      code: "94000130 FFFB0000\nB2000024 00000000\n000194F8 FFFF0032\nD2000000 00000000" },
    { name: "Rare Candy x1 in first recovery slot (Press L+R)", how: "Replaces first recovery item with a Rare Candy.",
      code: "94000130 FCFF0000\n1221E1BC 00000032\nD2000000 00000000" },
  ]},
  IRDO: { game: "Pokémon White 2", sys: "nds", cheats: [
    { name: "Unlimited Rare Candies (Press Select)", how: "Press Select, check Healing Items pocket. Disable after withdrawing.",
      code: "94000130 FFFB0000\nB2000024 00000000\n000194F8 FFFF0032\nD2000000 00000000" },
  ]},
};

/* ROM hacks share the base game's code (e.g. most FireRed hacks keep BPRE).
   Detection reads the header; if a hack changed item tables the candy cheat may not work. */

function detectGameFromRom(buf, ext) {
  const u8 = new Uint8Array(buf);
  const ascii = (off, len) => {
    let s = "";
    for (let i = 0; i < len; i++) { const c = u8[off + i]; if (c >= 32 && c < 127) s += String.fromCharCode(c); }
    return s;
  };
  if (ext === "gba") {
    return { sys: "gba", code: ascii(0xAC, 4), title: ascii(0xA0, 12).trim() };
  }
  if (ext === "nds") {
    return { sys: "nds", code: ascii(0x0C, 4), title: ascii(0x00, 12).trim() };
  }
  return { sys: ext === "gb" || ext === "gbc" ? "gb" : "unknown", code: "", title: "" };
}

function cheatsForCode(code) {
  if (CHEAT_DB[code]) return CHEAT_DB[code];
  // region variants (last letter differs): try base
  const base = code ? code.slice(0, 3) : "";
  for (const k of Object.keys(CHEAT_DB)) if (k.slice(0, 3) === base && base) return { ...CHEAT_DB[k], regionNote: "Code is for the US ROM — yours looks like another region, cheats may not work." };
  return null;
}
