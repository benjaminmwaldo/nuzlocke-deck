/* Damage calculator — Gen 3–5 formula. Stats fetched live from PokéAPI
   (cached in IndexedDB), with manual override fields for hacks/offline. */
const Calc = (() => {

  /* Gen 3–5 type chart (no Fairy) */
  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel"];
  const CHART = {
    normal:   { rock:.5, ghost:0, steel:.5 },
    fire:     { fire:.5, water:.5, grass:2, ice:2, bug:2, rock:.5, dragon:.5, steel:2 },
    water:    { fire:2, water:.5, grass:.5, ground:2, rock:2, dragon:.5 },
    electric: { water:2, electric:.5, grass:.5, ground:0, flying:2, dragon:.5 },
    grass:    { fire:.5, water:2, grass:.5, poison:.5, ground:2, flying:.5, bug:.5, rock:2, dragon:.5, steel:.5 },
    ice:      { fire:.5, water:.5, grass:2, ice:.5, ground:2, flying:2, dragon:2, steel:.5 },
    fighting: { normal:2, ice:2, poison:.5, flying:.5, psychic:.5, bug:.5, rock:2, ghost:0, dark:2, steel:2 },
    poison:   { grass:2, poison:.5, ground:.5, rock:.5, ghost:.5, steel:0 },
    ground:   { fire:2, electric:2, grass:.5, poison:2, flying:0, bug:.5, rock:2, steel:2 },
    flying:   { electric:.5, grass:2, fighting:2, bug:2, rock:.5, steel:.5 },
    psychic:  { fighting:2, poison:2, psychic:.5, dark:0, steel:.5 },
    bug:      { fire:.5, grass:2, fighting:.5, poison:.5, flying:.5, psychic:2, ghost:.5, dark:2, steel:.5 },
    rock:     { fire:2, ice:2, fighting:.5, ground:.5, flying:2, bug:2, steel:.5 },
    ghost:    { normal:0, psychic:2, ghost:2, dark:.5, steel:.5 },
    dragon:   { dragon:2, steel:.5 },
    dark:     { fighting:.5, psychic:2, ghost:2, dark:.5, steel:.5 },
    steel:    { fire:.5, water:.5, electric:.5, ice:2, rock:2, steel:.5 },
  };
  const TYPE_COLORS = {
    normal:"#9aa07c", fire:"#e8703a", water:"#5a8ee8", electric:"#e0b432", grass:"#69b558",
    ice:"#7ec6c6", fighting:"#b8482f", poison:"#9a4d9a", ground:"#cdb35a", flying:"#9aa0e0",
    psychic:"#e0608a", bug:"#a0a82e", rock:"#b09c50", ghost:"#6a5a9a", dragon:"#6a3ae0",
    dark:"#6a584a", steel:"#a8a8c0",
  };
  // physical types in Gen 3 (move-type split)
  const GEN3_PHYSICAL = new Set(["normal","fighting","flying","poison","ground","rock","bug","ghost","steel"]);

  const NATURES = {
    "Neutral": {}, "Adamant": { up: "atk", dn: "spa" }, "Modest": { up: "spa", dn: "atk" },
    "Jolly": { up: "spe", dn: "spa" }, "Timid": { up: "spe", dn: "atk" },
    "Brave": { up: "atk", dn: "spe" }, "Quiet": { up: "spa", dn: "spe" },
    "Impish": { up: "def", dn: "spa" }, "Bold": { up: "def", dn: "atk" },
    "Careful": { up: "spd", dn: "spa" }, "Calm": { up: "spd", dn: "atk" },
  };

  function effectiveness(moveType, defTypes) {
    let m = 1;
    for (const t of defTypes) {
      if (!t) continue;
      const row = CHART[moveType] || {};
      m *= row[t] !== undefined ? row[t] : 1;
    }
    return m;
  }

  function statFromBase(base, level, iv, ev, natureMult, isHP) {
    if (isHP) return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
    return Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5) * natureMult);
  }

  /* core damage roll */
  function damage({ level, power, atk, def, stab, eff, burn, screen, weather, crit, other }) {
    let base = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * power * atk / def) / 50);
    if (burn) base = Math.floor(base * 0.5);
    if (screen && !crit) base = Math.floor(base * 0.5);
    base = Math.floor(base * (weather || 1));
    base += 2;
    if (crit) base = Math.floor(base * 2);
    if (other) base = Math.floor(base * other);
    const rolls = [];
    for (let r = 85; r <= 100; r++) {
      let d = Math.floor(base * r / 100);
      d = Math.floor(d * (stab ? 1.5 : 1));
      d = Math.floor(d * eff);
      rolls.push(Math.max(eff > 0 ? 1 : 0, d));
    }
    return rolls;
  }

  function koChance(rolls, hp) {
    const oneShot = rolls.filter(d => d >= hp).length / rolls.length;
    if (oneShot > 0) return { n: 1, p: oneShot };
    // estimate n-hit KO using min/max
    for (let n = 2; n <= 6; n++) {
      if (rolls[rolls.length - 1] * n >= hp) {
        const minOK = rolls[0] * n >= hp;
        return { n, p: minOK ? 1 : 0.5 };
      }
    }
    return { n: 0, p: 0 };
  }

  /* ---------- PokéAPI client with IndexedDB cache ---------- */
  async function api(path) {
    const url = "https://pokeapi.co/api/v2/" + path;
    const hit = await DB.get("api", url).catch(() => null);
    if (hit) return hit.data;
    const r = await fetch(url);
    if (!r.ok) throw new Error("PokéAPI: " + r.status);
    const data = await r.json();
    DB.put("api", { url, data }).catch(() => {});
    return data;
  }

  async function speciesList() {
    const d = await api("pokemon?limit=1025");
    return d.results.map(x => x.name);
  }

  async function getPokemon(name) {
    const d = await api("pokemon/" + name.toLowerCase().trim().replace(/\s+/g, "-"));
    const stats = {};
    for (const s of d.stats) stats[{ hp: "hp", attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe" }[s.stat.name]] = s.base_stat;
    return {
      name: d.name, id: d.id, stats,
      types: d.types.map(t => t.type.name),
      sprite: d.sprites.front_default,
    };
  }

  async function getMove(name) {
    const d = await api("move/" + name.toLowerCase().trim().replace(/\s+/g, "-"));
    return {
      name: d.name, power: d.power, type: d.type.name,
      damageClass: d.damage_class.name, // physical | special | status
    };
  }

  return { TYPES, TYPE_COLORS, NATURES, GEN3_PHYSICAL, effectiveness, statFromBase, damage, koChance, speciesList, getPokemon, getMove };
})();
