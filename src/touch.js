// Mechanic Wars - on-screen touch controls (virtual joystick + buttons).
// Produces the same per-tick intent shape as the keyboard, so the sim never
// knows which device is driving a fighter.
(function (g) {
  const MW = (g.MW = g.MW || {});

  const CSS = `
    #mw-touch { position: fixed; inset: 0; pointer-events: none; z-index: 10;
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
    #mw-touch * { touch-action: none; -webkit-tap-highlight-color: transparent; }
    .mw-stick { position: absolute; left: calc(28px + env(safe-area-inset-left, 0px)); bottom: calc(28px + env(safe-area-inset-bottom, 0px));
      width: 160px; height: 160px; border-radius: 50%; pointer-events: auto;
      background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.28); }
    .mw-knob { position: absolute; left: 50%; top: 50%; width: 72px; height: 72px; margin: -36px 0 0 -36px;
      border-radius: 50%; background: rgba(255,255,255,0.35); border: 2px solid rgba(255,255,255,0.6); }
    .mw-btn { position: absolute; pointer-events: auto; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font: 700 18px monospace; color: #fff; background: rgba(74,163,255,0.30); border: 2px solid rgba(74,163,255,0.8); }
    .mw-btn.active { background: rgba(74,163,255,0.65); }
    .mw-jump { right: calc(32px + env(safe-area-inset-right, 0px)); bottom: calc(44px + env(safe-area-inset-bottom, 0px)); width: 120px; height: 120px; }
    .mw-attack { right: calc(164px + env(safe-area-inset-right, 0px)); bottom: calc(100px + env(safe-area-inset-bottom, 0px)); width: 104px; height: 104px;
      background: rgba(255,90,90,0.30); border-color: rgba(255,90,90,0.85); }
    .mw-attack.active { background: rgba(255,90,90,0.65); }
    .mw-reset { right: calc(16px + env(safe-area-inset-right, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); width: 52px; height: 52px; font-size: 14px;
      background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.4); }
    .mw-full { left: calc(16px + env(safe-area-inset-left, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); width: 52px; height: 52px; font-size: 13px;
      background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.4); }
    .mw-menu { left: calc(16px + env(safe-area-inset-left, 0px)); top: calc(72px + env(safe-area-inset-top, 0px)); width: 52px; height: 52px; font-size: 12px;
      background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.4); }
    .mw-chars { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(18px + env(safe-area-inset-bottom, 0px));
      display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
    .mw-row, .mw-slots { display: flex; gap: 6px; }
    .mw-slot { pointer-events: auto; padding: 0 16px; height: 28px; display: flex; align-items: center; border-radius: 8px;
      font: 700 11px monospace; color: #fff; background: rgba(0,0,0,0.35); border: 2px solid rgba(255,255,255,0.6); }
    .mw-slot.sel { background: #fff; color: #0b0d12; }
    .mw-chip { pointer-events: auto; padding: 0 6px; height: 36px; display: flex; align-items: center; border-radius: 8px;
      font: 700 10px monospace; color: #fff; background: rgba(0,0,0,0.35); border: 2px solid var(--c); }
    .mw-chip.sel { background: var(--c); color: #0b0d12; }
    @media (orientation: portrait) { .mw-chars { bottom: calc(200px + env(safe-area-inset-bottom, 0px)); } }
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

  class TouchInput {
    static supported() {
      return (
        "ontouchstart" in window ||
        (navigator.maxTouchPoints || 0) > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
      );
    }

    // opts.characters: [{ id, name, color }] -> a row of tap-to-select chips.
    constructor(parent, opts = {}) {
      this.pickQueued = null; // { slot, id } for a tapped chip
      this.slot = 0; // which fighter the chips pick for: 0 = P1, 1 = P2 (dummy)
      this.selected = [null, null]; // selected character id per slot
      this.slotBtns = [];
      this.attackQueued = false;
      this.chips = {};
      this.nx = 0; // joystick, -1..1
      this.ny = 0;
      this.jumpQueued = false;
      this.resetQueued = false;
      this.menuQueued = false;
      this.aiQueued = false;
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

      this.jumpBtn = el("mw-btn mw-jump", "JUMP");
      this.resetBtn = el("mw-btn mw-reset", "RESET");
      this.attackBtn = el("mw-btn mw-attack", "ATTACK");
      this.menuBtn = el("mw-btn mw-menu", "MENU");
      this.root = root;
      const hint = el("mw-hint", "Tip: rotate your phone to landscape for a bigger view");

      root.append(hint, this.stick, this.jumpBtn, this.attackBtn, this.resetBtn, this.menuBtn);
      this.gameEls = [hint, this.stick, this.jumpBtn, this.attackBtn, this.resetBtn, this.menuBtn];

      if (opts.characters && opts.characters.length) {
        const wrap = el("mw-chars");
        const slots = el("mw-slots");
        ["P1", "P2"].forEach((label, i) => {
          const b = el("mw-slot", label);
          this.slotBtns.push(b);
          this.bindButton(b, () => {
            this.slot = i;
            this.refreshChips();
          });
          slots.appendChild(b);
        });
        // Opponent AI button: tap to cycle dummy / aggressive / spacing.
        this.aiBtn = el("mw-slot", "AI");
        this.bindButton(this.aiBtn, () => (this.aiQueued = true));
        slots.appendChild(this.aiBtn);
        const row = el("mw-row");
        for (const c of opts.characters) {
          const chip = el("mw-chip", c.name.toUpperCase());
          chip.style.setProperty("--c", c.color);
          this.chips[c.id] = chip;
          this.bindButton(chip, () => (this.pickQueued = { slot: this.slot, id: c.id }));
          row.appendChild(chip);
        }
        wrap.append(slots, row);
        root.appendChild(wrap);
        this.gameEls.push(wrap);
        this.refreshChips();
      }

      // Fullscreen hides the browser bars. Not available everywhere (iOS Safari
      // only allows it for installed web apps), so the button only appears when supported.
      const de = document.documentElement;
      if (document.fullscreenEnabled && de.requestFullscreen) {
        this.fullBtn = el("mw-btn mw-full", "FULL");
        root.appendChild(this.fullBtn);
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
      this.bindButton(this.jumpBtn, () => (this.jumpQueued = true));
      this.bindButton(this.attackBtn, () => (this.attackQueued = true));
      this.bindButton(this.resetBtn, () => (this.resetQueued = true));
      this.bindButton(this.menuBtn, () => (this.menuQueued = true));
    }

    // Show or hide the arena controls (the select screen uses plain canvas taps instead).
    // FULL stays, so fullscreen still works from the select screen.
    setGameControls(visible) {
      for (const e of this.gameEls) e.style.display = visible ? "" : "none";
      if (!visible) {
        this.nx = this.ny = 0;
        this.stickId = null;
        this.knob.style.transform = "";
      }
    }

    // Text on the AI button, e.g. "AGGRESSIVE" -> "AI: AGGRESSIVE".
    setAiLabel(text) {
      if (this.aiBtn) this.aiBtn.textContent = "AI: " + text;
    }

    consumeMenu() {
      const r = this.menuQueued;
      this.menuQueued = false;
      return r;
    }

    consumeAi() {
      const r = this.aiQueued;
      this.aiQueued = false;
      return r;
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
      };
      this.prevDown = downHeld;
      this.jumpQueued = false;
      this.attackQueued = false;
      return intent;
    }

    consumeReset() {
      const r = this.resetQueued;
      this.resetQueued = false;
      return r;
    }

    // Returns { slot, id } for a tapped chip, or null.
    consumePick() {
      const p = this.pickQueued;
      this.pickQueued = null;
      return p;
    }

    // Record which character a slot (0 = P1, 1 = P2) is using and refresh the highlight.
    setSelected(slot, id) {
      this.selected[slot] = id;
      this.refreshChips();
    }

    refreshChips() {
      const id = this.selected[this.slot];
      for (const k in this.chips) this.chips[k].classList.toggle("sel", k === id);
      this.slotBtns.forEach((b, i) => b.classList.toggle("sel", i === this.slot));
    }
  }

  MW.TouchInput = TouchInput;
})(globalThis);
