/* Nuzlocke rules + hardcore level caps.
   Caps source: Nuzlocke University (nuzlockeuniversity.ca), retrieved June 2026.
   Each cap = the highest-levelled Pokémon of that boss. */

const LEVEL_CAPS = {
  "Red/Blue": { caps: [["Gym 1 (Brock)",14],["Gym 2 (Misty)",21],["Gym 3 (Lt. Surge)",24],["Gym 4 (Erika)",29],["Gym 5 (Koga)",43],["Gym 6 (Sabrina)",43],["Gym 7 (Blaine)",47],["Gym 8 (Giovanni)",50],["Elite Four 1",56],["Elite Four 2",58],["Elite Four 3",60],["Elite Four 4",62],["Champion",65]] },
  "Yellow": { caps: [["Gym 1",12],["Gym 2",21],["Gym 3",28],["Gym 4",32],["Gym 5",50],["Gym 6",50],["Gym 7",54],["Gym 8",55],["Elite Four 1",56],["Elite Four 2",58],["Elite Four 3",60],["Elite Four 4",62],["Champion",65]] },
  "Gold/Silver/Crystal": { note: "Gym 7 is lower than Gym 6 — that's correct.", caps: [["Gym 1 (Falkner)",9],["Gym 2 (Bugsy)",16],["Gym 3 (Whitney)",20],["Gym 4 (Morty)",25],["Gym 5 (Chuck)",30],["Gym 6 (Jasmine)",35],["Gym 7 (Pryce)",31],["Gym 8 (Clair)",40],["Elite Four 1",42],["Elite Four 2",44],["Elite Four 3",46],["Elite Four 4",47],["Champion (Lance)",50],["Kanto: Pewter",44],["Kanto: Cerulean",47],["Kanto: Vermillion",45],["Kanto: Celadon",46],["Kanto: Fuchsia",39],["Kanto: Saffron",48],["Kanto: Seafoam",50],["Kanto: Viridian",58],["Red",81]] },
  "Ruby/Sapphire": { caps: [["Gym 1 (Roxanne)",15],["Gym 2 (Brawly)",18],["Gym 3 (Wattson)",23],["Gym 4 (Flannery)",28],["Gym 5 (Norman)",31],["Gym 6 (Winona)",33],["Gym 7 (Tate & Liza)",42],["Gym 8 (Wallace)",43],["Elite Four 1",49],["Elite Four 2",51],["Elite Four 3",53],["Elite Four 4",55],["Champion (Steven)",58]] },
  "Emerald": { caps: [["Gym 1 (Roxanne)",15],["Gym 2 (Brawly)",19],["Gym 3 (Wattson)",24],["Gym 4 (Flannery)",29],["Gym 5 (Norman)",31],["Gym 6 (Winona)",33],["Gym 7 (Tate & Liza)",42],["Gym 8 (Juan)",46],["Elite Four 1",49],["Elite Four 2",51],["Elite Four 3",53],["Elite Four 4",55],["Champion (Wallace)",58],["Steven (Meteor Falls)",78]] },
  "FireRed/LeafGreen": { caps: [["Gym 1 (Brock)",14],["Gym 2 (Misty)",21],["Gym 3 (Lt. Surge)",24],["Gym 4 (Erika)",29],["Gym 5 (Koga)",43],["Gym 6 (Sabrina)",43],["Gym 7 (Blaine)",47],["Gym 8 (Giovanni)",50],["Elite Four 1",54],["Elite Four 2",56],["Elite Four 3",58],["Elite Four 4",60],["Champion",63]] },
  "Diamond/Pearl": { caps: [["Gym 1 (Roark)",14],["Gym 2 (Gardenia)",22],["Gym 3 (Maylene)",30],["Gym 4 (Crasher Wake)",30],["Gym 5 (Fantina)",36],["Gym 6 (Byron)",39],["Gym 7 (Candice)",42],["Gym 8 (Volkner)",49],["Elite Four 1",57],["Elite Four 2",59],["Elite Four 3",61],["Elite Four 4",63],["Champion (Cynthia)",66]] },
  "Platinum": { caps: [["Gym 1 (Roark)",14],["Gym 2 (Gardenia)",22],["Gym 3 (Fantina)",26],["Gym 4 (Maylene)",32],["Gym 5 (Crasher Wake)",37],["Gym 6 (Byron)",41],["Gym 7 (Candice)",44],["Gym 8 (Volkner)",50],["Elite Four 1",53],["Elite Four 2",55],["Elite Four 3",57],["Elite Four 4",59],["Champion (Cynthia)",62]] },
  "HeartGold/SoulSilver": { note: "Gym 7 is lower than Gym 6. Kanto gyms can be done in any order.", caps: [["Gym 1 (Falkner)",13],["Gym 2 (Bugsy)",17],["Gym 3 (Whitney)",19],["Gym 4 (Morty)",25],["Gym 5 (Chuck)",31],["Gym 6 (Jasmine)",35],["Gym 7 (Pryce)",34],["Gym 8 (Clair)",41],["Elite Four 1",42],["Elite Four 2",44],["Elite Four 3",46],["Elite Four 4",47],["Champion (Lance)",50],["Kanto: Pewter",54],["Kanto: Cerulean",54],["Kanto: Vermillion",53],["Kanto: Celadon",56],["Kanto: Fuchsia",50],["Kanto: Saffron",55],["Kanto: Seafoam",59],["Kanto: Viridian",60],["Red",88]] },
  "Black/White": { caps: [["Gym 1",14],["Gym 2 (Lenora)",20],["Gym 3 (Burgh)",23],["Gym 4 (Elesa)",27],["Gym 5 (Clay)",31],["Gym 6 (Skyla)",35],["Gym 7 (Brycen)",39],["Gym 8 (Drayden/Iris)",43],["Pokémon League",50],["N (Plasma Castle)",52],["Ghetsis",54],["E4 Rematch",73],["Champion (Alder)",77]] },
  "Black 2/White 2": { caps: [["Gym 1 (Cheren)",13],["Gym 2 (Roxie)",18],["Gym 3 (Burgh)",24],["Gym 4 (Elesa)",30],["Gym 5 (Clay)",33],["Gym 6 (Skyla)",39],["Gym 7 (Drayden)",48],["Gym 8 (Marlon)",51],["Pokémon League",58],["Champion (Iris)",59],["E4 Rematch",74],["Champion Rematch",78]] },
  "— ROM HACKS —": { divider: true, caps: [] },
  "Renegade Platinum": { caps: [["Gym 1",16],["Gym 2",26],["Gym 3",33],["Gym 4",39],["Gym 5",44],["Gym 6",53],["Gym 7",56],["Gym 8",62],["Elite Four 1",72],["Elite Four 2",73],["Elite Four 3",74],["Elite Four 4",75],["Champion",78]] },
  "Volt White/Blaze Black": { caps: [["Gym 1",14],["Gym 2",20],["Gym 3",30],["Gym 4",38],["Gym 5",44],["Gym 6",56],["Gym 7",63],["Gym 8",66],["Elite Four",73],["Ghetsis",77],["E4 Rematch",93],["Champion",100]] },
  "VW/BB 2 Redux (Normal)": { caps: [["Gym 1",13],["Gym 2",20],["Gym 3",27],["Gym 4",36],["Gym 5",43],["Gym 6",52],["Gym 7",60],["Gym 8",64],["Ghetsis",68],["Elite Four",74],["Champion",75]] },
  "VW/BB 2 Redux (Challenge)": { caps: [["Gym 1",14],["Gym 2",21],["Gym 3",29],["Gym 4",38],["Gym 5",45],["Gym 6",55],["Gym 7",64],["Gym 8",68],["Ghetsis",72],["Elite Four",78],["Champion",79]] },
  "Sacred Gold/Storm Silver": { caps: [["Gym 1",15],["Gym 2",21],["Gym 3",24],["Gym 4",29],["Gym 5",35],["Gym 6",40],["Gym 7",43],["Gym 8",50],["Elite Four",55],["Champion",60],["Kanto: Pewter",61],["Kanto: Cerulean",62],["Kanto: Vermillion",63],["Kanto: Fuchsia",64],["Kanto: Celadon",65],["Kanto: Saffron",66],["Kanto: Cinnabar",68],["Kanto: Viridian",70],["Red",94]] },
  "Rising Ruby/Sinking Sapphire": { caps: [["Gym 1",16],["Gym 2",19],["Gym 3",28],["Gym 4",38],["Gym 5",42],["Gym 6",50],["Gym 7",62],["Gym 8",67],["Elite Four 1",72],["Elite Four 2",73],["Elite Four 3",74],["Elite Four 4",75],["Champion",79]] },
  "Emerald Kaizo": { note: "Community treats Gyms 1–2 caps as 16/20 (one above the ace).", caps: [["Gym 1",16],["Gym 2",20],["Gym 3",29],["Gym 4",42],["Gym 5",48],["Gym 6",55],["Gym 7",70],["Gym 8",77],["Pokémon League",100]] },
};

const RULES_CONTENT = [
  { title: "The Core Rules", body: `
    <ul>
      <li><b>Fainting = death.</b> Any Pokémon that faints is considered dead and must be permanently boxed (the "graveyard") or released.</li>
      <li><b>First encounter only.</b> You may only catch the <i>first</i> wild Pokémon encountered in each area/route. If it faints or flees, you get nothing there.</li>
      <li><b>Nickname everything.</b> Every Pokémon must be nicknamed, to deepen the bond (and the pain).</li>
    </ul>
    <p>If your whole party wipes, the run is over — a "dead" save file. Gift Pokémon, fossils and static encounters usually count as the encounter for the area they're received/found in.</p>` },
  { title: "Hardcore Nuzlocke Rules", body: `
    <p>Hardcore adds three rules on top of the core set:</p>
    <ul>
      <li><b>Level caps.</b> No Pokémon may exceed the level of the next boss's strongest Pokémon (see Level Caps tab). If one over-levels, it's benched until the cap catches up — or counts as dead under stricter rules.</li>
      <li><b>Set battle mode.</b> No free switch after KOing an opponent's Pokémon.</li>
      <li><b>No items in battle.</b> No healing or X-items mid-battle (held items are allowed).</li>
    </ul>
    <p>Most hardcore players use the final E4 member's ace as the cap for the whole League run, since your team levels during the gauntlet.</p>` },
  { title: "Common Optional Clauses", body: `
    <ul>
      <li><b>Dupes clause.</b> If your first encounter is a species (or evo line) you already caught, you may keep encountering until something new shows up.</li>
      <li><b>Shiny clause.</b> Shinies may always be caught, regardless of the first-encounter rule.</li>
      <li><b>Species clause.</b> No two of the same evolutionary line on the team.</li>
      <li><b>Gift clause.</b> Gift/static Pokémon don't consume the area's encounter (or are banned entirely — pick one).</li>
      <li><b>No legendaries.</b> Legendary Pokémon may not be used in battle.</li>
      <li><b>Sleep/Status clause.</b> First-encounter catches only — some allow re-rolling if the encounter dies to status or crits.</li>
    </ul>` },
  { title: "The Rare Candy convention", body: `
    <p>Hardcore nuzlockers commonly use <b>infinite Rare Candies</b> to instantly level to the cap instead of grinding wild encounters. The logic: grinding is pure time, not skill — level caps already bound your power. Candy-leveling does mean missing EVs (Gens 1–5), which actually makes your Pokémon slightly <i>weaker</i> than naturally trained ones, so it's considered fair or even harder.</p>
    <p>That's what the Cheats button in this app's emulator is for: every supported game has a verified Rare Candy code ready to toggle. Turn it off after withdrawing your candies.</p>` },
  { title: "Hardcore strategy fundamentals", body: `
    <ul>
      <li><b>Calc every boss.</b> Use the Damage Calc tab before gyms/rivals. Know what survives what, and what your kill ranges are.</li>
      <li><b>Scout with docs.</b> Import boss teams, encounter tables and friendly-rival movesets into the Docs tab so they're offline at hand.</li>
      <li><b>Sacrifices are a tool.</b> A planned sack to get a safe setup or revenge-kill is often correct — better one death than three.</li>
      <li><b>Status is king.</b> Sleep, paralysis and Will-O-Wisp swing fights harder than raw damage in cap-limited play.</li>
      <li><b>Track everything.</b> Encounters, deaths, and who walls what — the Tracker tab keeps the run honest.</li>
    </ul>` },
];
