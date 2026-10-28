// Mechanic Wars - keyboard input. Produces per-tick intents (see MW.IDLE_INTENT).
(function (g) {
  const MW = (g.MW = g.MW || {});

  const P1_KEYS = {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space", "KeyX"],
    down: ["KeyS", "ArrowDown"],
    attack: ["KeyJ", "KeyF", "KeyZ", "KeyK"],
  };
  const BLOCKED = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);
  const MENU_KEYS = ["KeyM", "Escape"]; // back to the character select screen
  const PAUSE_KEYS = ["KeyP"];
  const AI_KEY = "KeyB"; // cycle the opponent: dummy -> aggressive -> spacing
  // Keys the character select screen listens to (turned into named actions).
  const NAV_KEYS = {
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    Enter: "confirm", NumpadEnter: "confirm", Space: "confirm", KeyJ: "confirm", KeyZ: "confirm",
  };

  class KeyboardInput {
    constructor(target) {
      this.down = new Set();
      this.pressed = new Set();
      this.resetQueued = false;
      this.pickQueued = null; // { slot, index } from number keys: 1-5 = P1, 6-9 and 0 = P2 (dummy)
      this.menuQueued = false;
      this.aiQueued = false;
      this.pauseQueued = false;
      this.navQueued = []; // menu actions: left / right / up / down / confirm

      target.addEventListener("keydown", (e) => {
        if (BLOCKED.has(e.code)) e.preventDefault();
        if (!this.down.has(e.code)) {
          this.pressed.add(e.code);
          if (e.code === "KeyR") this.resetQueued = true;
          if (MENU_KEYS.includes(e.code)) this.menuQueued = true;
          if (e.code === AI_KEY) this.aiQueued = true;
          if (PAUSE_KEYS.includes(e.code)) this.pauseQueued = true;
          if (NAV_KEYS[e.code]) this.navQueued.push(NAV_KEYS[e.code]);
          const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
          if (m) {
            const d = Number(m[1]);
            if (d >= 1 && d <= 5) this.pickQueued = { slot: 0, index: d - 1 };
            else this.pickQueued = { slot: 1, index: d === 0 ? 4 : d - 6 };
          }
        }
        this.down.add(e.code);
      });
      target.addEventListener("keyup", (e) => this.down.delete(e.code));
      target.addEventListener("blur", () => {
        this.down.clear();
        this.pressed.clear();
      });
    }

    held(codes) {
      return codes.some((c) => this.down.has(c));
    }
    tapped(codes) {
      return codes.some((c) => this.pressed.has(c));
    }

    // Called once per simulation tick. Edge-triggered inputs are consumed here.
    pollP1() {
      const intent = {
        left: this.held(P1_KEYS.left),
        right: this.held(P1_KEYS.right),
        jumpPressed: this.tapped(P1_KEYS.jump),
        downPressed: this.tapped(P1_KEYS.down),
        downHeld: this.held(P1_KEYS.down),
        attackPressed: this.tapped(P1_KEYS.attack),
      };
      this.pressed.clear();
      return intent;
    }

    consumeReset() {
      const r = this.resetQueued;
      this.resetQueued = false;
      return r;
    }

    consumeMenu() {
      const r = this.menuQueued;
      this.menuQueued = false;
      return r;
    }

    consumePause() {
      const r = this.pauseQueued;
      this.pauseQueued = false;
      return r;
    }

    consumeAi() {
      const r = this.aiQueued;
      this.aiQueued = false;
      return r;
    }

    // Returns the menu actions pressed since the last call (oldest first).
    consumeNav() {
      const r = this.navQueued;
      this.navQueued = [];
      return r;
    }

    // Forget key presses that nobody used (menu keys must not leak into the arena as jump/attack).
    clearPresses() {
      this.pressed.clear();
    }

    // Returns { slot, index } (both 0-based) or null.
    consumePick() {
      const p = this.pickQueued;
      this.pickQueued = null;
      return p;
    }
  }

  MW.KeyboardInput = KeyboardInput;
})(globalThis);