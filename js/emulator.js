/* Emulator launcher — EmulatorJS (mGBA for GBA, melonDS for NDS).
   ROMs live in IndexedDB; saves & states in browser storage via EJS. */
const Emu = (() => {
  const CDN = "https://cdn.emulatorjs.org/stable/data/";
  let running = false;

  async function addRomFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["gba", "nds", "gb", "gbc"].includes(ext)) throw new Error("Only .gba / .nds / .gb / .gbc files are supported");
    const buf = await file.arrayBuffer();
    const det = detectGameFromRom(buf, ext);
    const id = "rom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const rec = {
      id, name: file.name.replace(/\.[^.]+$/, ""), ext,
      size: buf.byteLength, code: det.code, title: det.title,
      sys: det.sys, added: Date.now(), data: buf,
    };
    await DB.put("roms", rec);
    return rec;
  }

  async function addRomBuffer(buf, name, ext) {
    const det = detectGameFromRom(buf, ext);
    const id = "rom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const rec = { id, name, ext, size: buf.byteLength, code: det.code, title: det.title, sys: det.sys, added: Date.now(), data: buf };
    await DB.put("roms", rec);
    return rec;
  }

  function coreFor(ext) {
    return { gba: "gba", nds: "nds", gb: "gb", gbc: "gb" }[ext] || "gba";
  }

  /* Launch a ROM full-screen. Cheats = array of [name, code] (multi-line codes joined with \n). */
  function launch(rom, cheats) {
    if (running) { location.reload(); return; }
    running = true;

    const stage = document.getElementById("emu-stage");
    const title = document.getElementById("emu-title");
    stage.classList.add("on");
    title.textContent = rom.name;
    document.getElementById("game-holder").innerHTML = '<div id="game"></div>';

    const blob = new Blob([rom.data]);
    const url = URL.createObjectURL(blob);

    window.EJS_player = "#game";
    window.EJS_core = coreFor(rom.ext);
    window.EJS_gameUrl = url;
    window.EJS_gameName = rom.name;
    window.EJS_pathtodata = CDN;
    window.EJS_startOnLoaded = true;
    window.EJS_color = "#e3350d";
    window.EJS_backgroundColor = "#000000";
    window.EJS_volume = 0.6;
    window.EJS_cheats = (cheats || []).map(c => [c[0], c[1].split("\n").join("+")]);
    window.EJS_defaultOptions = {
      "save-state-location": "browser",
      "fastForward": "enabled",
      "ff-ratio": "3.0",
    };
    window.EJS_Buttons = {
      screenRecord: false,
      cacheManager: false,
    };
    window.EJS_ready = () => {
      // iOS fix: dynamically created canvases inherit touch-action:auto by default,
      // which causes Safari to swallow touchmove events before the emulator sees them.
      // Force touch-action:none on every canvas EmulatorJS creates.
      const fixTouch = el => {
        el.style.touchAction = "none";
        el.style.userSelect = "none";
        el.style.webkitUserSelect = "none";
      };
      const holder = document.getElementById("game-holder");
      holder.querySelectorAll("canvas").forEach(fixTouch);
      new MutationObserver(mutations => {
        for (const m of mutations) {
          m.addedNodes.forEach(n => {
            if (n.nodeName === "CANVAS") fixTouch(n);
            if (n.querySelectorAll) n.querySelectorAll("canvas").forEach(fixTouch);
          });
        }
      }).observe(holder, { childList: true, subtree: true });
    };

    const s = document.createElement("script");
    s.src = CDN + "loader.js";
    document.body.appendChild(s);
  }

  /* Fast-forward toggle — uses EJS internals with graceful fallback. */
  let ff = false;
  function toggleFF(btn) {
    const e = window.EJS_emulator;
    ff = !ff;
    let ok = false;
    try {
      if (e && e.gameManager && typeof e.gameManager.toggleFastForward === "function") {
        e.gameManager.toggleFastForward(ff ? 1 : 0); ok = true;
      }
    } catch (_) {}
    if (!ok) {
      try {
        if (e && typeof e.changeSettingOption === "function") {
          e.changeSettingOption("fastForward", ff ? "enabled" : "disabled"); ok = true;
        }
      } catch (_) {}
    }
    btn.classList.toggle("ff-on", ff);
    btn.textContent = ff ? "FF ⏩ ON" : "FF ⏩";
    if (!ok) toast("Use the ⚙ settings menu → Fast Forward if the button doesn't take effect");
  }

  function exit() { location.reload(); }

  return { addRomFile, addRomBuffer, launch, toggleFF, exit, get running() { return running; } };
})();
