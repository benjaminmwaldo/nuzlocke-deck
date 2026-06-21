/* AIPlay — Claude actually plays the game.
   Captures the emulator frame, sends it to the Anthropic API (vision) with the
   Nuzlocke context, gets back a structured decision, and drives the emulator
   through gameManager.simulateInput.  A live "thinking box" streams Claude's
   reasoning while it plays.

   How it works (no server, runs on-device):
     screenshot()  → gameManager.screenshot() returns a PNG of the current frame
     think()       → POST https://api.anthropic.com/v1/messages with the frame +
                     a forced tool call (play_action) so the reply is structured
     act()         → gameManager.simulateInput(0, retropadIndex, 1|0) presses
   The user's API key lives only in localStorage on this device and is sent
   straight to Anthropic (anthropic-dangerous-direct-browser-access).            */

const AIPlay = (() => {
  /* ---- libretro RetroPad button indices (what simulateInput expects) ---- */
  const BTN = {
    A: 8, B: 0, X: 9, Y: 1, L: 10, R: 11,
    START: 3, SELECT: 2,
    UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
  };
  const ACTIONS = [...Object.keys(BTN), "WAIT"];

  const LS = {
    key:   "ai_key",
    model: "ai_model",
    interval: "ai_interval",
    hold:  "ai_hold",
  };

  const cfg = {
    get key()      { return localStorage.getItem(LS.key) || ""; },
    set key(v)     { localStorage.setItem(LS.key, v || ""); },
    get model()    { return localStorage.getItem(LS.model) || "claude-sonnet-4-6"; },
    set model(v)   { localStorage.setItem(LS.model, v); },
    get interval() { return +(localStorage.getItem(LS.interval) || 2200); },
    set interval(v){ localStorage.setItem(LS.interval, v); },
    get hold()     { return +(localStorage.getItem(LS.hold) || 140); },
    set hold(v)    { localStorage.setItem(LS.hold, v); },
  };

  let running = false;     // loop active
  let paused = false;      // temporarily halted
  let busy = false;        // a turn is in flight
  let turn = 0;
  let notes = "";          // Claude's own running scratchpad, fed back each turn
  let lastObs = "";
  let stopReq = false;
  const logLines = [];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const EJS = () => window.EJS_emulator;
  const gm  = () => { const e = EJS(); return e && e.gameManager; };

  /* ---------- frame capture ---------- */
  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  async function grab() {
    const g = gm();
    if (!g || typeof g.screenshot !== "function") throw new Error("Emulator not ready");
    const png = await g.screenshot();           // Uint8Array (PNG)
    return bytesToB64(png instanceof Uint8Array ? png : new Uint8Array(png));
  }

  /* ---------- input ---------- */
  async function pressOne(name, holdMs) {
    if (name === "WAIT") { await sleep(holdMs * 3); return; }
    const idx = BTN[name];
    if (idx == null) return;
    const g = gm();
    if (!g) return;
    g.simulateInput(0, idx, 1);
    await sleep(holdMs);
    g.simulateInput(0, idx, 0);
    await sleep(Math.max(70, holdMs * 0.5));
  }
  async function runActions(buttons, holdMs) {
    const seq = (buttons || []).slice(0, 8);
    for (const b of seq) {
      if (stopReq || paused) break;
      const name = String(b || "").toUpperCase().trim();
      if (ACTIONS.includes(name)) {
        Box.setAction(name);
        await pressOne(name, holdMs);
      }
    }
  }

  /* ---------- Nuzlocke context ---------- */
  function gameContext() {
    let game = "a Pokémon game", capLine = "";
    try {
      const s = (typeof Tracker !== "undefined") && Tracker.state;
      if (s && s.game) {
        game = s.game;
        const caps = (typeof LEVEL_CAPS !== "undefined" && LEVEL_CAPS[s.game] && LEVEL_CAPS[s.game].caps) || [];
        const idx = Math.min(s.capIndex || 0, caps.length - 1);
        const cur = caps[idx];
        if (cur) capLine = `Current level cap: no Pokémon above Lv ${cur[1]} until you beat ${cur[0]}.`;
      }
    } catch (_) {}
    const rom = window._currentRom;
    if (game === "a Pokémon game" && rom && rom.name) game = rom.name;
    return { game, capLine };
  }

  const PLAY_TOOL = {
    name: "play_action",
    description: "Report what is on the Pokémon game screen and choose the next button input(s) to perform.",
    input_schema: {
      type: "object",
      properties: {
        observation: { type: "string", description: "Concisely describe exactly what is on screen now (location, menu, battle state, dialogue text, HP, etc.)." },
        reasoning:   { type: "string", description: "Briefly explain your plan and why these buttons." },
        buttons: {
          type: "array",
          items: { type: "string", enum: ACTIONS },
          description: "Ordered list of 1-6 button presses to perform now. Use small steps. A advances/confirms, B cancels/backs out, START opens the menu, the D-pad moves. WAIT pauses ~one beat (use while text scrolls or animations play).",
        },
        notes: { type: "string", description: "Your updated running notes to remember next turn: current objective, party status, where you are, recent encounters/deaths. Keep under ~120 words." },
      },
      required: ["observation", "reasoning", "buttons", "notes"],
    },
  };

  function systemPrompt(ctx) {
    return [
      `You are Claude, autonomously PLAYING ${ctx.game} on an emulator as a Hardcore Nuzlocke run. You see one screenshot per turn and choose button presses; the game then advances and you see the result next turn.`,
      ``,
      `NUZLOCKE RULES you must follow:`,
      `- Treat any fainted Pokémon as dead — never revive it; box it permanently.`,
      `- You may only catch the FIRST wild Pokémon encountered on each route/area. If it faints or flees, you get nothing there.`,
      `- Nickname Pokémon you catch.`,
      `- ${ctx.capLine || "Respect level caps (don't over-level past the next boss's ace)."}`,
      `- Play carefully: switch to preserve HP, use super-effective moves, heal at Pokémon Centers, and don't take coin-flip risks that could kill a team member.`,
      ``,
      `CONTROLS (RetroPad): A = confirm/advance text/interact. B = cancel/back/run. START = open menu. SELECT = secondary. UP/DOWN/LEFT/RIGHT = move or navigate menus. L/R = page/cycle. WAIT = let text or animation finish.`,
      ``,
      `PLAYING GUIDANCE:`,
      `- Take SMALL steps. One screenshot can't show motion, so press a few buttons at most, then observe again.`,
      `- To advance dialogue, press A (or WAIT then A) repeatedly across turns until you regain control.`,
      `- In battle: read the move list, pick an effective move with the D-pad + A. Avoid status-roulette; prefer reliable KOs and safe switches.`,
      `- If you're stuck on the same screen for several turns, try a different button (B, or move a different direction).`,
      `- This emulator path uses face/D-pad buttons only — you cannot use the DS touch screen, so navigate everything with buttons. (GBA games work best.)`,
      ``,
      `Always respond by calling the play_action tool. Be decisive.`,
    ].join("\n");
  }

  function userText(ctx) {
    return [
      `Turn ${turn}. Here is the current game screen.`,
      lastObs ? `\nPrevious observation: ${lastObs}` : ``,
      notes ? `\nYour notes so far:\n${notes}` : ``,
      `\nLook at the screenshot and call play_action with your next move(s).`,
    ].join("");
  }

  async function think(imgB64) {
    const ctx = gameContext();
    const body = {
      model: cfg.model,
      max_tokens: 1024,
      system: systemPrompt(ctx),
      tools: [PLAY_TOOL],
      tool_choice: { type: "tool", name: "play_action" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: userText(ctx) },
          { type: "image", source: { type: "base64", media_type: "image/png", data: imgB64 } },
        ],
      }],
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 240); } catch (_) {}
      throw new Error("API " + res.status + (detail ? " · " + detail : ""));
    }
    const data = await res.json();
    return parseReply(data);
  }

  /* Pull the play_action tool input out of a Messages API response.
     Exposed for testing.  Falls back to scanning text for a JSON blob. */
  function parseReply(data) {
    const content = (data && data.content) || [];
    const tool = content.find(c => c && c.type === "tool_use" && c.name === "play_action");
    if (tool && tool.input) return normalize(tool.input);
    // Fallback: a text block containing JSON
    const textBlock = content.find(c => c && c.type === "text");
    if (textBlock && textBlock.text) {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (m) { try { return normalize(JSON.parse(m[0])); } catch (_) {} }
    }
    throw new Error("No structured action in reply");
  }
  function normalize(inp) {
    let buttons = inp.buttons;
    if (typeof buttons === "string") buttons = buttons.split(/[\s,]+/);
    if (!Array.isArray(buttons)) buttons = [];
    buttons = buttons.map(b => String(b).toUpperCase().trim()).filter(b => ACTIONS.includes(b));
    if (!buttons.length) buttons = ["WAIT"];
    return {
      observation: String(inp.observation || "").trim(),
      reasoning:   String(inp.reasoning || "").trim(),
      buttons,
      notes:       String(inp.notes || "").trim(),
    };
  }

  /* ---------- main loop ---------- */
  async function turnOnce() {
    busy = true;
    try {
      Box.setStatus("thinking");
      const img = await grab();
      const decision = await think(img);
      lastObs = decision.observation || lastObs;
      if (decision.notes) notes = decision.notes;
      Box.render(turn, decision);
      log(`#${turn} ${decision.buttons.join(" ")} — ${decision.observation.slice(0, 70)}`);
      Box.setStatus("acting");
      await runActions(decision.buttons, cfg.hold);
      turn++;
      Box.setStatus(running && !paused ? "waiting" : "paused");
    } catch (e) {
      Box.setStatus("error");
      Box.setError(e.message || String(e));
      log("ERROR: " + (e.message || e));
      // Back off on errors so we don't hammer the API / a not-ready emulator.
      await sleep(1500);
    } finally {
      busy = false;
    }
  }

  async function loop() {
    while (running && !stopReq) {
      if (paused) { await sleep(250); continue; }
      if (!gm()) { Box.setStatus("error"); Box.setError("Start a game first"); await sleep(800); continue; }
      await turnOnce();
      // wait the think-interval (interruptible)
      let waited = 0;
      while (running && !stopReq && !paused && waited < cfg.interval) {
        await sleep(120); waited += 120;
      }
    }
    running = false;
    Box.setStatus("stopped");
  }

  /* ---------- public controls ---------- */
  function start() {
    if (!cfg.key) { toast("Add your Anthropic API key in Play → Claude Auto-Play settings"); openSettings(); return false; }
    if (!gm()) { toast("Start a game first, then tap AI"); return false; }
    if (running) return true;
    running = true; paused = false; stopReq = false;
    if (!turn) { notes = ""; lastObs = ""; }
    Box.show();
    Box.setStatus("waiting");
    log("Claude is now playing.");
    loop();
    syncBtn();
    return true;
  }
  function pause() { paused = true; Box.setStatus("paused"); syncBtn(); }
  function resume() { paused = false; Box.setStatus("waiting"); syncBtn(); }
  function togglePause() { paused ? resume() : pause(); }
  function stop() {
    stopReq = true; running = false; paused = false;
    Box.setStatus("stopped");
    syncBtn();
  }
  function reset() { turn = 0; notes = ""; lastObs = ""; logLines.length = 0; Box.clearLog(); }

  /* Toggle from the emulator topbar AI button. */
  function toggle() {
    if (running && !paused) { pause(); return; }
    if (running && paused) { resume(); return; }
    start();
  }
  function syncBtn() {
    const b = document.getElementById("btn-ai");
    if (!b) return;
    const on = running && !paused;
    b.classList.toggle("ff-on", on);
    b.textContent = on ? "AI ▶" : (running ? "AI ⏸" : "AI");
  }

  function log(line) {
    logLines.push(line);
    if (logLines.length > 200) logLines.shift();
    Box.appendLog(line);
  }

  /* ---------- settings UI (modal) ---------- */
  function openSettings() {
    if (typeof openModal !== "function") return;
    openModal(`
      <button class="x" onclick="closeModal()">×</button>
      <h3>Claude Auto-Play</h3>
      <p class="hint">Claude looks at the game screen and presses the buttons itself. Your API key is stored only on this device and sent directly to Anthropic. Get one at console.anthropic.com.</p>
      <label class="f">Anthropic API key</label>
      <input type="password" id="ai-key" placeholder="sk-ant-..." value="${esc(cfg.key)}" autocomplete="off">
      <label class="f">Model</label>
      <select id="ai-model">
        <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (balanced — recommended)</option>
        <option value="claude-opus-4-8">Claude Opus 4.8 (smartest, slower/pricier)</option>
        <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fastest, cheapest)</option>
      </select>
      <div class="row" style="margin-top:10px">
        <div><label class="f">Think interval (ms)</label><input type="number" id="ai-interval" value="${cfg.interval}" min="500" step="100"></div>
        <div><label class="f">Button hold (ms)</label><input type="number" id="ai-hold" value="${cfg.hold}" min="40" step="10"></div>
      </div>
      <button class="btn gold full" style="margin-top:14px" onclick="AIPlay.saveSettings()">Save</button>
      <p class="hint" style="margin-top:10px">Tip: GBA games (FireRed, Emerald, Ruby) work best — the AI uses buttons only, no DS touch screen. Start a game, then tap <b>AI</b> in the top bar.</p>
    `);
    const sel = document.getElementById("ai-model");
    if (sel) sel.value = cfg.model;
  }
  function saveSettings() {
    const key = document.getElementById("ai-key");
    const model = document.getElementById("ai-model");
    const iv = document.getElementById("ai-interval");
    const hd = document.getElementById("ai-hold");
    if (key) cfg.key = key.value.trim();
    if (model) cfg.model = model.value;
    if (iv) cfg.interval = Math.max(500, +iv.value || 2200);
    if (hd) cfg.hold = Math.max(40, +hd.value || 140);
    if (typeof closeModal === "function") closeModal();
    toast("Saved. Start a game and tap AI to let Claude play.");
  }

  /* ---------- the thinking box overlay ---------- */
  const Box = (() => {
    let el = null;
    function ensure() {
      if (el) return el;
      const stage = document.getElementById("emu-stage") || document.body;
      el = document.createElement("div");
      el.id = "ai-box";
      el.innerHTML = `
        <div class="aib-head">
          <span class="aib-dot"></span>
          <span class="aib-title">Claude</span>
          <span class="aib-status" id="aib-status">idle</span>
          <span class="aib-turn" id="aib-turn"></span>
          <button class="aib-min" id="aib-min" title="Collapse">–</button>
        </div>
        <div class="aib-body" id="aib-body">
          <div class="aib-obs" id="aib-obs"></div>
          <div class="aib-reason" id="aib-reason">Tap <b>AI</b> in the top bar to let Claude start playing.</div>
          <div class="aib-act" id="aib-act"></div>
          <details class="aib-logwrap"><summary>Log</summary><div class="aib-log" id="aib-log"></div></details>
          <div class="aib-ctrls">
            <button class="btn small gold"   onclick="AIPlay.toggle()">Play / Pause</button>
            <button class="btn small secondary" onclick="AIPlay.stop()">Stop</button>
            <button class="btn small secondary" onclick="AIPlay.openSettings()">⚙︎</button>
          </div>
        </div>`;
      stage.appendChild(el);
      el.querySelector("#aib-min").onclick = () => el.classList.toggle("min");
      return el;
    }
    function show() { ensure().classList.add("on"); }
    function hide() { if (el) el.classList.remove("on"); }
    function setStatus(s) {
      ensure();
      const map = { thinking: "thinking…", acting: "acting", waiting: "waiting", paused: "paused", stopped: "stopped", error: "error", idle: "idle" };
      const node = document.getElementById("aib-status");
      if (node) { node.textContent = map[s] || s; node.dataset.s = s; }
      ensure().dataset.s = s;
    }
    function setAction(name) {
      const a = document.getElementById("aib-act");
      if (a) a.innerHTML = `<span class="aib-key live">${esc(name)}</span>`;
    }
    function render(t, d) {
      ensure();
      const turnEl = document.getElementById("aib-turn"); if (turnEl) turnEl.textContent = "#" + t;
      const obs = document.getElementById("aib-obs"); if (obs) obs.textContent = d.observation || "";
      const rsn = document.getElementById("aib-reason"); if (rsn) rsn.textContent = d.reasoning || "";
      const act = document.getElementById("aib-act");
      if (act) act.innerHTML = (d.buttons || []).map(b => `<span class="aib-key">${esc(b)}</span>`).join("");
    }
    function setError(msg) {
      const rsn = document.getElementById("aib-reason");
      if (rsn) rsn.innerHTML = `<span style="color:var(--bad)">${esc(msg)}</span>`;
    }
    function appendLog(line) {
      const l = document.getElementById("aib-log");
      if (!l) return;
      const div = document.createElement("div");
      div.textContent = line;
      l.appendChild(div);
      l.scrollTop = l.scrollHeight;
    }
    function clearLog() { const l = document.getElementById("aib-log"); if (l) l.innerHTML = ""; }
    return { ensure, show, hide, setStatus, setAction, render, setError, appendLog, clearLog };
  })();

  document.addEventListener("DOMContentLoaded", syncBtn);

  return {
    start, stop, pause, resume, toggle, togglePause, reset,
    openSettings, saveSettings,
    // exposed for tests / debugging:
    _parseReply: parseReply, _normalize: normalize, _BTN: BTN, _ACTIONS: ACTIONS,
    _bytesToB64: bytesToB64,
    get running() { return running; },
    get cfg() { return cfg; },
    _box: Box,
  };
})();
