/* App controller — navigation, ROM library, patcher UI, tracker, calc, rules, docs */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("on"), ms);
}

/* ---------------- navigation ---------------- */
function go(page) {
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  $$("nav.tabbar button").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  if (page === "play") renderRoms();
  if (page === "tracker") Tracker.render();
  if (page === "rules") renderRules();
  if (page === "docs") Docs.render();
}

/* ---------------- modal ---------------- */
function openModal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal-wrap").classList.add("on");
}
function closeModal() { $("#modal-wrap").classList.remove("on"); }

/* ================= PLAY: ROM library ================= */
async function renderRoms() {
  const roms = (await DB.all("roms")) || [];
  const list = $("#rom-list");
  if (!roms.length) {
    list.innerHTML = `<div class="empty">No games yet.<br>Add a .gba or .nds ROM you legally own.</div>`;
    return;
  }
  roms.sort((a, b) => b.added - a.added);
  list.innerHTML = roms.map(r => {
    const known = cheatsForCode(r.code);
    return `<div class="rom-item">
      <div class="sys ${r.sys === "nds" ? "nds" : "gba"}">${r.ext.toUpperCase()}</div>
      <div class="meta">
        <div class="name">${esc(r.name)}</div>
        <div class="det">${(r.size / 1048576).toFixed(1)} MB · ${esc(r.title || r.code || "unknown header")}
        ${known ? '<span class="badge gold">Rare Candy ready</span>' : ""}</div>
      </div>
      <div class="actions">
        <button class="btn small gold" onclick="playRom('${r.id}')">Play</button>
        <button class="btn small secondary" onclick="romMenu('${r.id}')">⋯</button>
      </div>
    </div>`;
  }).join("");
}

async function addRom(input) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  try {
    const rec = await Emu.addRomFile(f);
    toast(`Added ${rec.name}` + (cheatsForCode(rec.code) ? " — Rare Candy cheats available ✓" : ""));
    renderRoms();
  } catch (e) { toast(e.message); }
}

async function playRom(id) {
  const rom = await DB.get("roms", id);
  if (!rom) return;
  const known = cheatsForCode(rom.code);
  if (!known) { Emu.launch(rom, []); return; }
  // cheat picker before launch
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h3>${esc(known.game)}</h3>
    ${known.regionNote ? `<p class="hint">⚠ ${esc(known.regionNote)}</p>` : ""}
    <p class="hint">Pick cheats to pre-load into the in-game cheat manager (🎮 menu → Cheats). Toggle them there, and <b>disable after withdrawing your candies</b>.</p>
    ${known.cheats.map((c, i) => `
      <div class="cheat-row">
        <input type="checkbox" id="ck${i}" ${i === 0 ? "checked" : ""} style="margin-top:4px">
        <div class="info">
          <div class="n">${esc(c.name)}</div>
          <div class="how">${esc(c.how)}</div>
          <div class="c">${esc(c.code)}</div>
        </div>
      </div>`).join("")}
    <button class="btn gold full" style="margin-top:10px" onclick="launchWithCheats('${id}')">▶ Start Game</button>
    <button class="btn secondary full" style="margin-top:8px" onclick="closeModal();DB.get('roms','${id}').then(r=>Emu.launch(r,[]))">Start without cheats</button>
  `);
  window._pendingCheats = known.cheats;
}

async function launchWithCheats(id) {
  const rom = await DB.get("roms", id);
  const sel = [];
  (window._pendingCheats || []).forEach((c, i) => {
    if ($("#ck" + i)?.checked) sel.push([c.name, c.code]);
  });
  closeModal();
  Emu.launch(rom, sel);
}

async function romMenu(id) {
  const rom = await DB.get("roms", id);
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h3>${esc(rom.name)}</h3>
    <p class="hint mono">Header: ${esc(rom.title || "?")} · Code: ${esc(rom.code || "?")} · ${(rom.size / 1048576).toFixed(2)} MB</p>
    <button class="btn secondary full" style="margin-top:10px" onclick="exportRom('${id}')">⬇ Export ROM file</button>
    <button class="btn secondary full" style="margin-top:8px;color:var(--bad)" onclick="deleteRom('${id}')">🗑 Delete from library</button>
  `);
}
async function exportRom(id) {
  const rom = await DB.get("roms", id);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rom.data]));
  a.download = rom.name + "." + rom.ext;
  a.click();
}
async function deleteRom(id) {
  await DB.del("roms", id);
  closeModal(); renderRoms(); toast("Deleted");
}

/* ================= PATCH ================= */
const Patch = { rom: null, patch: null };
function patchPick(kind, input) {
  const f = input.files[0];
  if (!f) return;
  f.arrayBuffer().then(buf => {
    Patch[kind] = { name: f.name, buf };
    $(kind === "rom" ? "#p-rom-name" : "#p-patch-name").textContent = f.name;
    $("#btn-apply-patch").disabled = !(Patch.rom && Patch.patch);
  });
  input.value = "";
}
async function applyPatch() {
  try {
    const r = await Patcher.apply(Patch.rom.buf, Patch.patch.buf, Patch.patch.name);
    const warn = r.warnings || [];
    const outName = Patch.patch.name.replace(/\.(ips|ups|bps)$/i, "");
    const baseExt = (Patch.rom.name.split(".").pop() || "gba").toLowerCase();
    const rec = await Emu.addRomBuffer(r.buffer, outName, baseExt);
    toast("Patched ✓ — added to your library" + (warn.length ? " (with warnings)" : ""));
    if (warn.length) openModal(`<button class="x" onclick="closeModal()">✕</button><h3>Patched with warnings</h3>${warn.map(w => `<p class="hint">⚠ ${esc(w)}</p>`).join("")}<p class="hint">The hack may still work — many hacks expect a specific base ROM revision.</p><button class="btn gold full" onclick="closeModal();go('play')">Go to library</button>`);
    else go("play");
  } catch (e) { toast("Patch failed: " + e.message, 4000); }
}

/* ================= TRACKER ================= */
const Tracker = {
  state: JSON.parse(localStorage.getItem("nz_run") || "null") || { game: "FireRed/LeafGreen", capIndex: 0, encounters: [] },
  save() { localStorage.setItem("nz_run", JSON.stringify(this.state)); },

  render() {
    const s = this.state;
    // game select
    const sel = $("#run-game");
    if (!sel.options.length) {
      for (const g of Object.keys(LEVEL_CAPS)) {
        if (LEVEL_CAPS[g].divider) continue;
        const o = document.createElement("option"); o.value = g; o.textContent = g; sel.appendChild(o);
      }
    }
    sel.value = s.game;
    // cap banner
    const caps = LEVEL_CAPS[s.game].caps;
    const idx = Math.min(s.capIndex, caps.length - 1);
    const [what, lvl] = caps[idx] || ["—", "—"];
    $("#cap-what").textContent = "Next: " + what;
    $("#cap-lvl").textContent = "Lv " + lvl;
    $("#cap-prev").disabled = idx <= 0;
    $("#cap-next").disabled = idx >= caps.length - 1;
    // encounter lists
    const groups = { team: [], boxed: [], dead: [], missed: [] };
    s.encounters.forEach((e, i) => groups[e.status]?.push([e, i]));
    const draw = (arr, mountId, grave) => {
      const el = $(mountId);
      if (!arr.length) { el.innerHTML = '<div class="empty">Nothing here</div>'; return; }
      el.innerHTML = arr.map(([e, i]) => `
        <div class="enc-row ${grave ? "grave" : ""}">
          <img src="${spriteUrl(e.species)}" onerror="this.style.visibility='hidden'" alt="">
          <div><div class="nm">${esc(e.nick || e.species)}</div>
          <div class="loc">${esc(e.species)} · ${esc(e.location)}${e.note ? " · " + esc(e.note) : ""}</div></div>
          <button class="status-pill st-${e.status}" onclick="Tracker.cycle(${i})">${e.status.toUpperCase()}</button>
        </div>`).join("");
    };
    draw(groups.team, "#enc-team");
    draw(groups.boxed, "#enc-boxed");
    draw(groups.dead, "#enc-dead", true);
    draw(groups.missed, "#enc-missed");
    $("#team-count").textContent = groups.team.length;
    $("#dead-count").textContent = groups.dead.length;
    // dupes helper
    const caught = new Set(s.encounters.filter(e => e.status !== "missed").map(e => e.species.toLowerCase()));
    $("#dupes-list").textContent = caught.size ? [...caught].join(", ") : "none yet";
  },

  setGame(g) { this.state.game = g; this.state.capIndex = 0; this.save(); this.render(); },
  capMove(d) { this.state.capIndex = Math.max(0, this.state.capIndex + d); this.save(); this.render(); },

  add() {
    const loc = $("#enc-loc").value.trim(), sp = $("#enc-species").value.trim(), nick = $("#enc-nick").value.trim();
    if (!loc || !sp) { toast("Location and species required"); return; }
    if (this.state.encounters.some(e => e.location.toLowerCase() === loc.toLowerCase() && e.status !== "missed")) {
      toast("⚠ You already used the encounter for " + loc + " (first-encounter rule)", 3500);
    }
    this.state.encounters.unshift({ location: loc, species: sp, nick, status: "team", note: "" });
    $("#enc-loc").value = $("#enc-species").value = $("#enc-nick").value = "";
    this.save(); this.render();
  },

  cycle(i) {
    const order = ["team", "boxed", "dead", "missed"];
    const e = this.state.encounters[i];
    e.status = order[(order.indexOf(e.status) + 1) % order.length];
    if (e.status === "team" && this.state.encounters.filter(x => x.status === "team").length > 6) {
      e.status = "boxed"; toast("Team is full (6) — sent to box");
    }
    this.save(); this.render();
  },

  reset() {
    if (!confirm("Start a new run? Current run data will be wiped.")) return;
    this.state.encounters = []; this.state.capIndex = 0;
    this.save(); this.render(); toast("New run started — good luck o7");
  },
};
function spriteUrl(species) {
  const slug = species.toLowerCase().trim().replace(/\s+/g, "-").replace(/[.']/g, "");
  return "https://img.pokemondb.net/sprites/black-white/normal/" + slug + ".png";
}

/* ================= RULES ================= */
let rulesDone = false;
function renderRules() {
  if (rulesDone) return; rulesDone = true;
  $("#rules-mount").innerHTML = RULES_CONTENT.map(r => `
    <details class="rulebox"><summary>${esc(r.title)}</summary><div class="body">${r.body}</div></details>`).join("");
  $("#caps-mount").innerHTML = Object.entries(LEVEL_CAPS).map(([g, v]) => v.divider
    ? `<h2 class="section">ROM Hacks</h2>`
    : `<details class="rulebox"><summary>${esc(g)}</summary><div class="body">
        ${v.note ? `<p class="hint">${esc(v.note)}</p>` : ""}
        <table class="caps">${v.caps.map(([w, l]) => `<tr><td>${esc(w)}</td><td>${l}</td></tr>`).join("")}</table>
      </div></details>`).join("");
}

/* ================= DOCS ================= */
const Docs = {
  async render() {
    const docs = (await DB.all("docs")) || [];
    const el = $("#docs-list");
    if (!docs.length) { el.innerHTML = '<div class="empty">No documents yet.<br>Import encounter tables, boss guides, team plans…</div>'; return; }
    docs.sort((a, b) => b.added - a.added);
    el.innerHTML = docs.map(d => `
      <div class="doc-item" onclick="Docs.open('${d.id}')">
        <div class="ic">${d.kind === "note" ? "📝" : d.type?.includes("pdf") ? "📕" : "📄"}</div>
        <div class="nm">${esc(d.name)}</div>
        <div class="sz">${d.kind === "note" ? "note" : (d.size / 1024).toFixed(0) + " KB"}</div>
      </div>`).join("");
  },

  async importFile(input) {
    const f = input.files[0]; input.value = "";
    if (!f) return;
    const id = "doc_" + Date.now();
    const isText = /\.(txt|md|csv|json)$/i.test(f.name) || f.type.startsWith("text/");
    const rec = { id, name: f.name, type: f.type, size: f.size, added: Date.now(), kind: "file" };
    if (isText) rec.text = await f.text(); else rec.data = await f.arrayBuffer();
    await DB.put("docs", rec);
    this.render(); toast("Imported " + f.name);
  },

  newNote() {
    openModal(`
      <button class="x" onclick="closeModal()">✕</button>
      <h3>New note</h3>
      <label class="f">Title</label><input type="text" id="note-title" placeholder="e.g. Whitney plan">
      <label class="f">Content</label><textarea id="note-body" rows="10" placeholder="Markdown or plain text…"></textarea>
      <button class="btn gold full" style="margin-top:12px" onclick="Docs.saveNote()">Save</button>`);
  },
  async saveNote(id) {
    const rec = {
      id: id || "doc_" + Date.now(),
      name: $("#note-title").value.trim() || "Untitled note",
      kind: "note", added: Date.now(), text: $("#note-body").value, size: 0,
    };
    await DB.put("docs", rec);
    closeModal(); this.render(); toast("Saved");
  },

  async open(id) {
    const d = await DB.get("docs", id);
    if (!d) return;
    if (d.kind === "note") {
      openModal(`
        <button class="x" onclick="closeModal()">✕</button>
        <h3>Edit note</h3>
        <label class="f">Title</label><input type="text" id="note-title" value="${esc(d.name)}">
        <label class="f">Content</label><textarea id="note-body" rows="12">${esc(d.text)}</textarea>
        <div class="row" style="margin-top:12px">
          <button class="btn gold" onclick="Docs.saveNote('${d.id}')">Save</button>
          <button class="btn secondary" style="color:var(--bad)" onclick="Docs.del('${d.id}')">Delete</button>
        </div>`);
    } else if (d.text !== undefined) {
      openModal(`
        <button class="x" onclick="closeModal()">✕</button>
        <h3>${esc(d.name)}</h3>
        <pre style="white-space:pre-wrap;font-size:13px;line-height:1.6;color:#c9d2e6">${esc(d.text)}</pre>
        <button class="btn secondary full" style="color:var(--bad)" onclick="Docs.del('${d.id}')">Delete</button>`);
    } else {
      const blob = new Blob([d.data], { type: d.type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      openModal(`
        <button class="x" onclick="closeModal()">✕</button>
        <h3>${esc(d.name)}</h3>
        <p class="hint">Binary document (${(d.size / 1024).toFixed(0)} KB).</p>
        <a class="btn gold full" style="margin-top:10px;text-decoration:none" href="${url}" target="_blank">Open / Download</a>
        <button class="btn secondary full" style="margin-top:8px;color:var(--bad)" onclick="Docs.del('${d.id}')">Delete</button>`);
    }
  },
  async del(id) { await DB.del("docs", id); closeModal(); this.render(); toast("Deleted"); },
};

/* ================= DAMAGE CALC ================= */
const CalcUI = {
  atk: null, def: null, move: null,

  async loadMon(side) {
    const name = $(`#${side}-name`).value;
    if (!name) return;
    try {
      const mon = await Calc.getPokemon(name);
      this[side] = mon;
      $(`#${side}-sprite`).src = mon.sprite || "";
      $(`#${side}-types`).innerHTML = mon.types.map(t => `<span class="typechip" style="background:${Calc.TYPE_COLORS[t] || "#666"}">${t}</span>`).join("");
      for (const k of ["hp", "atk", "def", "spa", "spd", "spe"]) {
        const el = $(`#${side}-b-${k}`); if (el) el.value = mon.stats[k];
      }
      toast(`${mon.name} loaded ✓`);
      this.run();
    } catch (e) { toast("Not found — check spelling (PokéAPI name, e.g. 'nidoran-f')", 3500); }
  },

  async loadMove() {
    const name = $("#mv-name").value;
    if (!name) return;
    try {
      const mv = await Calc.getMove(name);
      this.move = mv;
      $("#mv-power").value = mv.power || 0;
      $("#mv-type").value = mv.type;
      $("#mv-class").value = mv.damageClass === "special" ? "special" : "physical";
      toast(`${mv.name}: ${mv.power || "—"} BP ${mv.type} (${mv.damageClass})`);
      this.run();
    } catch (e) { toast("Move not found (e.g. 'ice-beam')", 3000); }
  },

  monStats(side) {
    const lvl = +($(`#${side}-lvl`).value || 50);
    const nat = Calc.NATURES[$(`#${side}-nature`)?.value || "Neutral"] || {};
    const iv = +($(`#${side}-iv`).value ?? 31), ev = +($(`#${side}-ev`).value ?? 0);
    const out = { level: lvl, types: this[side]?.types || [] , stats: {} };
    // override types from inputs if user typed
    const t1 = $(`#${side}-t1`)?.value, t2 = $(`#${side}-t2`)?.value;
    if (t1) out.types = [t1, t2 || null];
    for (const k of ["hp", "atk", "def", "spa", "spd", "spe"]) {
      const base = +($(`#${side}-b-${k}`)?.value || 0);
      const mult = nat.up === k ? 1.1 : nat.dn === k ? 0.9 : 1;
      out.stats[k] = Calc.statFromBase(base, lvl, iv, ev, mult, k === "hp");
    }
    return out;
  },

  run() {
    const power = +$("#mv-power").value;
    const mtype = $("#mv-type").value;
    if (!power || !mtype) { return; }
    const gen = $("#calc-gen").value;
    let cls = $("#mv-class").value;
    if (gen === "3") cls = Calc.GEN3_PHYSICAL.has(mtype) ? "physical" : "special";

    const A = this.monStats("atk"), D = this.monStats("def");
    const atkStat = cls === "physical" ? A.stats.atk : A.stats.spa;
    const defStat = cls === "physical" ? D.stats.def : D.stats.spd;
    const stab = A.types.filter(Boolean).includes(mtype);
    const eff = Calc.effectiveness(mtype, D.types.filter(Boolean));
    const burn = $("#md-burn").checked && cls === "physical";
    const screen = $("#md-screen").checked;
    const crit = $("#md-crit").checked;
    let weather = 1;
    const w = $("#md-weather").value;
    if (w === "sun") weather = mtype === "fire" ? 1.5 : mtype === "water" ? 0.5 : 1;
    if (w === "rain") weather = mtype === "water" ? 1.5 : mtype === "fire" ? 0.5 : 1;

    const rolls = Calc.damage({ level: A.level, power, atk: atkStat, def: defStat, stab, eff, burn, screen, weather, crit });
    const hp = D.stats.hp || 1;
    const lo = rolls[0], hi = rolls[rolls.length - 1];
    const loP = (lo / hp * 100), hiP = (hi / hp * 100);
    const ko = Calc.koChance(rolls, hp);

    let koTxt, koColor;
    if (eff === 0) { koTxt = "Immune — no damage"; koColor = "var(--muted)"; }
    else if (ko.n === 1) { koTxt = ko.p >= 1 ? "Guaranteed OHKO" : `${Math.round(ko.p * 100)}% chance to OHKO`; koColor = "var(--good)"; }
    else if (ko.n) { koTxt = `${ko.p >= 1 ? "Guaranteed" : "Possible"} ${ko.n}HKO`; koColor = ko.n <= 2 ? "var(--accent2)" : "var(--info)"; }
    else { koTxt = "Needs 7+ hits"; koColor = "var(--muted)"; }

    const effTxt = eff === 1 ? "neutral" : eff === 0 ? "immune ×0" : "×" + eff + (eff > 1 ? " super effective" : " not very effective");
    $("#dmg-out").innerHTML = `
      <div class="big">${lo} – ${hi}</div>
      <div class="pct">${loP.toFixed(1)}% – ${hiP.toFixed(1)}% of ${hp} HP</div>
      <div class="ko" style="color:${koColor}">${koTxt}</div>
      <div class="eff">${stab ? "STAB · " : ""}${effTxt} · ${cls}${burn ? " · burned" : ""}${crit ? " · crit" : ""}</div>
      <div class="hpbar"><div class="fill" style="width:100%"></div>
        <div class="dmg" style="right:0;width:${Math.min(100, hiP).toFixed(1)}%"></div></div>`;
  },
};

/* ================= boot ================= */
window.addEventListener("DOMContentLoaded", () => {
  go("play");
  // tracker game select
  $("#run-game").addEventListener("change", e => Tracker.setGame(e.target.value));
  // populate type selects
  for (const sel of ["#mv-type", "#atk-t1", "#atk-t2", "#def-t1", "#def-t2"]) {
    const el = $(sel); if (!el) continue;
    el.innerHTML = (sel.endsWith("-t2") || sel.endsWith("-t1") ? '<option value="">—</option>' : "") +
      Calc.TYPES.map(t => `<option>${t}</option>`).join("");
  }
  for (const side of ["atk", "def"]) {
    const el = $(`#${side}-nature`);
    el.innerHTML = Object.keys(Calc.NATURES).map(n => `<option>${n}</option>`).join("");
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
});
