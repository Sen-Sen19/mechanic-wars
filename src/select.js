// Mechanic Wars - character select screen (drawn on the game canvas, shown before the arena).
// Tekken style: pick YOUR hero first (big preview on the left), then the OPPONENT (preview on the
// right), then the opponent AI and START. Works with keyboard, touch and mouse.
// The logic (nav / pick / tap / start) has no DOM in it, so it can be tested in Node.
(function (g) {
  const MW = (g.MW = g.MW || {});

  const AI_NOTES = {
    dummy: "stands still",
    aggressive: "rushes you down",
    spacing: "keeps its distance",
  };

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class SelectScreen {
    // opts: { roster: [stats], kinds: ["dummy", ...], width?, height? } (width/height only needed without a canvas)
    constructor(canvas, opts) {
      this.canvas = canvas || null;
      this.roster = opts.roster;
      this.kinds = opts.kinds;
      this.W = canvas ? canvas.width : opts.width || 1600;
      this.H = canvas ? canvas.height : opts.height || 900;
      this.active = true;
      this.p1 = 0;
      this.p2 = 0;
      this.ai = Math.min(1, this.kinds.length - 1); // aggressive by default
      this.stage = 0; // 0 = picking YOUR hero, 1 = picking the OPPONENT, 2 = AI + START
      this.startQueued = null;
      this.t = 0; // animation clock
      this.rects = this.layout();

      if (canvas) {
        canvas.addEventListener("pointerdown", (e) => {
          if (!this.active) return;
          e.preventDefault();
          const r = canvas.getBoundingClientRect();
          this.tap(((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height);
        });
      }
    }

    // Positions of every tappable thing, in canvas pixels.
    layout() {
      const W = this.W, H = this.H, n = this.roster.length;
      const panelW = 470, panelY = 150, panelH = 560;
      const left = { x: 30, y: panelY, w: panelW, h: panelH };
      const right = { x: W - 30 - panelW, y: panelY, w: panelW, h: panelH };

      // roster grid in the middle
      const cols = Math.min(n, 5);
      const gap = 10, cw = 112, ch = 136;
      const gridW = cols * cw + (cols - 1) * gap;
      const gx = (W - gridW) / 2;
      const gy = panelY + 20;
      const cells = this.roster.map((_, i) => ({ x: gx + (i % cols) * (cw + gap), y: gy + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
      const gridBottom = gy + Math.ceil(n / cols) * (ch + gap) - gap;

      // opponent AI buttons under the grid
      const k = this.kinds.length;
      const bgap = 10, bw = Math.floor((gridW - (k - 1) * bgap) / k);
      const ai = this.kinds.map((_, i) => ({ x: gx + i * (bw + bgap), y: gridBottom + 70, w: bw, h: 70 }));
      const start = { x: (W - 420) / 2, y: H - 150, w: 420, h: 80 };
      return { left, right, cells, ai, start, gridBottom, gx, gridW, cols };
    }

    // Come back from the arena with the current choices still selected (ready to START again).
    open(state) {
      this.p1 = state.p1;
      this.p2 = state.p2;
      this.ai = state.ai;
      this.stage = 2;
      this.startQueued = null;
      this.active = true;
    }

    // Number keys: set that player's hero directly and move the cursor to that player.
    pick(slot, index) {
      if (index < 0 || index >= this.roster.length) return;
      if (slot === 0) {
        this.p1 = index;
        this.stage = 0;
      } else {
        this.p2 = index;
        this.stage = 1;
      }
    }

    // Keyboard action: "left" | "right" | "up" | "down" | "confirm".
    nav(action) {
      const n = this.roster.length, cols = this.rects.cols;
      if (action === "confirm") {
        if (this.stage < 2) this.stage++;
        else this.start();
        return;
      }
      if (this.stage === 2) {
        if (action === "up") this.stage = 1; // back to re-pick the opponent
        else if (action === "left" || action === "right") {
          const d = action === "left" ? -1 : 1;
          this.ai = (this.ai + d + this.kinds.length) % this.kinds.length;
        }
        return;
      }
      const key = this.stage === 0 ? "p1" : "p2";
      let v = this[key];
      if (action === "left") v = (v - 1 + n) % n;
      else if (action === "right") v = (v + 1) % n;
      else if (action === "up") {
        if (v - cols >= 0) v -= cols;
        else if (this.stage === 1) { this.stage = 0; return; } // top of the grid: go back to your own pick
      } else if (action === "down") {
        if (v + cols < n) v += cols;
      }
      this[key] = v;
    }

    // Tap / click at canvas coordinates.
    tap(x, y) {
      const R = this.rects;
      if (inside(R.start, x, y)) {
        if (this.stage === 2) this.start();
        else this.stage++; // CONFIRM
        return;
      }
      if (inside(R.left, x, y)) { this.stage = 0; return; } // tap a preview to re-pick that fighter
      if (inside(R.right, x, y)) { this.stage = 1; return; }
      for (let i = 0; i < R.cells.length; i++) {
        if (!inside(R.cells[i], x, y)) continue;
        if (this.stage === 0) this.p1 = i; // a tap only selects (preview updates); the CONFIRM button locks it in
        else this.p2 = i;
        return;
      }
      R.ai.forEach((r, i) => {
        if (inside(r, x, y)) { this.ai = i; this.stage = 2; }
      });
    }

    start() {
      this.startQueued = { p1: this.p1, p2: this.p2, ai: this.ai };
    }

    // Returns { p1, p2, ai } (indexes) once when the player chose START, else null.
    consumeStart() {
      const s = this.startQueued;
      this.startQueued = null;
      return s;
    }

    // ---------- drawing ----------
    drawFighter(ctx, c, cx, feetY, scale, flip) {
      const fake = { id: 0, stats: c, x: -c.width / 2, y: -c.height, facing: flip ? -1 : 1, state: "idle", flash: 0, hit: null };
      ctx.save();
      ctx.translate(cx, feetY);
      ctx.scale(scale, scale);
      if (MW.Renderer && MW.Renderer.drawCharacterBody) MW.Renderer.drawCharacterBody(ctx, fake, false);
      else if (MW.Renderer && MW.Renderer.drawLook) {
        ctx.fillStyle = c.color;
        ctx.fillRect(fake.x, fake.y, c.width, c.height);
        MW.Renderer.drawLook(ctx, fake);
      }
      ctx.restore();
    }

    // Big preview panel. c may be null (opponent not chosen yet).
    drawPanel(ctx, r, c, title, active, flip) {
      ctx.fillStyle = "#151926";
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.strokeStyle = c ? c.color : "#2f3750";
      ctx.lineWidth = active ? 5 : 2;
      if (active && c) { ctx.shadowColor = c.color; ctx.shadowBlur = 18; }
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      ctx.fillStyle = active ? "#ffffff" : "#6e7893";
      ctx.font = "bold 24px monospace";
      ctx.fillText(title, r.x + r.w / 2, r.y + 14);

      if (!c) {
        ctx.fillStyle = "#2a3148";
        ctx.font = "bold 220px monospace";
        ctx.textBaseline = "middle";
        ctx.fillText("?", r.x + r.w / 2, r.y + 270);
        ctx.textBaseline = "top";
        ctx.fillStyle = "#6e7893";
        ctx.font = "20px monospace";
        ctx.fillText("choose your opponent", r.x + r.w / 2, r.y + 470);
        return;
      }

      // floor glow + the hero (bobs a little so the panel feels alive)
      const feet = r.y + 360;
      const grd = ctx.createRadialGradient(r.x + r.w / 2, feet, 10, r.x + r.w / 2, feet, 190);
      grd.addColorStop(0, c.color + "55");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(r.x, feet - 200, r.w, 260);
      const S = Math.min(3.4, 300 / c.height) * (c.previewScale || 1); // previewScale < 1 leaves headroom for tall props (Foundry's hammer)
      this.drawFighter(ctx, c, r.x + r.w / 2, feet, S, flip);

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px monospace";
      ctx.fillText(c.name.toUpperCase(), r.x + r.w / 2, r.y + 385);
      if (c.title) {
        ctx.fillStyle = c.color;
        ctx.font = "italic 20px monospace";
        ctx.fillText(c.title, r.x + r.w / 2, r.y + 428);
      }
      ctx.fillStyle = "#cfd6e6";
      ctx.font = "20px monospace";
      ctx.fillText("HP " + c.maxHP + "   ARM " + c.armor + "   SPD " + c.runSpeed + "   " + (c.attack.type === "projectile" ? "RANGED" : "MELEE"), r.x + r.w / 2, r.y + 462);
      const skills = (c.skills || []).filter(Boolean).map((s) => s.name);
      if (skills.length) {
        ctx.fillStyle = "#8b94ab";
        ctx.font = "16px monospace";
        ctx.fillText(skills.join("  |  "), r.x + r.w / 2, r.y + 498);
      }
      if (c.ultimate && c.ultimate.name) {
        ctx.fillStyle = "#ffd479";
        ctx.font = "bold 16px monospace";
        ctx.fillText("ULT: " + c.ultimate.name, r.x + r.w / 2, r.y + 524);
      }
    }

    drawCell(ctx, r, c, idx) {
      const isP1 = this.p1 === idx, isP2 = this.p2 === idx && this.stage >= 1;
      const hover = (this.stage === 0 && isP1) || (this.stage === 1 && isP2);
      ctx.fillStyle = hover ? "#202942" : "#171b27";
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2f3750";
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.stroke();

      const S = Math.min(1.1, 78 / c.height) * (c.previewScale || 1);
      this.drawFighter(ctx, c, r.x + r.w / 2, r.y + 90, S, false);

      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      ctx.fillStyle = hover ? "#ffffff" : "#cfd6e6";
      ctx.font = "bold 14px monospace";
      ctx.fillText(c.name.toUpperCase(), r.x + r.w / 2, r.y + 104, r.w - 8);
      ctx.fillStyle = "#4a5370";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(String(idx + 1 === 10 ? 0 : idx + 1), r.x + 6, r.y + 5);

      // P1 / P2 markers
      ctx.font = "bold 16px monospace";
      if (isP1) {
        ctx.strokeStyle = "#5ec8ff";
        ctx.lineWidth = hover ? 5 : 3;
        roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.stroke();
        ctx.fillStyle = "#5ec8ff";
        ctx.textAlign = "left";
        ctx.fillText("P1", r.x + 8, r.y + r.h - 22);
      }
      if (isP2) {
        ctx.strokeStyle = "#ff6b6b";
        ctx.lineWidth = hover ? 5 : 3;
        const inset = isP1 ? 5 : 0;
        roundRect(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, 8);
        ctx.stroke();
        ctx.fillStyle = "#ff6b6b";
        ctx.textAlign = "right";
        ctx.fillText("P2", r.x + r.w - 8, r.y + r.h - 22);
      }
    }

    draw(ctx) {
      const W = this.W, H = this.H, R = this.rects;
      this.t++;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#12141c";
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd479";
      ctx.font = "bold 50px monospace";
      ctx.fillText("MECHANIC WARS", W / 2, 20);
      const banner = ["PICK YOUR FIGHTER  -  THEN CONFIRM", "PICK YOUR OPPONENT  -  THEN CONFIRM", "CHOOSE THE AI  -  THEN START"][this.stage];
      ctx.fillStyle = this.stage === 0 ? "#5ec8ff" : this.stage === 1 ? "#ff6b6b" : "#7dffa8";
      ctx.font = "bold 26px monospace";
      ctx.fillText(banner, W / 2, 90);
      ctx.fillStyle = "#8b94ab";
      ctx.font = "16px monospace";
      ctx.fillText("select a hero, then press CONFIRM (or ENTER)", W / 2, 124);

      // previews: you on the left (always), opponent on the right once you reach that step
      this.drawPanel(ctx, R.left, this.roster[this.p1], "YOU (P1)", this.stage === 0, false);
      this.drawPanel(ctx, R.right, this.stage >= 1 ? this.roster[this.p2] : null, "OPPONENT (P2)", this.stage === 1, true);

      this.roster.forEach((c, i) => this.drawCell(ctx, R.cells[i], c, i));

      // AI buttons
      ctx.textAlign = "center";
      ctx.fillStyle = this.stage === 2 ? "#ffffff" : "#6e7893";
      ctx.font = "bold 18px monospace";
      ctx.fillText("OPPONENT AI", W / 2, R.ai[0].y - 28);
      this.kinds.forEach((k, i) => {
        const r = R.ai[i];
        const sel = this.ai === i;
        ctx.fillStyle = sel ? "#202942" : "#171b27";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = sel ? "#ffd479" : "#2f3750";
        ctx.lineWidth = sel ? 4 : 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.textAlign = "center";
        ctx.fillStyle = sel ? "#ffffff" : "#cfd6e6";
        ctx.font = "bold 17px monospace";
        ctx.fillText(MW.Bots.LABELS[k], r.x + r.w / 2, r.y + 12, r.w - 8);
        ctx.fillStyle = "#8b94ab";
        ctx.font = "13px monospace";
        ctx.fillText(AI_NOTES[k] || "", r.x + r.w / 2, r.y + 40, r.w - 8);
      });

      // START
      const s = R.start, ready = this.stage === 2;
      ctx.fillStyle = ready ? "#2a8f4e" : this.stage === 0 ? "#2b6f9e" : "#9e3b3b"; // blue = confirm P1, red = confirm P2, green = START
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = ready ? "#7dffa8" : this.stage === 0 ? "#5ec8ff" : "#ff6b6b";
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      ctx.fillText(ready ? "START" : "CONFIRM", s.x + s.w / 2, s.y + 22);

      ctx.fillStyle = "#8b94ab";
      ctx.font = "16px monospace";
      ctx.fillText("A/D/W/S move  |  ENTER confirm / start  |  W goes back a step  |  1-9,0 your hero, SHIFT+1-9,0 opponent  |  tap a preview to re-pick", W / 2, H - 40);
    }
  }

  MW.SelectScreen = SelectScreen;
})(globalThis);