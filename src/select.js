// Mechanic Wars - character select screen (drawn on the game canvas, shown before the arena).
// Three rows: P1 fighter, P2 (opponent) fighter, opponent AI. Works with keyboard, touch and mouse.
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
      this.focus = 0; // keyboard row: 0 = P1, 1 = P2, 2 = AI
      this.startQueued = null;
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
      const n = this.roster.length;
      const cw = 260, ch = 200, gap = 20;
      const x0 = (this.W - (n * cw + (n - 1) * gap)) / 2;
      const rowY = [135, 390];
      const cards = rowY.map((y) => this.roster.map((_, i) => ({ x: x0 + i * (cw + gap), y, w: cw, h: ch })));
      const k = this.kinds.length;
      const bw = 300, bgap = 20;
      const bx0 = (this.W - (k * bw + (k - 1) * bgap)) / 2;
      const ai = this.kinds.map((_, i) => ({ x: bx0 + i * (bw + bgap), y: 640, w: bw, h: 64 }));
      const start = { x: (this.W - 420) / 2, y: 745, w: 420, h: 80 };
      return { cards, ai, start, rowY };
    }

    // Come back from the arena with the current choices still selected.
    open(state) {
      this.p1 = state.p1;
      this.p2 = state.p2;
      this.ai = state.ai;
      this.focus = 0;
      this.startQueued = null;
      this.active = true;
    }

    pick(slot, index) {
      if (index < 0 || index >= this.roster.length) return;
      if (slot === 0) this.p1 = index;
      else this.p2 = index;
      this.focus = slot === 0 ? 0 : 1;
    }

    // Keyboard action: "left" | "right" | "up" | "down" | "confirm".
    nav(action) {
      if (action === "up") this.focus = Math.max(0, this.focus - 1);
      else if (action === "down") this.focus = Math.min(2, this.focus + 1);
      else if (action === "left" || action === "right") {
        const d = action === "left" ? -1 : 1;
        const wrap = (v, n) => (v + d + n) % n;
        if (this.focus === 0) this.p1 = wrap(this.p1, this.roster.length);
        else if (this.focus === 1) this.p2 = wrap(this.p2, this.roster.length);
        else this.ai = wrap(this.ai, this.kinds.length);
      } else if (action === "confirm") this.start();
    }

    // Tap / click at canvas coordinates.
    tap(x, y) {
      const R = this.rects;
      for (let row = 0; row < 2; row++) {
        R.cards[row].forEach((r, i) => {
          if (inside(r, x, y)) this.pick(row, i);
        });
      }
      R.ai.forEach((r, i) => {
        if (inside(r, x, y)) {
          this.ai = i;
          this.focus = 2;
        }
      });
      if (inside(R.start, x, y)) this.start();
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
    drawCard(ctx, r, c, selected, tag) {
      // card background
      ctx.fillStyle = selected ? "#202942" : "#171b27";
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.strokeStyle = selected ? c.color : "#2f3750";
      ctx.lineWidth = selected ? 5 : 2;
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.stroke();

      // selected glow
      if (selected) {
        ctx.shadowColor = c.color;
        ctx.shadowBlur = 12;
        roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // character preview using new body renderer
      const feet = r.y + 125;
      const fake = { id: 0, stats: c, x: r.x + r.w / 2 - c.width / 2, y: feet - c.height, facing: 1, state: "idle", flash: 0, hit: null };
      if (MW.Renderer && MW.Renderer.drawCharacterBody) {
        MW.Renderer.drawCharacterBody(ctx, fake, false);
      } else if (MW.Renderer && MW.Renderer.drawLook) {
        ctx.fillStyle = c.color;
        ctx.fillRect(fake.x, fake.y, c.width, c.height);
        MW.Renderer.drawLook(ctx, fake);
      }

      ctx.textAlign = "center";
      ctx.fillStyle = selected ? "#ffffff" : "#cfd6e6";
      ctx.font = "bold 22px monospace";
      ctx.fillText(c.name.toUpperCase(), r.x + r.w / 2, r.y + 138);
      ctx.fillStyle = "#8b94ab";
      ctx.font = "15px monospace";
      ctx.fillText("HP " + c.maxHP + "  ARM " + c.armor + "  SPD " + c.runSpeed, r.x + r.w / 2, r.y + 168);
      ctx.textAlign = "right";
      ctx.font = "13px monospace";
      ctx.fillText(c.attack.type === "projectile" ? "RANGED" : "MELEE", r.x + r.w - 8, r.y + 8);
      if (selected) {
        ctx.textAlign = "left";
        ctx.fillStyle = c.color;
        ctx.font = "bold 18px monospace";
        ctx.fillText(tag, r.x + 10, r.y + 8);
      }
    }

    draw(ctx) {
      const W = this.W, H = this.H, R = this.rects;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#12141c";
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd479";
      ctx.font = "bold 54px monospace";
      ctx.fillText("MECHANIC WARS", W / 2, 22);
      ctx.fillStyle = "#8b94ab";
      ctx.font = "20px monospace";
      ctx.fillText("choose your fighter, your opponent and how it plays", W / 2, 84);

      const labels = ["YOU (P1)", "OPPONENT (P2)", "OPPONENT AI"];
      const labelY = [R.rowY[0] - 28, R.rowY[1] - 28, R.ai[0].y - 28];
      for (let i = 0; i < 3; i++) {
        ctx.textAlign = "left";
        ctx.font = "bold 20px monospace";
        ctx.fillStyle = this.focus === i ? "#ffffff" : "#6e7893";
        ctx.fillText((this.focus === i ? "> " : "  ") + labels[i], R.cards[0][0].x, labelY[i]);
      }

      const picks = [this.p1, this.p2];
      for (let row = 0; row < 2; row++) {
        this.roster.forEach((c, i) => this.drawCard(ctx, R.cards[row][i], c, picks[row] === i, row === 0 ? "P1" : "P2"));
      }

      this.kinds.forEach((k, i) => {
        const r = R.ai[i];
        const sel = this.ai === i;
        ctx.fillStyle = sel ? "#202942" : "#171b27";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = sel ? "#ffd479" : "#2f3750";
        ctx.lineWidth = sel ? 5 : 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.textAlign = "center";
        ctx.fillStyle = sel ? "#ffffff" : "#cfd6e6";
        ctx.font = "bold 22px monospace";
        ctx.fillText(MW.Bots.LABELS[k], r.x + r.w / 2, r.y + 10);
        ctx.fillStyle = "#8b94ab";
        ctx.font = "15px monospace";
        ctx.fillText(AI_NOTES[k] || "", r.x + r.w / 2, r.y + 38);
      });

      const s = R.start;
      ctx.fillStyle = "#2a8f4e";
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = "#7dffa8";
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px monospace";
      ctx.fillText("START", s.x + s.w / 2, s.y + 22);

      ctx.fillStyle = "#8b94ab";
      ctx.font = "18px monospace";
      ctx.fillText("tap a card  |  keys: A/D change, W/S switch row, ENTER start, 1-5 you, 6-0 opponent", W / 2, H - 40);
    }
  }

  MW.SelectScreen = SelectScreen;
})(globalThis);
