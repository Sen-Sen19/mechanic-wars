// Mechanic Wars - on-screen touch controls (virtual joystick + buttons).
// Produces the same per-tick intent shape as the keyboard, so the sim never
// knows which device is driving a fighter.
(function (g) {
  const MW = (g.MW = g.MW || {});

  const ICONS = {
    attack: '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>',
    jump: '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12l6-6 6 6"/><path d="M6 19l6-6 6 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    reload: '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    full: '<svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };

  const CSS = `
    #mw-touch { position: fixed; inset: 0; pointer-events: none; z-index: 10;
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
    #mw-touch * { touch-action: none; -webkit-tap-highlight-color: transparent; }

    /* joystick: small, glassy */
    .mw-stick { position: absolute; left: calc(18px + env(safe-area-inset-left, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px));
      width: 124px; height: 124px; border-radius: 50%; pointer-events: auto;
      background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.12) 100%);
      border: 2px solid rgba(255,255,255,0.28);
      box-shadow: inset 0 0 18px rgba(127,216,255,0.18), 0 4px 14px rgba(0,0,0,0.35);
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
    .mw-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
      border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), rgba(160,200,255,0.5));
      border: 2px solid rgba(255,255,255,0.75); box-shadow: 0 2px 10px rgba(0,0,0,0.45), 0 0 12px rgba(127,216,255,0.45); }

    /* round action buttons */
    .mw-btn { position: absolute; pointer-events: auto; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      color: #fff; border: 2px solid rgba(255,255,255,0.55); background: rgba(20,24,44,0.55);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
      transition: transform 0.06s, background 0.06s; }
    .mw-btn svg { display: block; pointer-events: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
    .mw-btn.active { transform: scale(0.9); }
    .mw-jump { width: 42px; height: 42px;
      background: rgba(74,163,255,0.35); border-color: rgba(120,190,255,0.95); box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 14px rgba(74,163,255,0.4); }
    .mw-jump.active { background: rgba(74,163,255,0.75); }
    .mw-attack { width: 56px; height: 56px;
      background: rgba(255,90,90,0.35); border-color: rgba(255,130,130,0.95); box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 14px rgba(255,90,90,0.4); }
    .mw-attack.active { background: rgba(255,90,90,0.75); }

    /* skill slots: fan of 4 around the attack button */
    .mw-skill { width: 34px; height: 34px; flex-direction: column; font: 700 9px/1 monospace; letter-spacing: 0.02em;
      background: rgba(176,108,255,0.30); border-color: rgba(200,160,255,0.9); box-shadow: 0 3px 10px rgba(0,0,0,0.4), 0 0 10px rgba(176,108,255,0.35); }
    .mw-skill .mw-slot-n { position: absolute; top: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%;
      background: rgba(10,12,26,0.85); border: 1px solid rgba(255,255,255,0.5); font-size: 8px; line-height: 10px; text-align: center; }
    .mw-skill.empty { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.28); border-style: dashed; color: rgba(255,255,255,0.4);
      box-shadow: none; }
    .mw-skill.active { background: rgba(176,108,255,0.75); }
    .mw-ult { width: 38px; height: 38px; font: 800 8px/1 monospace; letter-spacing: 0.04em;
      background: rgba(255,212,121,0.10); border-color: rgba(255,212,121,0.35); color: rgba(255,255,255,0.45); box-shadow: none; }
    .mw-ult.ready { background: rgba(255,212,121,0.45); border-color: #ffd479; color: #fff;
      box-shadow: 0 0 18px rgba(255,212,121,0.8), 0 4px 12px rgba(0,0,0,0.4); animation: mwUltPulse 0.9s ease-in-out infinite; }
    .mw-ult.active { background: rgba(255,212,121,0.8); }
    @keyframes mwUltPulse { 50% { box-shadow: 0 0 28px rgba(255,212,121,1), 0 4px 12px rgba(0,0,0,0.4); } }
    .mw-skill { overflow: hidden; }
    .mw-skill .mw-cd { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; }
    .mw-skill .mw-cdt { position: absolute; font: 800 11px/1 monospace; color: #fff; text-shadow: 0 1px 3px #000; pointer-events: none; }
    .mw-skill .mw-slot-n { z-index: 2; }
    .mw-skill.cooling { filter: saturate(0.4); }
    .mw-skill.empty.active { background: rgba(255,255,255,0.18); }

    /* top-centre control pill: pause / restart / menu / fullscreen */
    .mw-bar { position: absolute; left: 50%; transform: translateX(-50%); top: calc(8px + env(safe-area-inset-top, 0px));
      display: flex; gap: 8px; padding: 5px 8px; border-radius: 999px; pointer-events: none;
      background: rgba(10,12,26,0.5); border: 1px solid rgba(255,255,255,0.18);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    .mw-bar .mw-btn { position: relative; width: 38px; height: 38px; box-shadow: none; background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.35); }
    .mw-bar .mw-btn.active { background: rgba(127,216,255,0.45); }

    .mw-hint { display: none; position: absolute; left: 0; right: 0; top: 56%; text-align: center; color: #8b94ab;
      font: 14px monospace; pointer-events: none; }
    @media (orientation: portrait) { .mw-hint { display: block; } }
  `;

  function el(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }
  function iconBtn(cls, icon, label) {
    const d = el(cls);
    d.innerHTML = ICONS[icon];
    d.setAttribute("role", "button");
    d.setAttribute("aria-label", label);
    return d;
  }

  class TouchInput {
    static supported() {
      return (
        "ontouchstart" in window ||
        (navigator.maxTouchPoints || 0) > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
      );
    }

    constructor(parent, opts = {}) {
      this.attackQueued = false;
      this.nx = 0; // joystick, -1..1
      this.ny = 0;
      this.attackHeld = false;
this.attackReleased = false;
      this.jumpQueued = false;
      this.resetQueued = false;
      this.menuQueued = false;
      this.pauseQueued = false;
      this.paused = false;
      this.prevDown = false;
      this.stickId = null;

      const style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);

      const root = el("");
      root.id = "mw-touch";
      root.addEventListener("contextmenu", (e) => e.preventDefault());

      this.stick = el("mw-stick");
      this.knob = el("mw-knob");
      this.stick.appendChild(this.knob);

      this.jumpBtn = iconBtn("mw-btn mw-jump", "jump", "Jump");
      this.attackBtn = iconBtn("mw-btn mw-attack", "attack", "Attack");
      this.ultQueued = false;
   
      this.skillQueued = [false, false, false, false];
      this.skillBtns = [0, 1, 2, 3].map((i) => {
        const b = el("mw-btn mw-skill empty");
        b.setAttribute("role", "button");
        b.setAttribute("aria-label", "Skill " + (i + 1));
        return b;
      });
      this.pauseBtn = iconBtn("mw-btn", "pause", "Pause");
      this.refreshBtn = iconBtn("mw-btn", "reload", "Hard Refresh");
      this.resetBtn = iconBtn("mw-btn", "reload", "Restart");
      this.menuBtn = iconBtn("mw-btn", "menu", "Menu");
      this.root = root;
      const hint = el("mw-hint", "Tip: rotate your phone to landscape for a bigger view");

      this.bar = el("mw-bar");
      this.bar.append(this.pauseBtn, this.refreshBtn, this.resetBtn, this.menuBtn);

      root.append(hint, this.stick, this.jumpBtn, this.attackBtn, ...this.skillBtns, this.bar);
      this.gameEls = [hint, this.stick, this.jumpBtn, this.attackBtn, ...this.skillBtns, this.pauseBtn, this.refreshBtn, this.resetBtn, this.menuBtn];
      this.layoutButtons();
      this.setSkills(null);

      // Fullscreen hides the browser bars. Not available everywhere (iOS Safari
      // only allows it for installed web apps), so the button only appears when supported.
      const de = document.documentElement;
      if (document.fullscreenEnabled && de.requestFullscreen) {
        this.fullBtn = iconBtn("mw-btn", "full", "Fullscreen");
        this.bar.appendChild(this.fullBtn);
        this.bindButton(this.fullBtn, () => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
          }
          de.requestFullscreen()
            .then(() => {
              if (screen.orientation && screen.orientation.lock) {
                return screen.orientation.lock("landscape");
              }
            })
            .catch(() => {}); // orientation lock can fail; fullscreen alone is fine
        });
      }
      parent.appendChild(root);

       this.bindStick();

      // Jump
      this.bindButton(this.jumpBtn, () => {
        this.jumpQueued = true;
      });

      // Attack: supports tapping and holding
      this.attackBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();

        this.attackBtn.setPointerCapture(e.pointerId);
        this.attackBtn.classList.add("active");

        this.attackQueued = true;
        this.attackHeld = true;
      });

      const releaseAttack = (e) => {
        if (!this.attackHeld) return;

        this.attackHeld = false;
        this.attackReleased = true;
        this.attackBtn.classList.remove("active");
      };

      this.attackBtn.addEventListener("pointerup", releaseAttack);
      this.attackBtn.addEventListener("pointercancel", releaseAttack);
      this.attackBtn.addEventListener("lostpointercapture", releaseAttack);

      // Skills
      this.skillBtns.forEach((b, i) => {
        this.bindButton(b, () => {
          this.skillQueued[i] = true;
        });
      });

      // Pause
      this.bindButton(this.pauseBtn, () => {
        this.pauseQueued = true;
      });

      // Hard refresh
      this.bindButton(this.refreshBtn, () => {
        window.location.reload(true);
      });

      // Restart
      this.bindButton(this.resetBtn, () => {
        this.resetQueued = true;
      });

      // Menu
        this.bindButton(this.menuBtn, () => {
        this.menuQueued = true;
      });

    } // <-- ADD THIS. Closes constructor.

    // Right-hand cluster. Everything is placed by its centre.
    layoutButtons() {
      const LAYOUT = {
        attack: { x: 46, y: 46 }, // centre of the attack button
        jump: { x: 114, y: 30 },
        ult: { x: 164, y: 32 }, // ultimate: glows when the mana meter is full
        arc: { radius: 80, angles: [22, 50, 78, 106] }, // degrees, 0 = straight left of attack, 90 = straight up
      };
      const size = { attack: 56, jump: 42, skill: 34 }; // keep in step with the CSS sizes
      const put = (elm, cx, cy, w) => {
        if (!elm) return; // Guard against undefined elements
        elm.style.right = "calc(" + (cx - w / 2) + "px + env(safe-area-inset-right, 0px))";
        elm.style.bottom = "calc(" + (cy - w / 2) + "px + env(safe-area-inset-bottom, 0px))";
      };
      put(this.attackBtn, LAYOUT.attack.x, LAYOUT.attack.y, size.attack);
      put(this.jumpBtn, LAYOUT.jump.x, LAYOUT.jump.y, size.jump);
      put(this.ultBtn, LAYOUT.ult.x, LAYOUT.ult.y, 38);
      this.skillBtns.forEach((b, i) => {
        const a = (LAYOUT.arc.angles[i] * Math.PI) / 180;
        put(b, LAYOUT.attack.x + LAYOUT.arc.radius * Math.cos(a), LAYOUT.attack.y + LAYOUT.arc.radius * Math.sin(a), size.skill);
      });
    }

    // Light the ULT button when the mana meter is full (main.js calls this every frame).
    setUltReady(on) {
      if (!this.ultBtn || this._ultOn === on) return; // never let a missing button stop the game loop
      this._ultOn = on;
      this.ultBtn.classList.toggle("ready", on);
    }
    // The P1 health panel acts as the ultimate button (main.js calls this when it is tapped while ready).
    fireUlt() {
      this.ultQueued = true;
    }
    // Cooldown overlay on each skill button. cds[i] = ticks left, max[i] = full cooldown ticks (main.js, every frame).
    setSkillCooldowns(cds, max) {
      this.skillBtns.forEach((b, i) => {
        const left = cds[i] || 0, tot = max[i] || 0;
        const key = tot > 0 ? Math.ceil(left / 3) : 0; // redraw at most ~20x/s
        if (this._cdKey && this._cdKey[i] === key) return;
        (this._cdKey = this._cdKey || [])[i] = key;
        const ring = b.querySelector(".mw-cd"), txt = b.querySelector(".mw-cdt");
        if (!ring || !txt) return;
        if (left > 0 && tot > 0) {
          ring.style.background = "conic-gradient(rgba(0,0,0,0.65) " + (left / tot) * 360 + "deg, transparent 0)";
          txt.textContent = (left / 60).toFixed(left > 600 ? 0 : 1);
          b.classList.add("cooling");
        } else {
          ring.style.background = "";
          txt.textContent = "";
          b.classList.remove("cooling");
        }
      });
    }

    // Label the 4 slots from the character's `skills` array (null = empty slot).
    setSkills(list) {
      this.skillBtns.forEach((b, i) => {
        const def = list && list[i];
        b.classList.toggle("empty", !def);
        b.innerHTML = '<span>' + (def ? (def.icon || def.name || "").slice(0, 4) : "") + '</span><span class="mw-cd"></span><span class="mw-cdt"></span><span class="mw-slot-n">' + (i + 1) + "</span>";
        this._cdKey = [];
      });
    }

    // Show or hide the arena controls (the select screen uses plain canvas taps instead).
    // FULL stays, so fullscreen still works from the select screen.
    setGameControls(visible) {
      for (const e of this.gameEls) e.style.display = visible ? "" : "none";
      // the top bar only holds fullscreen on the select screen
      this.bar.style.display = visible || this.fullBtn ? "" : "none";
      if (!visible) {
        this.nx = this.ny = 0;
        this.stickId = null;
        this.knob.style.transform = "";
      }
    }

    // Swap the pause button icon between pause and play.
    setPaused(on) {
      this.paused = on;
      this.pauseBtn.innerHTML = ICONS[on ? "play" : "pause"];
      this.pauseBtn.setAttribute("aria-label", on ? "Resume" : "Pause");
    }

    consumePause() {
      const r = this.pauseQueued;
      this.pauseQueued = false;
      return r;
    }

    consumeReset() {
  const r = this.resetQueued;
  this.resetQueued = false;
  return r;
}
    // The character / AI picker was removed from the on-screen controls; these stay as no-ops
    // so main.js and older callers keep working.
    setAiLabel() {}
    setSelected() {}

    consumeMenu() {
      const r = this.menuQueued;
      this.menuQueued = false;
      return r;
    }

    consumeAi() {
      return false;
    }

    bindStick() {
      const s = this.stick;
      const update = (e) => {
        const r = s.getBoundingClientRect();
        const radius = r.width / 2;
        let dx = e.clientX - (r.left + radius);
        let dy = e.clientY - (r.top + radius);
        const len = Math.hypot(dx, dy);
        if (len > radius) {
          dx = (dx / len) * radius;
          dy = (dy / len) * radius;
        }
        this.nx = dx / radius;
        this.ny = dy / radius;
        this.knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      };
      const release = (e) => {
        if (e.pointerId !== this.stickId) return;
        this.stickId = null;
        this.nx = 0;
        this.ny = 0;
        this.knob.style.transform = "";
      };
      s.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (this.stickId !== null) return;
        this.stickId = e.pointerId;
        s.setPointerCapture(e.pointerId);
        update(e);
      });
      s.addEventListener("pointermove", (e) => {
        if (e.pointerId === this.stickId) update(e);
      });
      s.addEventListener("pointerup", release);
      s.addEventListener("pointercancel", release);
      s.addEventListener("lostpointercapture", release);
    }

    bindButton(btn, onPress) {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add("active");
        onPress();
      });
      const up = () => btn.classList.remove("active");
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("lostpointercapture", up);
    }

    // Called once per simulation tick; consumes edge-triggered presses.
   poll() {
  const downHeld = this.ny > 0.55;

  const intent = {
    left: this.nx < -0.3,
    right: this.nx > 0.3,

    jumpPressed: this.jumpQueued,
    downPressed: downHeld && !this.prevDown,
    downHeld: downHeld,

    attackPressed: this.attackQueued,
    attackHeld: this.attackHeld,
    attackReleased: this.attackReleased,

    ultPressed: this.ultQueued,
    skillPressed: this.skillQueued.slice(),
  };

  this.prevDown = downHeld;

  this.jumpQueued = false;
  this.attackQueued = false;
  this.attackReleased = false;
  this.skillQueued.fill(false);
  this.ultQueued = false;

  return intent;
}
  }

  MW.TouchInput = TouchInput;
})(globalThis);