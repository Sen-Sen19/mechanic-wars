# Mechanic Wars — Character Sprite Layer Audit

Audit target: the uploaded `mechanic_wars(2).zip` project.

## Result

- Reviewed all 11 character render paths: Vanguard, Bloodlust, Artillerist, Void Mage, Marionettist, Fulminar, Errata, Miette, Mochi, Frozen Monarch, and Bulwark.
- All JavaScript source files pass `node --check`.
- Static `save()` / `restore()` call counts match in each character-art source file. This is a useful sanity check, not a proof that every conditional runtime path is balanced.
- The bespoke character files mostly use deliberate manual painter order (rear accessories/limbs first, body next, foreground arm/weapon/face details last). I did not find a defensible reason to reorder those character-specific layers blindly.

## Confirmed issue fixed

### Whole-fighter overlap order was tied to player-array order

`src/render.js` previously painted `sim.fighters` directly in array order. Since that is normally P1 then P2, P2's entire sprite could be painted over P1's entire sprite whenever their silhouettes overlapped, regardless of their interpolated screen-space foot depth.

The render loop now sorts a copy of the fighter list back-to-front using each fighter's interpolated foot Y (`f.y` / `f.py` plus character height). A fighter whose feet are lower on screen is painted later and therefore appears in front. Stable original order is retained for exact depth ties. The simulation array itself is not mutated.

## Character-specific layer review

- **Vanguard** — rear arm/gauntlet and rear cloth are behind legs/body; head and foreground arm/gauntlet are layered later.
- **Bloodlust** — sash trails and rear arm are behind torso/head; front arm, pauldron and blade are foreground elements.
- **Artillerist** — coat tails and rear arm are behind the torso; rifle is drawn before the foreground arm/pauldron and gripping hands.
- **Void Mage** — smoke cloak and shoulder tentacles are behind the body; casting arm/pauldron precede the final astral head pass.
- **Marionettist** — coat tails and rear arm precede the body; raised puppeteering hand is foreground. Puppet/strings intentionally render above both fighters.
- **Fulminar** — ponytail and rear arm are behind the body; front arm/pauldron precede the final head details.
- **Errata** — the completed character is composited as one offscreen image, so glitch distortion does not independently reorder body parts.
- **Miette** — braid and rear arm are behind the body; brush is drawn through both fists, then the fists are redrawn over the handle for the grip; head details are foreground.
- **Mochi** — far ear and backpack are behind the hoodie; near arm/strap, face opening, bangs and near ear are layered forward.
- **Frozen Monarch** — cape, rear hair and rear arm precede the body; front arm and pauldron are drawn before `drawHead()` is actually invoked. The head is therefore on top; the apparent numbered comment order is not the execution order.
- **Bulwark** — rear arm and armor precede the shield; shield is foreground; shield-side pauldron is intentionally drawn over the shield edge.

## Validation run

Passed:
- `tools/smoke_bulwark.js`
- `tools/smoke_fulminar.js`
- `tools/smoke_mochi.js`
- `tools/smoke_miette.js`
- JavaScript syntax check across `src/*.js`

Unrelated pre-existing test issues observed during the audit:
- `smoke_void_mage.js`: two Void Overload gameplay assertions fail; not a sprite-layer assertion.
- `smoke_assassin_fx.js`: two FX event assertions fail; not a sprite-layer assertion.
- `smoke_brawler_fx.js`: two hit-stop/tremble assertions fail; not a sprite-layer assertion.
- `smoke_void_art.js`: test script itself throws while calling `toFixed()` on an undefined value; it does not complete its assertions.

## Important visual limitation

Canvas draw order can be verified statically, but visual correctness of every pose (idle, attack, hitstun, jump, facing left/right) still needs screenshot-based review at runtime. No character-specific layer was changed without a confirmed defect, to avoid damaging intentional overlaps or character silhouettes.
