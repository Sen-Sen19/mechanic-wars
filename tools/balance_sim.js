// Mechanic Wars - Stage 6 Headless Balance Simulation
// Runs all 25 matchups (5x5 roster) across bot configurations,
// outputs win rates, average match duration, and average TTK (time to kill).
require("../src/config.js");
require("../src/characters.js");
require("../src/arena.js");
require("../src/fighter.js");
require("../src/projectiles.js");
require("../src/sim.js");
require("../src/bots.js");

const MW = globalThis.MW;
const ORDER = MW.CHARACTER_ORDER;
const CHARS = MW.CHARACTERS;

// Run with full bot speed scale for true balance benchmarking
MW.CONFIG.bots.speedScale = 1.0;

function runMatch(p1Id, p2Id, b1Kind, b2Kind, maxTicks = 3600, seed = 1337) {
  const c1 = CHARS[p1Id];
  const c2 = CHARS[p2Id];
  const sim = new MW.Sim(MW.ARENA, [c1, c2]);
  const b1 = MW.Bots.create(b1Kind, seed);
  const b2 = MW.Bots.create(b2Kind, seed + 1000);

  let p1KOs = 0;
  let p2KOs = 0;
  let firstKoTick = null;

  for (let t = 0; t < maxTicks; t++) {
    const prevK0 = sim.kills[0];
    const prevK1 = sim.kills[1];

    sim.step([b1(sim, 0), b2(sim, 1)]);

    if (sim.kills[0] > prevK0) {
      p1KOs++;
      if (firstKoTick === null) firstKoTick = t;
    }
    if (sim.kills[1] > prevK1) {
      p2KOs++;
      if (firstKoTick === null) firstKoTick = t;
    }
  }

  return {
    p1KOs,
    p2KOs,
    totalKOs: p1KOs + p2KOs,
    firstKoTick: firstKoTick || maxTicks,
    hp1: sim.fighters[0].hp,
    hp2: sim.fighters[1].hp,
  };
}

function runBalanceSuite() {
  console.log("===============================================================");
  console.log("    MECHANIC WARS - STAGE 6 BALANCE BENCHMARK SUITE");
  console.log("===============================================================\n");

  const results = {};
  const stats = {};
  for (const id of ORDER) {
    stats[id] = { wins: 0, losses: 0, draws: 0, totalKOs: 0, kosTaken: 0, ttkTicks: [] };
  }

  // 1. Matrix: Aggressive vs Spacing (and both symmetric) across multiple seeds
  const SEEDS = [101, 202, 303, 404];
  const botPairs = [
    ["aggressive", "aggressive"],
    ["aggressive", "spacing"],
    ["spacing", "aggressive"],
    ["spacing", "spacing"]
  ];

  console.log("Running 25 matchups across " + (SEEDS.length * botPairs.length) + " iterations each...\n");

  for (const p1 of ORDER) {
    results[p1] = {};
    for (const p2 of ORDER) {
      let p1Wins = 0;
      let p2Wins = 0;
      let draws = 0;
      let totalKOsP1 = 0;
      let totalKOsP2 = 0;
      let ttkList = [];

      for (const seed of SEEDS) {
        for (const [b1, b2] of botPairs) {
          const res = runMatch(p1, p2, b1, b2, 2400, seed); // 40s matches
          totalKOsP1 += res.p1KOs;
          totalKOsP2 += res.p2KOs;
          if (res.firstKoTick < 2400) ttkList.push(res.firstKoTick);

          if (res.p1KOs > res.p2KOs) p1Wins++;
          else if (res.p2KOs > res.p1KOs) p2Wins++;
          else {
            if (res.hp1 > res.hp2) p1Wins++;
            else if (res.hp2 > res.hp1) p2Wins++;
            else draws++;
          }
        }
      }

      const totalMatches = p1Wins + p2Wins + draws;
      const winRate = ((p1Wins / totalMatches) * 100).toFixed(1);
      results[p1][p2] = { p1Wins, p2Wins, draws, winRate, totalKOsP1, totalKOsP2 };

      stats[p1].wins += p1Wins;
      stats[p1].losses += p2Wins;
      stats[p1].draws += draws;
      stats[p1].totalKOs += totalKOsP1;
      stats[p1].kosTaken += totalKOsP2;
      stats[p1].ttkTicks.push(...ttkList);
    }
  }

  // Print Matchup Matrix (Row vs Column: Row's Win Rate %)
  console.log("MATCHUP WIN RATE MATRIX (Row vs Column % win rate):");
  let header = "         ";
  for (const col of ORDER) header += col.toUpperCase().padEnd(10);
  console.log(header);
  console.log("-".repeat(60));

  for (const row of ORDER) {
    let line = row.toUpperCase().padEnd(9);
    for (const col of ORDER) {
      const wr = results[row][col].winRate + "%";
      line += wr.padEnd(10);
    }
    console.log(line);
  }

  console.log("\n---------------------------------------------------------------");
  console.log("OVERALL CHARACTER PERFORMANCE SUMMARY:");
  console.log("---------------------------------------------------------------");
  console.log("NAME       WIN%     W - L - D     K/D RATIO   AVG TTK (sec)");
  console.log("---------------------------------------------------------------");

  for (const id of ORDER) {
    const s = stats[id];
    const total = s.wins + s.losses + s.draws;
    const winPct = ((s.wins / total) * 100).toFixed(1) + "%";
    const kd = s.kosTaken > 0 ? (s.totalKOs / s.kosTaken).toFixed(2) : s.totalKOs.toFixed(2);
    const avgTTKTicks = s.ttkTicks.length > 0 ? s.ttkTicks.reduce((a, b) => a + b, 0) / s.ttkTicks.length : 0;
    const avgTTKSec = (avgTTKTicks / 60).toFixed(1) + "s";
    const record = `${s.wins} - ${s.losses} - ${s.draws}`;

    console.log(
      id.toUpperCase().padEnd(10) +
      winPct.padEnd(9) +
      record.padEnd(14) +
      kd.padEnd(12) +
      avgTTKSec
    );
  }

  console.log("===============================================================\n");
  return { stats, results };
}

if (require.main === module) {
  runBalanceSuite();
}

module.exports = { runBalanceSuite, runMatch };

