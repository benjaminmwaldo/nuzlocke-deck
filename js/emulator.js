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
    // NDS: use the DeSmuME core, not melonDS. melonDS's WASM build does not wire
    // up touch-screen input in EmulatorJS (issue #394) and also requires BIOS
    // files; DeSmuME handles the touch screen natively and needs no BIOS.
    return { gba: "gba", nds: "desmume2015", gb: "gb", gbc: "gb" }[ext] || "gba";
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
      // DeSmuME: default pointer type is "mouse" (relative cursor) which ignores
      // taps. "touch" makes the stylus go to where you tap — required for mobile.
      "desmume_pointer_mouse": "enabled",
      "desmume_pointer_type": "touch",
    };
    window.EJS_Buttons = {
      screenRecord: false,
      cacheManager: false,
    };
    window.EJS_ready = () => {
      const holder = document.getElementById("game-holder");

      // Keep touch-action AUTO on every canvas EmulatorJS creates: "none" would
      // suppress the trusted compatibility mouse events iOS emits from a tap,
      // which is exactly what the libretro core reads for the DS stylus.
      const fixTouch = el => {
        el.style.touchAction = "auto";
        el.style.userSelect = "none";
        el.style.webkitUserSelect = "none";
        el.style.cursor = "pointer";          // help iOS treat it as clickable
        if (!el.onclick) el.onclick = () => {};
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
      if (["nds", "melonds", "desmume", "desmume2015"].includes(window.EJS_core)) {
        // Force the DeSmuME stylus into "touch" mode at runtime (the actual fix):
        // in the default "mouse" mode the core ignores taps entirely.
        const applyTouchMode = (tries) => {
          try {
            const gm = window.EJS_emulator && window.EJS_emulator.gameManager;
            if (gm && typeof gm.setVariable === "function") {
              gm.setVariable("desmume_pointer_mouse", "enabled");
              gm.setVariable("desmume_pointer_type", "touch");
              dbg("desmume stylus → touch mode set");
              return;
            }
          } catch (_) {}
          if (tries > 0) setTimeout(() => applyTouchMode(tries - 1), 300);
        };
        applyTouchMode(15);

        const setupNdsBridge = () => {
          const ejs = window.EJS_emulator;
          const ejsCanvas = (ejs && ejs.canvas) || holder.querySelector("canvas");
          if (!ejsCanvas) { setTimeout(setupNdsBridge, 150); return; }

          dbg("v2.4 (DeSmuME touch) ready — touch the bottom screen");

          let dragging = false;

          const desc = el => !el ? "null" :
            (el.tagName || "?") + (el.id ? "#" + el.id : "") +
            (typeof el.className === "string" && el.className.trim()
              ? "." + el.className.trim().split(/\s+/).join(".") : "");

          // The element the libretro core actually registered its input
          // listeners on is the Emscripten module canvas (Module.canvas).  Prefer
          // it; fall back to the EmulatorJS canvas reference.
          const targetCanvas = () => {
            const m = window.EJS_emulator && window.EJS_emulator.Module;
            return (m && m.canvas) || ejsCanvas;
          };

          const onControl = (target) =>
            target instanceof Element && !!target.closest(
              ".ejs_virtualGamepad_parent, .ejs_menu_bar, .ejs_context_menu, " +
              ".ejs_settings_parent, .ejs_popup_container, button");

          // Deliver a real touch event. Modern browsers (incl. iOS 16.4+) support
          // the TouchEvent constructor; older iOS Safari needs the legacy WebKit
          // document.createTouch / initTouchEvent path.
          const sendTouch = (phase, x, y, cv) => {
            const type = phase === "down" ? "touchstart" : phase === "move" ? "touchmove" : "touchend";
            try {
              const tt = new Touch({ identifier: 1, target: cv, clientX: x, clientY: y,
                pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
              const list = type === "touchend" ? [] : [tt];
              cv.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
                touches: list, targetTouches: list, changedTouches: [tt] }));
              return "new";
            } catch (_) {}
            try {
              if (document.createTouch && document.createTouchList) {
                const tt = document.createTouch(window, cv, 1, x, y, x, y, x, y);
                const list = document.createTouchList(tt);
                const te = document.createEvent("TouchEvent");
                te.initTouchEvent(type, true, true, window, 0, x, y, x, y,
                  false, false, false, false, list, list, list, 1, 0);
                cv.dispatchEvent(te);
                return "legacy";
              }
            } catch (_) {}
            return "unsupported";
          };

          // Pointer + mouse, as a fallback for cores that read those instead.
          const sendMousePointer = (phase, x, y, cv) => {
            const rect = cv.getBoundingClientRect();
            const mk = (Ctor, type, extra) => {
              const ev = new Ctor(type, Object.assign(
                { bubbles: true, cancelable: true, view: window,
                  clientX: x, clientY: y, screenX: x, screenY: y }, extra));
              const patch = { pageX: x, pageY: y, offsetX: x - rect.left, offsetY: y - rect.top,
                layerX: x - rect.left, layerY: y - rect.top };
              for (const k in patch) {
                try { Object.defineProperty(ev, k, { get: () => patch[k], configurable: true }); } catch (_) {}
              }
              cv.dispatchEvent(ev);
            };
            mk(PointerEvent, phase === "down" ? "pointerdown" : phase === "move" ? "pointermove" : "pointerup",
              { pointerId: 1, pointerType: "touch", isPrimary: true,
                button: phase === "move" ? -1 : 0, buttons: phase === "up" ? 0 : 1, pressure: phase === "up" ? 0 : 1 });
            mk(MouseEvent, phase === "down" ? "mousedown" : phase === "move" ? "mousemove" : "mouseup",
              { button: 0, buttons: phase === "up" ? 0 : 1 });
          };

          // DeSmuME handles the DS touch screen natively from the real DOM touch,
          // so we do NOT dispatch synthetic events (that would double-tap).  This
          // bridge now stays purely for the diagnostic HUD; sendTouch /
          // sendMousePointer remain above only as an unused emergency fallback.
          const forward = (phase, x, y) => {
            return { cv: targetCanvas(), tr: "native (desmume core)" };
          };

          const onStart = (e) => {
            if (onControl(e.target)) { dbg("CONTROL: " + desc(e.target)); return; }
            const t = e.changedTouches[0];
            if (!t) return;
            dragging = true;
            // NOTE: deliberately NOT calling preventDefault — that lets iOS emit
            // its own *trusted* compatibility mouse events on the (clickable)
            // canvas, which the core honors when synthetic events are ignored.
            const { cv, tr } = forward("down", t.clientX, t.clientY);
            const m = window.EJS_emulator && window.EJS_emulator.Module;
            dbg([
              "v2.4 down @ " + Math.round(t.clientX) + "," + Math.round(t.clientY),
              "target:   " + desc(e.target),
              "dispatch: " + desc(cv),
              "Module.canvas: " + (m ? (m.canvas === cv ? "(same)" : desc(m.canvas)) : "none"),
              "tgt==canvas: " + (e.target === cv),
              "touch: " + tr,
            ].join("\n"));
          };
          const onMove = (e) => {
            if (!dragging) return;
            const t = e.changedTouches[0];
            if (!t) return;
            forward("move", t.clientX, t.clientY);
          };
          const onEnd = (e) => {
            if (!dragging) return;
            dragging = false;
            const t = e.changedTouches[0];
            forward("up", t ? t.clientX : 0, t ? t.clientY : 0);
          };

          // Coax iOS into firing its (trusted) compatibility mouse events on the
          // canvas: iOS only does so for "clickable" elements and only when the
          // touch's default isn't prevented.  Make the canvas clickable…
          const cv0 = targetCanvas();
          [ejsCanvas, cv0].forEach(c => {
            if (c) { c.style.cursor = "pointer"; if (!c.onclick) c.onclick = () => {}; }
          });
          // …and report any *trusted* native mouse/pointer event that lands on the
          // canvas, so we can confirm whether iOS is delivering what the core wants.
          const nativeLog = (e) => {
            if (e.isTrusted) dbg("NATIVE " + e.type + " trusted @ " +
              Math.round(e.clientX) + "," + Math.round(e.clientY));
          };
          ["mousedown", "mouseup", "pointerdown", "click"].forEach(t =>
            (cv0 || ejsCanvas).addEventListener(t, nativeLog, true));

          // Passive listeners (no preventDefault) so iOS still emits its native
          // mouse events; we skip controls so on-screen buttons keep working.
          holder.addEventListener("touchstart", onStart, { passive: true });
          holder.addEventListener("touchmove",  onMove,  { passive: true });
          holder.addEventListener("touchend",   onEnd,   { passive: true });
          holder.addEventListener("touchcancel", onEnd,  { passive: true });
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
