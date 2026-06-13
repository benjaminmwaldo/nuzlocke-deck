/* Emulator launcher — EmulatorJS (mGBA for GBA, melonDS for NDS).
   ROMs live in IndexedDB; saves & states in browser storage via EJS. */
const Emu = (() => {
  const CDN = "https://cdn.emulatorjs.org/stable/data/";
  let running = false;

  /* Optional touch diagnostic HUD (off by default; toggled by the 🐞 button).
     Lets us see, on the device, whether touches are reaching the bridge. */
  function dbg(msg) {
    if (localStorage.getItem("ndsTouchDebug") !== "1") return;
    let hud = document.getElementById("nds-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "nds-hud";
      hud.style.cssText = "position:fixed;left:6px;top:54px;z-index:99999;" +
        "background:rgba(0,0,0,.78);color:#5dff8f;font:11px ui-monospace,monospace;" +
        "padding:5px 8px;border-radius:7px;pointer-events:none;white-space:pre;max-width:70vw";
      (document.getElementById("emu-stage") || document.body).appendChild(hud);
    }
    hud.textContent = "NDS touch: " + msg;
  }
  function toggleDebug(btn) {
    const on = localStorage.getItem("ndsTouchDebug") === "1";
    localStorage.setItem("ndsTouchDebug", on ? "0" : "1");
    if (btn) btn.classList.toggle("ff-on", !on);
    const hud = document.getElementById("nds-hud");
    if (on && hud) hud.remove();
    else dbg("enabled — touch the bottom screen");
  }

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
      const holder = document.getElementById("game-holder");

      // iOS fix: force touch-action:none on every canvas EmulatorJS creates so
      // Safari doesn't swallow touchmove events for scrolling.
      const fixTouch = el => {
        el.style.touchAction = "none";
        el.style.userSelect = "none";
        el.style.webkitUserSelect = "none";
      };
      holder.querySelectorAll("canvas").forEach(fixTouch);
      new MutationObserver(mutations => {
        for (const m of mutations) {
          m.addedNodes.forEach(n => {
            if (n.nodeName === "CANVAS") fixTouch(n);
            if (n.querySelectorAll) n.querySelectorAll("canvas").forEach(fixTouch);
          });
        }
      }).observe(holder, { childList: true, subtree: true });

      // NDS touchscreen bridge for iOS.
      //
      // EmulatorJS leaves NDS touch input to the libretro core's own canvas
      // listeners.  On a desktop, a real mouse drives those listeners (and a real
      // mouse also makes the browser emit PointerEvents).  On iOS there is no
      // mouse, and a touch on the canvas doesn't reliably reach the core.  Earlier
      // attempts failed for two reasons: (1) a capture-phase listener that called
      // stopPropagation() on the lower half of the screen also swallowed the
      // on-screen D-pad / A-B buttons that live there; (2) it dispatched Touch /
      // Mouse events, but the `new Touch()` constructor throws on iOS Safari and a
      // synthetic MouseEvent never produces a PointerEvent — so a core listening
      // for pointer events saw nothing.
      //
      // This version listens in the BUBBLE phase (so the virtual gamepad always
      // gets its events first) and simply ignores any touch that landed on a
      // control or menu element.  For touches on the game screen it forwards real
      // PointerEvents (matching what a desktop mouse produces) plus MouseEvents as
      // a fallback, aimed at the actual emulator canvas.
      if (window.EJS_core === "nds") {
        const setupNdsBridge = () => {
          const ejs = window.EJS_emulator;
          const canvas = (ejs && ejs.canvas) || holder.querySelector("canvas");
          if (!canvas) { setTimeout(setupNdsBridge, 150); return; }

          dbg(canvas ? "canvas ✓ ready — touch the bottom screen" : "no canvas!");

          let dragging = false;

          // True when the touch began on a virtual-gamepad control or a menu —
          // in that case we leave the event completely alone.
          const onControl = (target) =>
            target instanceof Element && !!target.closest(
              ".ejs_virtualGamepad_parent, .ejs_menu_bar, .ejs_context_menu, " +
              ".ejs_settings_parent, .ejs_popup_container, button");

          const forward = (kinds, clientX, clientY) => {
            for (const type of kinds) {
              let ev;
              if (type[0] === "p") {
                ev = new PointerEvent(type, {
                  bubbles: true, cancelable: true, view: window,
                  clientX, clientY, screenX: clientX, screenY: clientY,
                  pointerId: 1, pointerType: "mouse", isPrimary: true,
                  button: type === "pointermove" ? -1 : 0,
                  buttons: type === "pointerup" ? 0 : 1,
                });
              } else {
                ev = new MouseEvent(type, {
                  bubbles: true, cancelable: true, view: window,
                  clientX, clientY, screenX: clientX, screenY: clientY,
                  button: 0, buttons: type === "mouseup" ? 0 : 1,
                });
              }
              canvas.dispatchEvent(ev);
            }
          };

          const onStart = (e) => {
            if (onControl(e.target)) { dbg("start → control (" + (e.target.className || e.target.tagName) + ")"); return; }
            const t = e.changedTouches[0];
            if (!t) return;
            dragging = true;
            e.preventDefault();                        // stop iOS scroll / synthetic clicks
            forward(["pointerdown", "mousedown"], t.clientX, t.clientY);
            dbg("down → canvas @ " + Math.round(t.clientX) + "," + Math.round(t.clientY));
          };
          const onMove = (e) => {
            if (!dragging) return;
            const t = e.changedTouches[0];
            if (!t) return;
            e.preventDefault();
            forward(["pointermove", "mousemove"], t.clientX, t.clientY);
            dbg("move → canvas @ " + Math.round(t.clientX) + "," + Math.round(t.clientY));
          };
          const onEnd = (e) => {
            if (!dragging) return;
            dragging = false;
            const t = e.changedTouches[0];
            const x = t ? t.clientX : 0, y = t ? t.clientY : 0;
            forward(["pointerup", "mouseup"], x, y);
          };

          // Bubble phase, no stopPropagation → on-screen buttons keep working.
          holder.addEventListener("touchstart", onStart, { passive: false });
          holder.addEventListener("touchmove",  onMove,  { passive: false });
          holder.addEventListener("touchend",   onEnd,   { passive: false });
          holder.addEventListener("touchcancel", onEnd,  { passive: false });
        };
        requestAnimationFrame(setupNdsBridge);
      }
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

  return { addRomFile, addRomBuffer, launch, toggleFF, toggleDebug, exit, get running() { return running; } };
})();
