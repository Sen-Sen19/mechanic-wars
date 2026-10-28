// Runs every smoke suite plus the balance sim and exits non-zero if any fails.
// Usage: node tools/run_all.js
const { spawnSync } = require("child_process");
const path = require("path");
const suites = ["smoke_feel", "smoke_stage1", "smoke_stage2", "smoke_stage3", "smoke_stage4", "smoke_stage5", "balance_sim"];
let failed = 0;
for (const name of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, name + ".js")], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const bad = r.status !== 0 || /^FAIL/m.test(out);
  console.log((bad ? "FAIL  " : "ok    ") + name);
  if (bad) { failed++; console.log(out.split("\n").slice(-12).join("\n")); }
}
console.log(failed ? `\n${failed} suite(s) failed` : "\nAll suites passed.");
process.exit(failed ? 1 : 0);
