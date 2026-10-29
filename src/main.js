// Mechanic Wars - browser entry point: fixed-timestep loop wiring sim, input, renderer.
// Two modes: "select" (character select screen) and "arena" (the fight).
(function () {
  const MW = globalThis.MW;
  const canvas = document.getElementById("game");

  const order = MW.CHARACTER_ORDER;
  const roster = order.map((id) => MW.CHARACTERS[id]);
  const kinds = MW.Bots.KINDS;

  const keyboard = new MW.KeyboardInput(window);
  const touch = MW.TouchInput.supported()
    ? new MW.TouchInput(document.body, {
        characters: roster.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      })
    : null;
  const renderer = new MW.Renderer(canvas, MW.ARENA);
  const select = new MW.SelectScreen(canvas, { roster, kinds });

  let mode = "select"; // "select" | "arena"
  let sim = null; // created when a match starts
  let kindIndex = select.ai; // which opponent AI is active (index into kinds)
  let bot = null; // P2 brain
  let paused = false;

  function setPaused(on) {
    paused = on;
    renderer.paused = on;
    if (touch) touch.setPaused(on);
  }

  if (touch) {
    renderer.helpText = ""; // on-screen controls cover the bottom corners; skip the text hint
    touch.setGameControls(false); // the select screen starts first
  }

  // (Re)create the P2 brain from the chosen kind. Same seed every time, so runs repeat.
  function makeBot() {
    const kind = kinds[kindIndex];
    bot = MW.Bots.create(kind, MW.CONFIG.bots.seed);
    renderer.p2Label = "P2 " + MW.Bots.LABELS[kind];
    if (touch) touch.setAiLabel(MW.Bots.LABELS[kind]);
  }

  function startMatch(choice) {
    const arena = MW.makeArena(); // random platforms; P1 spawns left, P2 right
    sim = new MW.Sim(arena, [roster[choice.p1], roster[choice.p2]]);
    renderer.setArena(arena);
    kindIndex = choice.ai;
    makeBot();
    if (touch) {
      touch.setGameControls(true);
      touch.setSelected(0, roster[choice.p1].id);
      touch.setSelected(1, roster[choice.p2].id);
      touch.setSkills(roster[choice.p1].skills); // slot buttons show the picked character's skills
      touch.poll(); // drop any press left over from the menu
    }
    keyboard.clearPresses();
    select.active = false;
    renderer.randomTheme(); // new random arena for every match
    setPaused(false);
    mode = "arena";
  }

  function openMenu() {
    select.open({
      p1: order.indexOf(sim.fighters[0].stats.id),
      p2: order.indexOf(sim.fighters[1].stats.id),
      ai: kindIndex,
    });
    if (touch) touch.setGameControls(false);
    mode = "select";
  }

  // slot 0 = P1, slot 1 = P2 (opponent). In-arena test picker.
  function pickCharacter(slot, index) {
    if (index < 0 || index >= roster.length) return;
    sim.setCharacter(slot, roster[index]);
    if (touch) {
      touch.setSelected(slot, roster[index].id);
      if (slot === 0) touch.setSkills(roster[index].skills);
    }
  }

  // T = shuffle to a new arena theme on demand
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyT" && mode === "arena") renderer.randomTheme();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "arena" && !paused) setPaused(true);
  });

  const STEP_MS = 1000 / MW.CONFIG.tickRate;
  let last = performance.now();
  let acc = 0;

  // Keyboard and touch both produce the same intent shape; OR them together.
  function pollP1() {
    const k = keyboard.pollP1();
    if (!touch) return k;
    const t = touch.poll();
    return {
      left: k.left || t.left,
      right: k.right || t.right,
      jumpPressed: k.jumpPressed || t.jumpPressed,
      downPressed: k.downPressed || t.downPressed,
      downHeld: k.downHeld || t.downHeld,
      attackPressed: k.attackPressed || t.attackPressed,
      ultPressed: k.ultPressed || t.ultPressed,
      skillPressed: k.skillPressed.map((v, i) => v || t.skillPressed[i]),
    };
  }

  function tick() {
    // Consume every queue each tick (no short-circuiting) so none gets stuck.
    const kReset = keyboard.consumeReset();
    const tReset = touch ? touch.consumeReset() : false;
    const kPick = keyboard.consumePick();
    const tPick = touch ? touch.consumePick() : null;
    const kMenu = keyboard.consumeMenu();
    const tMenu = touch ? touch.consumeMenu() : false;
    const kPause = keyboard.consumePause();
    const tPause = touch ? touch.consumePause() : false;
    const kAi = keyboard.consumeAi();
    const tAi = touch ? touch.consumeAi() : false;
    const nav = keyboard.consumeNav();

    if (mode === "select") {
      if (kPick !== null) select.pick(kPick.slot, kPick.index);
      for (const action of nav) select.nav(action);
      keyboard.clearPresses();
      if (touch) touch.poll();
      const choice = select.consumeStart();
      if (choice) startMatch(choice);
      return;
    }

    if (kMenu || tMenu) {
      openMenu();
      return;
    }
    if (kPause || tPause) setPaused(!paused);
    if (kReset || tReset) {
      const arena = MW.makeArena(); // restart = new platform layout and new scenery
      sim.setArena(arena);
      renderer.setArena(arena);
      makeBot(); // same seed again, so a reset really repeats
      renderer.randomTheme();
      if (paused) setPaused(false);
    }
    if (paused) {
      keyboard.clearPresses();
      if (touch) touch.poll(); // swallow taps made while paused
      return;
    }
    if (kPick !== null) pickCharacter(kPick.slot, kPick.index);
    if (tPick !== null) pickCharacter(tPick.slot, order.indexOf(tPick.id));
    if (kAi || tAi) {
      kindIndex = (kindIndex + 1) % kinds.length;
      makeBot();
    }

    sim.step([pollP1(), bot(sim, 1)]);
  }

  function frame(now) {
    acc += Math.min(now - last, 100); // cap so a background tab doesn't spiral
    last = now;
    while (acc >= STEP_MS) {
      tick();
      acc -= STEP_MS;
    }
    if (mode === "select") select.draw(canvas.getContext("2d"));
    else {
      renderer.draw(sim, acc / STEP_MS);
      if (touch) {
        const me = sim.fighters[0];
        touch.setUltReady(me.manaReady());
        touch.setSkillCooldowns(me.cooldowns, me.stats.skills.map((d) => (d ? d.cooldown : 0)));
      }
    } // alpha: how far we are between the last two ticks
    requestAnimationFrame(frame);
  }

  MW.game = {
    get sim() { return sim; },
    get mode() { return mode; },
    keyboard, touch, renderer, select, roster,
  }; // handy for console debugging
  requestAnimationFrame(frame);
})();
