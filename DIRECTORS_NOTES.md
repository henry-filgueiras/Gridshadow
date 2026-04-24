# DIRECTORS_NOTES

Living design doc. **Current Canon** is the present-state truth — edit in place.
**Resolved Dragons and Pivots** is append-only; once written, entries are not edited.

When a fact stops being true in Canon, move the old text **verbatim** into the
archive with a new dated entry that supersedes it.

---

## Current Canon

### Stage
Reveal / flag / breach / clear loop under a finite **witness charge** budget,
with **Witness Confirmation** (chord) for inference-rewarded claims, the
**Witness Probe** (line scan) as the first structural-scan instrument,
a bounded **probe history** ledger that preserves recent readings, and
**contradiction highlighting** — a proof-only truth layer that marks any
resolved numbered tile whose local flag/unresolved counts make its
constraint impossible to satisfy. Tiles are `unresolved | resolved |
flagged`, the run phase is `active | breached | cleared`, the player has
a finite pool of direct observations, they can ask *about a region* rather
than a tile, they can look back at the last several such questions without
a paper notebook, and the field now visibly refuses to host impossibilities.
The core identity pivot — "spend certainty to make claims *or* to ask a
better question, and the field tells you when your reading cannot be
true" — is expressed end-to-end in the rules. Next substantive foundation
decisions: a deterministic replay buffer keyed off the action log, a
headless test harness, and the second probe geometry (row/column signature
or rectangular scan) once we have one structural instrument in players'
hands to calibrate against. Still foundation work — not progression,
metagame, or content.

### Stack
* **Language:** TypeScript (strict, `verbatimModuleSyntax`).
* **Build:** Vite 5, target ES2022.
* **UI:** React 18, StrictMode on. React only renders the HUD and the host div
  for Pixi. It is not the game rendering surface.
* **Rendering:** PixiJS v8. One `Application` per `GameView` mount; one
  `BoardRenderer` per app.
* **PRNG:** in-house mulberry32 (`src/engine/rng.ts`). FNV-1a for string→int
  seed hashing. Nothing in `engine/` may call `Math.random`, `Date.now`,
  `performance.now`, or touch the DOM.
* **Deploy:** GitHub Actions → Pages. `GITHUB_PAGES=true` at build time flips
  Vite's `base` to `/Gridshadow/`.

### Layering invariants
These are load-bearing. Do not violate without an explicit pivot entry below.

1. `src/engine/` is pure TypeScript. It must not import from `src/render/`,
   `src/ui/`, `react`, `react-dom`, or `pixi.js`.
2. `src/render/` consumes engine state snapshots and emits pointer intent via a
   callback interface. It does not mutate engine state.
3. `src/ui/` dispatches engine actions through `reduceGame`. It does not mutate
   engine state directly and does not call into `src/render/` internals.
4. `src/types/` holds the shared contract types (Board, Tile, GameState).
   Engine owns their shapes; render and UI are consumers.

The reason for all four: we want an authoritative-host multiplayer variant,
deterministic replays, and headless test harnesses to be possible later without
rewriting the rules. Every shortcut across these boundaries buys a future
excavation bill.

### Engine surface (current)
* `createGameState(config: BoardConfig): GameState` — produces an `active`
  phase with `witness.charge = witness.max = config.witnessCharges`,
  `witness.confirms = 0`, and `probeHistory = []`.
* `reduceGame(state, action): GameState` where action is one of
  `hover | hoverClear | reveal | flag | confirm | probe | regen`. Pure.
* `generateBoard(config)`: deterministic from
  `{width, height, mineCount, seed}`. `witnessCharges` is a gameplay-budget
  input that does not affect board generation — the board is the same under
  any charge count for a given seed.
* `tallyTiles(state): TileTally` — pure derivation of
  unresolved / resolved / flagged counts, for HUD and future observers.
* `witnessStatus(state): 'steady' | 'low' | 'exhausted'` — thresholded
  selector used by the HUD so urgency thresholds live in one place. Low is
  charge ≤ 3 OR charge ≤ 25% of max (absolute floor beats ratio as max
  shrinks); exhausted is charge === 0.
* `reveal` and `confirm` are the only actions that can change `phase`. A
  mine reveal — whether by a direct `reveal` or by a chord-triggered reveal
  of a wrongly-flagged neighbor — transitions to `{ kind: 'breached', at }`.
  A safe action that leaves every non-hazard tile `resolved` transitions to
  `{ kind: 'cleared' }`. Breach takes priority: if a single action could
  trigger both, breach wins — clear is only evaluated on the non-breach
  branch. Flag state is irrelevant to clear detection — flags are player
  commitments, not the truth source. `reveal`, `flag`, and `confirm` are
  all no-ops while breached or cleared; `regen` resets phase to `active`
  and refills charge to max.
* Reveal cascades: revealing a tile with `adjacentMines === 0` floods through
  connected zero-adjacency tiles, revealing their numbered borders too.
  Flagged tiles stop propagation. The cascade core lives in a private
  `revealAt(tiles, w, h, x, y)` helper shared by `reveal` and `confirm` so
  the two paths can't diverge.
* **Witness charge**: a finite integer budget in `GameState.witness`. Each
  effectful direct reveal consumes 1 charge; cascade expansion, flagging,
  confirmation, and denied actions are free. When charge reaches 0, `reveal`
  becomes a no-op; `confirm` remains available — the game continues through
  inference and claim-making. No passive regen, no shops, no batteries.
  Default budget: 12 charges on a 16×16, 40-hazard field.
* **Witness Confirmation (chord)**: `confirm` targets a resolved numbered
  tile. If the count of adjacent flags equals `tile.adjacentMines` AND at
  least one adjacent unresolved, unflagged neighbor exists, every such
  neighbor is revealed (using the same cascade core as `reveal`). If any
  revealed neighbor is a mine the run breaches at that neighbor; otherwise
  the confirmation is successful — `witness.charge` is incremented by 1
  (capped at `max`) and `witness.confirms` increments by 1. Refused
  confirmations (wrong tile state, zero adjacency, flag-count mismatch,
  no unresolved neighbors, breached phase) do not change state.
* **Witness Probe (line scan)**: `probe` targets an unresolved tile with an
  `orientation: 'horizontal' | 'vertical'`. The instrument scans a 5-cell
  line centered on the target (clipped to board bounds), counts all mines
  in the segment, and — on success — prepends a `ProbeReading` to
  `state.probeHistory` (newest first, capped at 8). It does **not** reveal
  which cells are hazards — the instrument buys *structure*, not certainty.
  Cost: 2 witness charge, on acceptance only. Anti-collapse rule: refused
  unless the segment contains at least 3 truly-`unresolved` cells (flagged
  and resolved do not count toward the threshold), which prevents the probe
  from degenerating into an expensive single-tile reveal when all but one
  cell is already known. Tile state is untouched — the board's truth is
  the same before and after; only the player's knowledge grows. Tunables
  (`PROBE_TUNABLES.length | cost | minUnresolved | historyLimit`) live at
  engine file scope and are re-exported so HUD copy reads from the same
  source as the reducer.
* **Probe history (memory prosthetic)**: `state.probeHistory` is a
  bounded, newest-first ledger of successful probes, owned by the engine.
  A ninth probe evicts the tail entry deterministically; `regen` clears
  the ledger alongside the rest of run state. The HUD renders the ledger
  in a dedicated **witness probe history** block; hovering a row
  re-highlights that probe's exact cells on the board using the same
  inset-cyan outline as the live probe preview. Hover is UI-only state
  — the renderer reads `historyHighlight` through its per-frame overlay,
  not through engine state — so replays of a given action log produce
  identical engine state regardless of which rows the player hovered.
* **Contradiction selector**: `detectContradictions(state):
  ReadonlyArray<Contradiction>` lives in `src/engine/contradiction.ts`
  and is re-exported from the engine barrel. Pure derivation: for every
  resolved numbered tile, counts flagged and unresolved Moore neighbors
  and flags any tile where `adjacentFlags > adjacentConstraint`
  (over-flag) or `adjacentFlags + adjacentUnresolved < adjacentConstraint`
  (under-space). Truth only — no probability, no "recommended move", no
  auto-fix, no multi-tile SAT-style inference. Suppressed in terminal
  phases: breached fields already highlight mis-flags; cleared fields
  cannot carry a contradiction by construction (every safe tile is
  resolved, so every remaining flag is necessarily a hazard). The
  selector is the single authority — HUD count and renderer halos both
  consume its output, neither recomputes.
* First-click safety is intentionally NOT implemented: the seed fully
  determines the board, so the first reveal can legitimately detonate.
  The player learning to read the field is the game.

### What the visual proof does
16×16 interactive grid with the full reveal / flag / confirm / probe loop
under a witness budget:
* left-click on an unresolved tile resolves it and spends 1 witness charge;
  zero-adjacency regions flood-reveal for free; reveals with zero charge
  are refused
* left-click on a resolved numbered tile *or* middle-click anywhere
  dispatches `confirm` — the engine validates the flag-match condition and
  reveals the remaining unflagged neighbors as a group
* right-click toggles a flag — always free
* `h` arms a horizontal probe, `v` arms a vertical probe, pressing either
  again (or `Esc`) disarms; while armed, the hovered 5-cell segment is
  outlined in cyan, hover highlight is suppressed, and left-click on the
  center spends 2 charge to return the segment's total hazard count
  (no per-tile truth revealed); the HUD's **witness probe history** block
  lists the recent successful probes (newest first, up to 8 entries) with
  orientation / coord / hazards / scanned-cell count; hovering a row
  re-highlights that probe's exact segment on the board using the same
  inset cyan outline as the live preview
* a safe confirmation restores +1 charge (capped at max) and triggers a
  brief "witness confirmed · integrity restored" pill in the HUD, keyed
  off `witness.confirms` incrementing
* a confirmation with wrong flags breaches naturally through a revealed
  hazard — same breach path as a direct reveal
* revealing a hazard transitions phase to `breached`, renders remaining hazards
  (render-only — engine leaves them `unresolved`), tints mis-flagged tiles red,
  and disables further pointer actions
* resolving the last non-hazard tile transitions phase to `cleared`, renders
  remaining hazards in a dormant cyan (also render-only — engine leaves them
  `unresolved`), recolors the stabilized field in a quiet cyan wash, and
  disables further pointer actions
* resolved numbered tiles whose local flag / unresolved counts make their
  constraint provably impossible gain a pulsing red halo drawn on a
  dedicated Pixi layer above the tile grid; the HUD surfaces the same
  count (pulsing red when nonzero), both driven by the single
  `detectContradictions` engine selector
* HUD shows witness charge with a meter and tiered coloring
  (steady → low at ≤25% or ≤3 remaining → exhausted at 0), confirmation
  count, contradiction count (pulsing red when nonzero), seed, field
  dims, hazard count, tile tallies, cursor, phase (`active | breached |
  stabilized`), and a breach or stabilization banner as applicable
  (the stabilization banner reads "field stabilized · witness protocol
  complete")
* reseed regenerates a fresh active board, refills charge to max, and
  resets confirms to 0

### Per-exchange process (from CLAUDE.md)
1. Update this file.
2. Commit the work + notes update together. Small intermediate commits fine.
3. Do **not** `git push`.

---

## Resolved Dragons and Pivots

### 2026-04-23 — Claude Opus 4.7
Initial substrate pass. Scaffolded Vite + React + PixiJS + TypeScript with a
hard engine/render/ui separation. Chose npm (pnpm not installed locally) but
layout is pnpm-compatible — only the lockfile differs. Chose PixiJS v8 over v7:
v8's chainable `Graphics` API and `Application.init()` promise model are
cleaner, and v8 is the current stable line. Chose React 18 over 19: 19 would
work, but 18 has the most predictable StrictMode double-invoke behavior for
the Pixi init effect, which matters because Pixi init is async and we need the
cleanup path to be well-understood.

Chose to compute `adjacentMines` in board generation even though reveal logic
isn't implemented. Rationale: adjacency is intrinsic to the board, not to
gameplay state, so it belongs with generation. Precomputing it now also
validates that the engine layer can do non-trivial deterministic computation
before any gameplay is built.

Deploy base path is gated on `GITHUB_PAGES=true` rather than `import.meta.env.PROD`
so that `npm run preview` (which is PROD) still works at `/` locally. The CI
workflow sets the env var; nothing else does.

### 2026-04-23 — Claude Opus 4.7
Fixed StrictMode × Pixi-v8-async-init bug in `GameView.tsx`. Symptom: a
user reported a blank page on first run. Root cause: React 18 StrictMode
double-invokes `useEffect`, so the first-run cleanup was calling
`app.destroy(true, ...)` on an Application whose `init()` promise had not
resolved yet. In Pixi v8, `Application.destroy()` touches `this.stage` and
`this.renderer`, which are only populated by `init()` — so cleanup threw a
TypeError, which React swallowed but which left the mount sequence in a
bad state.

Fix: track init completion via a local `app` variable that is only assigned
*after* `await instance.init(...)`. If cancellation happens mid-init, the
async path itself tears down the instance once init resolves. Cleanup only
destroys when `app` is non-null. Also paint once immediately on first
successful init so the first frame doesn't wait on the state-effect tick.

### 2026-04-23 — Claude Opus 4.7 (reveal/flag/breach loop)
Implemented reveal, flag, and deterministic breach in the engine. Demoted
three Canon sections that described the pre-reveal substrate. Verbatim:

**Superseded — Stage:**
> Substrate only. No gameplay. The next substantive design decisions should be
> about reveal semantics, information economy, and the cascading-failure model —
> not about rendering, build, or deploy.

**Superseded — Engine surface (current):**
> * `createGameState(config: BoardConfig): GameState`
> * `reduceGame(state, action): GameState` where action is one of
>   `hover | hoverClear | select | regen`.
> * `generateBoard(config)`: deterministic from `{width, height, mineCount, seed}`.
>   Computes `isMine` and `adjacentMines`. No reveal/flag/win/loss logic yet.

**Superseded — What the visual proof does:**
> 16×16 interactive grid. Hover, tile selection (toggle), deterministic reseed
> via the HUD. That is the entire gameplay surface. Everything else is
> intentionally absent.

Design notes for this pass:
- Tile states renamed `hidden | revealed | flagged` → `unresolved | resolved |
  flagged`. The old names were industry-standard; the new names bias toward
  Witness Protocol identity (operator reading a constraint field, not
  "uncovering squares") at zero runtime cost. Doing this rename now is
  cheaper than after dozens of call sites exist.
- Added `phase: { kind: 'active' } | { kind: 'breached', at: Coord }` as a
  tagged union. Keeps the failure coordinate scoped to the only kind that
  needs it, and exhaustiveness-checks cleanly in the reducer and renderer.
- Dropped the `select` action and `selection` coord from the previous pass.
  Reveal/flag supersede them; the interactivity proof they provided is now
  carried by reveal itself.
- First-click safety deliberately omitted. Classic Minesweeper relocates
  mines on first click to guarantee a safe opener, but that mutates the
  seed→board mapping — the same seed could produce different boards
  depending on click order. Witness Protocol's identity depends on the
  field being truth, not negotiation. Seed in, board out, first click
  included.
- Cascade flood is a BFS with an array + index pointer (no `shift()`, which
  would be O(n²)). Flagged tiles stop propagation. Numbered border tiles
  are revealed but don't extend the flood.
- "Reveal all remaining mines on breach" is a render-only concern. Engine
  state leaves non-detonated mines as `unresolved`, so a future replay or
  audit feature can still distinguish `detonated` (the `breached.at` tile)
  from `merely-exposed-by-ui`. Don't conflate presentation with truth.
- Text glyphs on tiles use Pixi v8's canvas-backed `Text`. 256 instances
  created eagerly in `rebuildBoard`. Per-tile texture regen happens only
  when `text.text` or `style.fill` actually changes — cheap steady state.
- Right-click is routed through Pixi's `pointerdown` using `event.button === 2`.
  The React host div suppresses the browser context menu via
  `onContextMenu={(e) => e.preventDefault()}`; without that, Chrome's menu
  fires before Pixi's handler and swallows the intent.
- `tallyTiles` lives in `src/engine/selectors.ts`. Deriving counts from the
  tiles array is O(total tiles) — cheap at 16×16, and cheap enough to
  stay derived rather than stored even at much larger grids. Keeping counts
  derived avoids state-shape bloat and the inevitable sync bugs.
- Removed `selection` from `GameState`. Kept `cursor` — it feeds the hover
  visual and is likely to be reused for future tooltip / constraint-preview
  overlays. Visual hover is suppressed while breached because the field is
  no longer interactive.

Explicitly deferred: win detection, chord (simultaneous-button or
modifier-click to auto-reveal satisfied neighborhoods), an information-
budget resource, a replay buffer keyed off dispatched actions, unit tests.
Chord and win are the obvious next foundation items; testing should come in
once a test runner is added (deferred to keep this pass's toolchain
surface unchanged).

### 2026-04-23 — Claude Opus 4.7 (witness budget v1)
First identity-defining pass: direct reveals are now paid for out of a
finite **witness charge** pool. This moves the game off the
"click every square eventually" default and into "where is certainty worth
spending?" — the thesis for Witness Protocol. Demoted three Canon sections.
Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach loop implemented. The board speaks Minesweeper with
> Witness Protocol vocabulary: tiles are `unresolved | resolved | flagged`,
> and the run phase is `active` or `breached`. Next substantive foundation
> decisions: win condition (full resolution without breach), chord
> interactions, and an information-budget system. Still foundation work —
> not progression, metagame, or content.

**Superseded — Engine surface (current):**
> * `createGameState(config: BoardConfig): GameState` — produces an `active` phase.
> * `reduceGame(state, action): GameState` where action is one of
>   `hover | hoverClear | reveal | flag | regen`. Pure.
> * `generateBoard(config)`: deterministic from `{width, height, mineCount, seed}`.
>   Computes `isMine` and `adjacentMines`.
> * `tallyTiles(state): TileTally` — pure derivation of
>   unresolved / resolved / flagged counts, for HUD and future observers.
> * `reveal` is the only action that can change `phase`: revealing a mine
>   transitions to `{ kind: 'breached', at }`. Both `reveal` and `flag` are
>   no-ops while breached; `regen` resets phase to `active`.
> * Reveal cascades: revealing a tile with `adjacentMines === 0` floods through
>   connected zero-adjacency tiles, revealing their numbered borders too.
>   Flagged tiles stop propagation.
> * First-click safety is intentionally NOT implemented: the seed fully
>   determines the board, so the first reveal can legitimately detonate.
>   The player learning to read the field is the game.

**Superseded — What the visual proof does:**
> 16×16 interactive grid with the full reveal/flag loop:
> * left-click resolves a tile; zero-adjacency regions flood-reveal
> * right-click toggles a flag (browser context menu is suppressed over the board)
> * revealing a hazard transitions phase to `breached`, renders remaining hazards
>   (render-only — engine leaves them `unresolved`), tints mis-flagged tiles red,
>   and disables further pointer actions
> * HUD shows seed, field dims, hazard count, tile tallies, cursor, phase,
>   and a breach banner when applicable
> * reseed regenerates a fresh active board from a new seed

Design notes for this pass:
- `witnessCharges` sits on `BoardConfig`, not outside it. A run is defined
  by its seed **and** its starting budget together, so the full
  `{ seed → starting state }` mapping remains pure. `regen` carries the
  existing config forward, so reseeding refills charge the same way every
  time. Different budgets produce different runs on the same seed — that is
  a deliberate degree of freedom for future difficulty presets, not a
  determinism leak.
- `WitnessState` stores both `charge` and `max`. Keeping `max` in state
  rather than rederiving from `config.witnessCharges` is slightly redundant
  today, but cheap and forward-compatible: if a later pass ever lets max
  change mid-run (e.g., a permanent penalty on a risky action), consumers
  won't silently read the wrong capacity. Today the two values are
  synchronized at `createGameState` and never touched again.
- Charge is spent in `revealTile` **after** every early-return guard. A
  reveal that is refused — wrong tile state, breached phase, zero charge —
  costs nothing. This is load-bearing: if a mis-click on a flagged tile
  burned a charge, the UX cost would dwarf the design goal. The rule is
  "charge pays for observations the engine actually performs," not
  "charge pays for input events."
- Cascade flood stays free. The charge bought the observation that made the
  flood inevitable, and making each auto-revealed cell cost extra would
  just punish the player for boards the seed generated generously. The
  design intent is to make *choosing* to observe expensive, not to make
  observation itself expensive.
- Zero-charge state is a **soft** deny — `reveal` becomes a no-op, but
  `flag`, `hoverClear`, and `regen` all still work. The run continues, and
  the player finishes through inference and deliberate risk (flagging is
  how you commit to a read, and the run ends only on breach). No timeout,
  no forced loss — the budget failing is a *pressure*, not a termination.
- `witnessStatus` selector centralizes the "low / exhausted" thresholds.
  The HUD consumes the tier, not the raw numbers, so future surfaces (an
  audio cue, a board-edge glow, an accessibility ARIA announcement) can
  agree on urgency without re-deriving. Thresholds chosen: low at
  `charge ≤ 3 || charge * 4 ≤ max`, exhausted at `charge === 0`. The
  absolute floor of 3 matters as max shrinks — at low budgets, a pure
  ratio would trigger "low" only in the final charge, which is already
  exhausted.
- HUD placement: witness panel is the **first** block below the title,
  above seed/field/hazards. The player's attention during a decision is on
  "can I afford this?", not on board metadata. CSS uses tier classes
  (`hud-witness-steady|low|exhausted`) so the urgency change is purely
  visual; the DOM structure doesn't branch. Exhausted state pulses via a
  CSS keyframe — the one concession to motion, and only because a static
  red panel reads as an error state rather than a live condition.
- Deliberately held back: no visual charge indicator *on* the board (no
  per-tile cost preview, no cursor badge). The HUD is one glance away; a
  reticle-level overlay would cross into the "arcade juice" the brief
  asked to avoid. If a future pass shows variable-cost reveals (peek vs.
  full resolve), the cost display will need to move closer to the cursor —
  but v1 has one cost, and stating it once in the HUD is enough.

Explicitly deferred (carried forward, with the budget resource now
resolved): win detection, chord, a replay buffer keyed off dispatched
actions, unit tests, variable-cost observations (peek, constraint probe,
hazard bloom), and any regen / shop / battery mechanic. The brief was
explicit on the last set: scarcity only, no relief mechanic yet.

### 2026-04-23 — Claude Opus 4.7 (witness confirmation + confidence restore)
Added the Witness Confirmation action (chord) and a proof-gated charge
restoration. This closes the v1 identity loop: charge forces restraint,
flagging commits to a read, confirmation ratifies that read, successful
confirmations restore a small amount of trust. "Proof restores trust, not
guesses." Demoted three Canon sections. Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach loop implemented on top of a finite **witness charge**
> budget. The board speaks Minesweeper with Witness Protocol vocabulary: tiles
> are `unresolved | resolved | flagged`, the run phase is `active` or
> `breached`, and the player has a finite pool of direct observations. The
> identity pivot — "information is a resource" — is now expressed in the
> rules, not just the skin. Next substantive foundation decisions: win
> condition (full resolution without breach), chord interactions, and the
> first honest inference-assist primitive. Still foundation work — not
> progression, metagame, or content.

**Superseded — Engine surface (current):**
> * `createGameState(config: BoardConfig): GameState` — produces an `active`
>   phase with `witness.charge = witness.max = config.witnessCharges`.
> * `reduceGame(state, action): GameState` where action is one of
>   `hover | hoverClear | reveal | flag | regen`. Pure.
> * `generateBoard(config)`: deterministic from
>   `{width, height, mineCount, seed}`. `witnessCharges` is a gameplay-budget
>   input that does not affect board generation — the board is the same under
>   any charge count for a given seed.
> * `tallyTiles(state): TileTally` — pure derivation of
>   unresolved / resolved / flagged counts, for HUD and future observers.
> * `witnessStatus(state): 'steady' | 'low' | 'exhausted'` — thresholded
>   selector used by the HUD so urgency thresholds live in one place. Low is
>   charge ≤ 3 OR charge ≤ 25% of max (absolute floor beats ratio as max
>   shrinks); exhausted is charge === 0.
> * `reveal` is the only action that can change `phase`: revealing a mine
>   transitions to `{ kind: 'breached', at }`. Both `reveal` and `flag` are
>   no-ops while breached; `regen` resets phase to `active` and refills
>   charge to max.
> * Reveal cascades: revealing a tile with `adjacentMines === 0` floods through
>   connected zero-adjacency tiles, revealing their numbered borders too.
>   Flagged tiles stop propagation.
> * **Witness charge**: a finite integer budget in `GameState.witness`. Each
>   effectful direct reveal consumes 1 charge; cascade expansion, flagging,
>   and denied reveals (wrong state / breached / zero charge) are free. When
>   charge reaches 0, `reveal` becomes a no-op — the player must continue by
>   inference, flagging, or deliberate risk. No regen, no shops, no batteries.
>   Default budget: 12 charges on a 16×16, 40-hazard field.
> * First-click safety is intentionally NOT implemented: the seed fully
>   determines the board, so the first reveal can legitimately detonate.
>   The player learning to read the field is the game.

**Superseded — What the visual proof does:**
> 16×16 interactive grid with the full reveal/flag loop under a witness budget:
> * left-click resolves a tile and spends 1 witness charge; zero-adjacency
>   regions flood-reveal for free; reveals with zero charge are refused
> * right-click toggles a flag — always free
> * revealing a hazard transitions phase to `breached`, renders remaining hazards
>   (render-only — engine leaves them `unresolved`), tints mis-flagged tiles red,
>   and disables further pointer actions
> * HUD shows witness charge with a meter and tiered coloring
>   (steady → low at ≤25% or ≤3 remaining → exhausted at 0), seed, field dims,
>   hazard count, tile tallies, cursor, phase, and a breach banner when applicable
> * reseed regenerates a fresh active board and refills charge to max

Design notes for this pass:
- Confirm is its own action (`{ type: 'confirm', x, y }`), not a parameter
  to `reveal`. Reasons: a replay log of `[reveal, reveal, flag, confirm,
  flag, confirm, …]` tells a cleaner story than if they were conflated;
  the cost model differs (reveal consumes, confirm restores); and the
  refusal conditions are different enough that a single reducer path would
  have become a dispatch inside a dispatch.
- Reveal and confirm share a private `revealAt(tiles, w, h, x, y) →
  detonated` helper. Before this pass, cascade BFS lived inside
  `revealTile`. Pulling it out was the prerequisite for chord: confirm
  needs to reveal *n* neighbors as a batch, and I was not willing to
  re-implement the flood. Keeping a single cascade core also eliminates
  the class of bugs where chord's reveal path would drift from direct
  reveal's (one famous Minesweeper clone had chord-revealed zeros that
  didn't flood — this architecture prevents that).
- **Chord costs nothing but restores on success.** This is the central
  economy. Confirmation is not a reveal action — it's a *claim*. The
  player isn't paying to look; they're paying earlier (flagging costs
  attention; direct reveals cost charge) and then, at the moment of
  ratification, the protocol either detonates (your read was wrong) or
  returns a small amount of trust (your read was right). The design
  explicitly does not reward flag placement or guess-clicks; it rewards
  the specific act of staking a conclusion that turns out correct.
- Restoration is **+1 capped**, not proportional. A larger or scaling
  reward would turn confirmation into the dominant loop — players would
  chord-farm for charge. +1 per confirmation is enough to extend a
  difficult run, not enough to make confirmation the primary economy.
  Cap at `max` ensures restoration can't exceed the starting budget; if
  a future pass introduces variable max (e.g. a hard-mode penalty that
  burns a slot), the cap will correctly follow.
- "Meaningful safe resolution" gate: if flags match but all unflagged
  neighbors are already resolved (common after a wide cascade into a
  numbered border), the action is a no-op — no state change, no counter
  increment, no restoration. Rewarding confirmations that *do nothing*
  would be gamification; the brief explicitly asked to reward demonstrated
  inference, not theatrics.
- Wrong-flag confirmation breaches on the first mine the chord reveals,
  not all of them. Once phase is `breached`, subsequent tile reveals in
  the same action are short-circuited — the action stops, the breach
  coordinate is the first detonation, and the player sees the single
  point where their read diverged. Revealing every mine on a bad chord
  would hide that information under a rug of red.
- `witness.confirms` is a monotonic counter on engine state, not a
  one-shot flag. The HUD reads the counter, remembers the prior value in
  a ref, and flashes when it increments — the flash itself is UI state
  (a `setTimeout`-driven boolean), so nothing about presentation leaks
  into the deterministic replay. A counter was cleaner than a "last
  event" field because it has no "clear" path and it also gives us a
  free run stat for later analytics.
- Input routing: left-click on a resolved numbered tile is routed as
  `confirm`, left-click on an unresolved tile as `reveal`. Middle-click
  always sends `confirm` as an explicit ritual input. Renderer peeks at
  `this.currentBoard` to decide; this is *observational* (reading a
  state snapshot it already owns), not *authorial* (it's not deciding
  outcomes — the engine still validates). Classic left+right-simultaneous
  chord is not implemented; middle-click + auto-chord cover the two
  mental models players arrive with.
- HUD hint text lists the four interactions as operational instructions:
  resolve / flag / confirm-when-match / successful-confirm-restores. This
  is the minimum language to make the economy self-teaching on a fresh
  run. No tutorial; no modal.

Explicitly deferred: win detection, left+right simultaneous chord,
variable-cost observations (peek, constraint probe, hazard bloom),
replay buffer keyed off the action log, unit tests, any progression
or metagame system. The brief continues to forbid shops, batteries,
passive regen, inventory, backend, multiplayer, and campaign systems —
still no cathedral.

### 2026-04-23 — Claude Opus 4.7 (terminal clear state)
Bug report: a 16×16 board with 40 hazards reached 216 resolved / 0
unresolved with `phase: active` — no win detection existed. This was not
an accounting bug; it was a missing success phase. Added `cleared` as a
terminal phase alongside `breached`, wired clear detection into the reveal
and confirm paths, and surfaced the state in the HUD and renderer. Demoted
three Canon sections. Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach loop under a finite **witness charge** budget, with
> **Witness Confirmation** (chord) as the first inference-rewarded action.
> Tiles are `unresolved | resolved | flagged`, the run phase is `active` or
> `breached`, and the player has a finite pool of direct observations that a
> successful confirmation can partially restore. The core identity loop —
> "spend certainty to make claims, restore trust through proof" — is now
> playable end-to-end. Next substantive foundation decisions: win condition
> (full resolution without breach), first non-chord inference primitive
> (e.g. a cheaper partial-information "probe"), and a deterministic replay
> buffer keyed off the action log. Still foundation work — not progression,
> metagame, or content.

**Superseded — Engine surface bullet (phase transitions):**
> * `reveal` and `confirm` are the only actions that can change `phase`: a
>   mine reveal — whether by a direct `reveal` or by a chord-triggered reveal
>   of a wrongly-flagged neighbor — transitions to `{ kind: 'breached', at }`.
>   `reveal`, `flag`, and `confirm` are all no-ops while breached; `regen`
>   resets phase to `active` and refills charge to max.

**Superseded — Visual-proof tail:**
> * revealing a hazard transitions phase to `breached`, renders remaining hazards
>   (render-only — engine leaves them `unresolved`), tints mis-flagged tiles red,
>   and disables further pointer actions
> * HUD shows witness charge with a meter and tiered coloring
>   (steady → low at ≤25% or ≤3 remaining → exhausted at 0), confirmation
>   count, seed, field dims, hazard count, tile tallies, cursor, phase, and
>   a breach banner when applicable
> * reseed regenerates a fresh active board, refills charge to max, and
>   resets confirms to 0

Design notes for this pass:
- Clear-condition rule: `every tile t where !t.isMine has t.state === 'resolved'`.
  Flags are irrelevant. This is load-bearing: flags are player commitments,
  not the truth source, so a win condition that required "all mines flagged"
  would either (a) force the player to flag every hazard even when the
  remaining numbered field already proves them out, or (b) let a misread —
  flag-a-safe-tile, skip-a-hazard — pass as a win. Neither is acceptable.
  The truth source is `isMine + state`; flags are UI annotation.
- `GamePhase` extended to `active | breached | cleared`. Tagged union stays
  clean: `cleared` carries no extra fields (the whole board is the proof).
  All existing guards that check `phase.kind !== 'active'` now correctly
  reject input in both terminal states without special-casing.
- Clear detection lives in a shared `resolvePhase(tiles)` helper, called
  from both `revealTile` and `confirmTile` on the non-breach branch.
  Reasons this is shared, not inlined: reveal and confirm already share
  the cascade core; their clear paths should share the definition of
  "cleared" for the same reason — the moment those two drift is the
  moment chord-win and reveal-win diverge on an edge case nobody notices
  until a player posts a screenshot.
- **Breach takes priority over clear.** If a single action both breaches
  and, under a pathological tiles array, satisfies the all-safe-resolved
  predicate, breach wins. In practice this cannot happen with the current
  reveal semantics (a detonated tile is a mine, so "all safe resolved"
  was already true before the detonation — meaning the previous action
  should have transitioned to cleared first, and no further action is
  accepted in a terminal phase). But encoding the priority explicitly
  costs one conditional and removes an entire class of "what if" from
  future contributors' minds. The rule is: compute the new tiles array,
  check for breach first, only evaluate clear on the non-breach branch.
- `resolvePhase` is O(total tiles) per effectful reveal or confirm action.
  At 16×16 that's 256 reads on an action. Derived state, not stored:
  caching a "safe tiles remaining" counter on `GameState` would save the
  scan but would also introduce a second source of truth about board
  completion, and the sync-bug tax on that is bigger than the scan cost.
  If boards ever get large enough that this matters (≥128×128), revisit —
  until then, scan.
- Render behavior on clear mirrors breach's observability principle:
  remaining hazards are rendered (so the operator can see the field they
  stabilized) but engine state is not mutated — hazards stay `unresolved`,
  so a replay or audit can still distinguish tiles the player actually
  resolved from tiles the UI merely exposed. The cleared palette is cyan-
  washed rather than red-washed: stabilized field, not detonated field.
  Flags on clear read as corroborated (quiet cyan) since every remaining
  flagged tile is necessarily a hazard once all safe tiles are resolved.
- HUD banner language: "field stabilized · witness protocol complete".
  Avoided the generic "you win" — the brief asked for Witness Protocol
  vocabulary, and `stabilized` carries the reactor-operator register the
  rest of the HUD already uses. Phase value renders as `stabilized`
  rather than `cleared` for the same reason (the two words mean the same
  thing in this game; `stabilized` reads as an action the operator
  performed, `cleared` reads as a genre-convention status).
- Hover highlight is suppressed in both terminal phases (`breached ||
  cleared`). Pointer-down events still dispatch `reveal / flag / confirm`;
  the engine's phase guard no-ops them. That split — render-side suppress
  the *affordance*, engine-side reject the *effect* — keeps the renderer
  from having to know the current phase's input policy in detail.
- No timers. No random behavior. No UI-owned success detection. The HUD
  and renderer read `phase.kind === 'cleared'` from engine state; they
  do not scan the tiles themselves. If the reducer didn't declare clear,
  the UI can't "helpfully" declare it — which is exactly the invariant
  the brief asked for.

Files changed this pass:
- `src/types/index.ts` — extended `GamePhase` union with `cleared` variant.
- `src/engine/state.ts` — added `resolvePhase(tiles)` helper; wired it into
  the non-breach return branch of `revealTile` and into the success branch
  of `confirmTile`; imported `GamePhase` for the helper's return type.
- `src/ui/HUD.tsx` — added `cleared` banner, phase-value label
  (`cleared` → "stabilized"), and a `hud-value-cleared` style hook.
- `src/render/BoardRenderer.ts` — added stabilized palette constants,
  extended `paintTile` to accept a `cleared` flag, suppressed hover
  highlight in terminal phases, rendered remaining hazards in dormant cyan
  on clear without mutating engine tile states, recolored resolved/flagged
  tiles in the stabilized wash.
- `src/styles.css` — added `.hud-cleared` banner and `.hud-value-cleared`
  phase-value styles.

Explicitly deferred: left+right simultaneous chord, variable-cost
observations (peek, constraint probe, hazard bloom), replay buffer keyed
off the action log, unit tests, any progression or metagame system, any
post-clear summary (time-to-clear, reveals-used, confirms-completed), and
any animated clear transition. Scope for this pass was terminal detection
only — detection first, ceremony later.

### 2026-04-23 — Claude Opus 4.7 (Witness Probe v1 — line scan)
First non-chord inference instrument. The brief framed the pivot
precisely: this is where the player stops asking "what is this tile?" and
starts asking "what is true about this region?". The probe buys the
hazard count of a 5-cell line centered on a target, without revealing
which cells are hazards — structure, not certainty. Demoted three Canon
sections. Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach / **clear** loop under a finite **witness charge**
> budget, with **Witness Confirmation** (chord) as the first inference-rewarded
> action. Tiles are `unresolved | resolved | flagged`, the run phase is
> `active | breached | cleared`, and the player has a finite pool of direct
> observations that a successful confirmation can partially restore. The
> core identity loop — "spend certainty to make claims, restore trust through
> proof, stabilize the field" — is now playable end-to-end with both terminal
> states in place. Next substantive foundation decisions: first non-chord
> inference primitive (e.g. a cheaper partial-information "probe"), a
> deterministic replay buffer keyed off the action log, and a test harness.
> Still foundation work — not progression, metagame, or content.

**Superseded — Engine surface (reducer signature):**
> * `createGameState(config: BoardConfig): GameState` — produces an `active`
>   phase with `witness.charge = witness.max = config.witnessCharges` and
>   `witness.confirms = 0`.
> * `reduceGame(state, action): GameState` where action is one of
>   `hover | hoverClear | reveal | flag | confirm | regen`. Pure.

**Superseded — Visual-proof header:**
> 16×16 interactive grid with the full reveal / flag / confirm loop under a
> witness budget:

Design notes for this pass:
- Probe is a new action, not a parameter on `reveal`. A probe has a
  different target validation (must be unresolved, segment must have ≥3
  unresolved cells), a different cost (2, not 1), a different effect (no
  tile state changes, stores a `ProbeReading`), and a different replay
  signature in the action log. Keeping it a distinct action type means
  `[reveal, reveal, probe, reveal, confirm]` reads as exactly the play
  sequence, not as a dispatch-within-a-dispatch.
- Exactly one geometry shipped: the line, in two orientations. The brief
  was explicit — no rectangles, no circles, no freeform, no row/column
  Nonogram signatures. The principle: give the player one instrument they
  can master before introducing a second. Second-instrument decisions
  (full row/column counts, 3×3 blocks, constraint bloom) are held for a
  later pass once we have usage data from the line.
- **Anti-collapse rule: ≥ 3 truly-`unresolved` cells in the segment.**
  Flagged cells *do not count* toward the threshold: a flag is a player
  commitment, so a region full of flags already has (asserted) collapsed
  ambiguity. The rule prevents the dominant cheese — probing a 4-resolved
  + 1-unresolved segment to learn "is this one tile a mine?" for 2 charge,
  which is strictly worse than a direct reveal. At 3 unresolved the probe
  tells you *something about a multi-cell region* without reducing to a
  binary question about a single cell. Clipped edge probes (3 or 4 cells
  on-board) are accepted as long as they meet the same threshold — edges
  are part of the field, not second-class; the instrument is just less
  potent at the wall.
- **Flagged cells are still counted in the hazard total.** The probe
  returns ground truth: total mines in the segment. If a correctly
  flagged cell is in the segment, it contributes 1 to the count. This is
  intentional — it lets the probe *corroborate or contradict* the
  player's flag reading. A probe that returns fewer hazards than the
  player has flagged in the segment proves at least one flag is wrong.
  That interaction was strong enough to keep "include flagged mines in
  the count" over the alternative of "count only unresolved mines".
- Cost set to 2 charge (vs. 1 for direct reveal). One direct reveal gets
  you one tile's truth. Two charges on a probe get you a summary of five
  tiles' collective hazard load — strictly more information-per-charge on
  a well-chosen target, but *at the cost of preserved ambiguity*. The
  probe is not a cheaper alternative to reveals; it is an instrument for
  reading the field when per-tile reveals would be too expensive or too
  risky. The 2× ratio is a starting point — narrow enough that players
  will actually pay it on a hard board, wide enough that they feel the
  cost and have to choose.
- **Interaction model: mode toggle via keyboard (`h` / `v`, `Esc`).**
  Rejected alternatives:
  (a) a modifier click (Shift+click): conflicts with possible future
      multi-select or marquee tooling and invisibly rewires the same
      gesture, which breeds mis-clicks;
  (b) a permanent probe button in the HUD: adds chrome and hides the
      instrument behind a target-the-HUD-then-target-the-board round
      trip;
  (c) a cursor-cycle mode (one key cycles reveal/probe-h/probe-v/off):
      nice economy but makes the current mode harder to read at a
      glance.
  A keyboard-armed mode with explicit orientation is closer to the
  "deliberate instrument" framing the brief asked for. Pressing the same
  orientation key a second time disarms (toggle affordance); pressing
  the other orientation key switches without disarming (quick pivot);
  `Esc` always disarms (universal affordance). The HUD shows an "armed"
  pill when a mode is active and an "idle" label otherwise, so the
  current state is legible without looking at the cursor.
- **Mode is UI state, not engine state.** The reducer sees only the
  `probe` action with its orientation; whether the player got there via
  keyboard, button, modifier click, or a macro is invisible and
  irrelevant to replay. This is the same principle that kept hover out
  of deterministic play: inputs that affect rules go through the
  reducer; inputs that affect *how clicks are interpreted* stay in the
  UI layer. Replay of `[reveal, reveal, probe(3,4,'horizontal'),
  reveal, confirm]` on the same seed produces an identical terminal
  state, even though a replayer has no idea whether the original player
  used `h` or some future cursor-mode button.
- **Probe mode auto-exits on terminal phase.** If the run breaches or
  clears while probe mode is armed, the mode drops to null — the HUD
  indicator can't linger past a run ending, and reseed therefore starts
  in a clean input state. Auto-exit uses a `useEffect` watching
  `phase.kind`; it does not dispatch engine actions, so replay is
  unaffected.
- **Preview overlay geometry comes from the engine**, not from a
  renderer-local copy of the 5-cell math. `probeSegment(w, h, x, y,
  orientation)` is exported from the engine and consumed by both the
  reducer (on `probe` action) and the renderer (on paint). If a future
  pass changes the probe geometry (e.g., to 7-cell or to add diagonals),
  the preview and the action stay synchronized by construction — the
  class of "preview showed one thing, probe scanned another" bug cannot
  happen without the same edit touching both. The renderer also
  suppresses standalone hover on the segment center while probe mode is
  armed so the cyan outline is the sole affordance.
- **`lastProbe: ProbeReading | null` replaces on each probe rather than
  appending to a log.** A log would be nice for a probe history panel,
  but v1 didn't need one, and adding it would have forced a scroll/trim
  UI decision that belongs to a later pass (the same pass that also
  adds the replay buffer). The reading carries its own `cells` array
  so the HUD displays the actual scanned length (3 or 4 for clipped
  edge probes, 5 otherwise) without re-computing segment geometry.
- **HUD copy biases operational, not arcade.** "witness probe",
  "structural scan", "hazards detected", "armed/idle", "no probe
  reading" — instrumentation register. Avoided "sonar", "ping",
  "scanning…", "discovered N mines!". The probe block sits directly
  under the witness-charge block because the two are the main
  economy-shaping surfaces; reading flows charge → probe → field stats →
  phase, which is the order the player thinks in during a decision.
- **No refusal feedback surface yet.** A refused probe (wrong phase,
  charge too low, target not unresolved, segment below threshold)
  silently no-ops. The player can infer from "my charge didn't change
  and no reading appeared" that the action was refused. A future pass
  may add a transient "probe refused — segment too resolved" status
  line, but it would need to store ephemeral UI state, and v1 didn't
  need it enough to justify the shape.
- Charge cost is deducted after every early-return guard, same as
  `revealTile` — refused probes cost nothing. This is load-bearing for
  the same reason reveal's "refused-is-free" rule is: a 2-charge
  instrument that can charge you for a mis-click would feel punitive,
  and the instrument's value comes from being a deliberate decision,
  not a careful-fingers dexterity check.
- `PROBE_TUNABLES` is re-exported so HUD labels read from the same
  source as the reducer. If a future pass changes probe cost to 3, the
  HUD hint text and note line update without manual edits. The three
  values (`length`, `cost`, `minUnresolved`) sit at engine file scope
  rather than on `BoardConfig`: they are mechanics-level tuning, not
  per-seed run parameters — we don't want the same seed to play
  differently because the tunable shifted between sessions.

Files changed this pass:
- `src/types/index.ts` — added `ProbeOrientation`, `ProbeReading`;
  extended `GameState` with `lastProbe`.
- `src/engine/state.ts` — added `probe` action variant, `probeTile`
  reducer, `probeSegment` geometry helper, `PROBE_TUNABLES` constants;
  initialized `lastProbe` in `createGameState`.
- `src/engine/index.ts` — re-exported `probeSegment`, `PROBE_TUNABLES`.
- `src/ui/GameView.tsx` — added `probeMode` UI state, keydown listener
  (`h` / `v` / `Esc`), probe-mode-aware click routing through the
  renderer's `onReveal` channel, phase-terminal auto-exit, render
  overlay passthrough.
- `src/ui/HUD.tsx` — added probe mode indicator, last-reading card,
  empty state, probe hint lines. Read tunables from engine-re-export.
- `src/render/BoardRenderer.ts` — added `RenderOverlay` param to
  `render()`, preview set derivation via engine's `probeSegment`, inset
  cyan outline on segment cells, hover suppressed on preview center.
- `src/styles.css` — added `.hud-probe*` styles (mode pill, reading
  card, empty state, note).

Explicitly deferred (carried forward, with the probe primitive now
resolved): left+right simultaneous chord, a probe *log* and in-HUD
history review, transient refusal feedback ("probe refused — segment
too resolved"), additional probe geometries (row/column signatures,
3×3 block scan, constraint bloom), variable probe cost (distance-
scaling, diminishing-returns pricing), replay buffer keyed off the
action log, a headless test harness / unit tests, and any progression
or metagame system. The brief continues to forbid shops, batteries,
passive regen, inventory, backend, multiplayer, and campaign systems —
still no cathedral.

### 2026-04-23 — Claude Opus 4.7 (Witness Probe History — memory prosthetic)
The probe instrument existed, but its output evaporated the moment the
player took the next action: each reading replaced `lastProbe`, so
"probe → think → forget → sadness" was the real interaction loop and the
game was implicitly outsourcing cognition to a paper notebook. This pass
adds a bounded, engine-owned probe ledger and a HUD surface that lets the
operator look back — *and* re-highlight any past probe's segment on the
board — without scrolling, filtering, or replay tooling. The brief was
explicit: remember observations, do not interpret them. No contradiction
detection, no row/column signatures, no analytics — a notebook, not an
oracle. Demoted two Canon sections plus the visual-proof probe bullet.
Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach / clear loop under a finite **witness charge** budget,
> with **Witness Confirmation** (chord) for inference-rewarded claims and the
> **Witness Probe** (line scan) as the first structural-scan instrument.
> Tiles are `unresolved | resolved | flagged`, the run phase is
> `active | breached | cleared`, the player has a finite pool of direct
> observations, and they now have a second kind of observation available:
> spending extra charge to ask *about a region*, not about a tile. The core
> identity pivot — "spend certainty to make claims *or* to ask a better
> question" — is now expressed in the rules. Next substantive foundation
> decisions: a deterministic replay buffer keyed off the action log, a
> headless test harness, and the second probe geometry (row/column signature
> or rectangular scan) once we have one structural instrument in players'
> hands to calibrate against. Still foundation work — not progression,
> metagame, or content.

**Superseded — Engine surface (probe bullet):**
> * **Witness Probe (line scan)**: `probe` targets an unresolved tile with an
>   `orientation: 'horizontal' | 'vertical'`. The instrument scans a 5-cell
>   line centered on the target (clipped to board bounds), counts all mines
>   in the segment, and returns that count as a `ProbeReading` on
>   `state.lastProbe`. It does **not** reveal which cells are hazards — the
>   instrument buys *structure*, not certainty. Cost: 2 witness charge, on
>   acceptance only. Anti-collapse rule: refused unless the segment contains
>   at least 3 truly-`unresolved` cells (flagged and resolved do not count
>   toward the threshold), which prevents the probe from degenerating into
>   an expensive single-tile reveal when all but one cell is already known.
>   Tile state is untouched — the board's truth is the same before and
>   after; only the player's knowledge grows. Tunables
>   (`PROBE_TUNABLES.length | cost | minUnresolved`) live at engine file
>   scope and are re-exported so HUD copy reads from the same source as
>   the reducer.

**Superseded — Visual-proof probe line:**
> * `h` arms a horizontal probe, `v` arms a vertical probe, pressing either
>   again (or `Esc`) disarms; while armed, the hovered 5-cell segment is
>   outlined in cyan, hover highlight is suppressed, and left-click on the
>   center spends 2 charge to return the segment's total hazard count
>   (no per-tile truth revealed); the HUD's probe block displays the last
>   reading's orientation, coordinate, cells scanned, and hazard count

Design notes for this pass:
- **One source of truth, not two.** Rejected the seemingly-obvious shape
  of keeping both `lastProbe` (the featured reading) and `probeHistory`
  (the ledger). Those values would always be `probeHistory[0]`, and the
  moment they could drift — a bug path, a future partial update — the
  UI and replay semantics would disagree on "what did I just learn?".
  Replaced `lastProbe` entirely; the HUD reads `probeHistory[0]` when it
  needs to highlight the latest. Same ergonomics, one fewer invariant.
- **Ledger is engine state, not UI state.** The brief left the door open
  for "a very clearly justified deterministic state path" as an
  alternative, but the cost of either is identical (a small array on
  GameState vs. a ref in React) and only the engine-owned version
  survives a future replay buffer, authoritative-host multiplayer, or
  headless test harness. Replay of an action log on a given seed must
  reproduce the same ledger; the only way that stays honest is for the
  reducer to own it. The UI *hover-highlight* is the one part that stays
  in React — it's the "which row is the cursor over right now?" query,
  which is genuinely per-session and does not affect rules.
- **Bound of 8.** The "recommended 5–8" range in the brief lands on the
  upper edge of the working-memory band; 8 is enough to survive a
  multi-probe reasoning pass (e.g., parallel scans along adjacent rows)
  without the panel becoming a spreadsheet. Evicting from the tail is
  deterministic — a ninth probe always drops entry #8, never some other
  row — so replay is stable even across the boundary. The constant
  lives in `PROBE_TUNABLES.historyLimit` next to the other probe tunables
  so the HUD's `n/max` label reads from the same number as the reducer.
- **Entry format: orientation-glyph · x:_ y:_ · N haz · Nc.** One line,
  tabular-numeric, newest first. Resisted adding anything else
  (timestamp, delta-since-last, charge-at-time-of-probe, cells-detected-
  that-were-flagged). The brief was explicit: "remember observations,
  not interpret them." Extra columns would invite an AI-helper mental
  model; this is a notebook. The latest entry gets a slightly brighter
  treatment (full opacity, cyan left border) so the operator can still
  see "what did I just learn?" without scanning — one visual hierarchy,
  not two separate widgets.
- **Hover, not click.** The brief called hover the requirement and click
  optional; shipped hover only. A pin-on-click affordance has two costs
  — it forces the renderer to track pin state across frames, and it
  introduces a "how do I unpin?" affordance decision — and the value
  was marginal over "move the cursor back to the row." Also added
  `onFocus`/`onBlur` handlers and `tabIndex={0}` on each entry so
  keyboard-only operators get the same re-highlight via focus traversal.
  The list's container has an `onMouseLeave` that clears the hover index
  — important because React's `onMouseLeave` on the list, not per-row,
  is the event that actually fires when the cursor exits the block via
  a row gap; otherwise a stale row would stay highlighted.
- **Same visual language as the live probe preview.** Chose to funnel
  both the live probe-mode preview and the history re-highlight into a
  single `previewCells` set inside the renderer, and to draw both with
  the same inset cyan outline. The design reason the brief asked for
  the same visual: the operator should read "this is a probe segment"
  in one glance whether it's a prospective scan or a memory of a past
  one. The implementation reason: computing them separately with the
  same appearance would be two draw paths that could drift; unioning
  them into one set is the cheap, correct move.
- **History highlight outlives terminal phases.** The live preview
  suppresses itself on breach or clear (the field is no longer
  interactive), but history highlight does *not* — the operator may
  want to look back over their ledger after a breach to understand
  where their read went wrong. Suppressing it there would remove the
  prosthetic exactly when it is most valuable.
- **`hoveredHistoryIndex` is clamped to `historyHistory.length` on
  change.** A regen clears the ledger but the React state survives; a
  stale index pointing at (say) entry #5 after a reseed would silently
  deref undefined and null out the highlight. Safer to explicitly clear
  in an effect that watches history length — same invariant, fails
  loud instead of quiet.
- **No `hud-probe-empty` / `hud-probe-reading*` CSS classes.** The
  featured "last reading" card from the previous pass is gone — the
  latest entry is the first row of the ledger now. Deleted the unused
  styles rather than leaving them as phantom hooks; if a later pass
  reintroduces a featured card, it can earn its own class name.
- **Copy stays operational.** "witness probe history", "hover an entry
  to re-scan", "N/8", "no probes logged". Avoided "log", "journal",
  "timeline" — this is an instrument trace, not a diary. The right-
  aligned count is `N/8` not `entries: N` for the same reason the
  charge reads `N / max`: the operator cares about capacity pressure,
  not a total.

Files changed this pass:
- `src/types/index.ts` — removed `lastProbe`; added
  `probeHistory: ReadonlyArray<ProbeReading>`.
- `src/engine/state.ts` — added `PROBE_HISTORY_LIMIT`; initialized
  `probeHistory: []` in `createGameState`; rewrote `probeTile`'s success
  branch to prepend a reading and cap the ledger deterministically;
  exposed `historyLimit` via `PROBE_TUNABLES`.
- `src/ui/HUD.tsx` — replaced the single-reading probe card with a
  **witness probe history** block rendering a bounded newest-first
  list; added hover/focus handlers and `tabIndex` for keyboard
  operators; props expanded with `hoveredHistoryIndex` and
  `onHistoryHover`.
- `src/ui/GameView.tsx` — added `hoveredHistoryIndex` UI state, clamp
  effect, `historyHighlight` memo derived from
  `state.probeHistory[hoveredHistoryIndex]?.cells`; passed through to
  the renderer's overlay.
- `src/render/BoardRenderer.ts` — extended `RenderOverlay` with
  `historyHighlight: ReadonlyArray<Coord> | null`; unioned its cells
  into the same `previewCells` set that drives the live probe preview,
  so one paint path handles both.
- `src/styles.css` — added `.hud-history*` styles (panel, list, entry
  rows with latest-and-hover variants, empty state, note); removed
  the now-unused `.hud-probe-empty` and `.hud-probe-reading*` styles
  that the previous pass shipped for the single-reading card.

Explicitly deferred (carried forward): contradiction detection (probe
count vs. flag count in a segment), advanced filters or per-orientation
views, export/share, a replay viewer, row/column signature probes,
3×3 block probes, additional probe geometries generally, an analytics
panel, scroll-back beyond the bounded window, pin-on-click to persist
a highlight, any progression or metagame system. The brief continues
to forbid shops, batteries, passive regen, inventory, backend,
multiplayer, and campaign systems — still no cathedral. The notebook
is built; the oracle is not.

### 2026-04-24 — Claude Opus 4.7 (Contradiction Highlighting v1 — truth serum)
Added a purely local contradiction layer — the first reasoning aid that
makes *no* recommendation and offers *no* probability estimate, only
proof. When a resolved numbered tile's Moore-neighbor flag count exceeds
its adjacency constraint, or when flags plus remaining unresolved
neighbors cannot reach the constraint, the tile gains a pulsing red halo
and the HUD ticks up its contradiction count. The brief was explicit that
this must never be "I think this is probably wrong" and must always be
"this cannot be true" — and that distinction was treated as the single
load-bearing design rule for the pass. Demoted two Canon entries: the
Stage paragraph and the HUD visual-proof line. Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach / clear loop under a finite **witness charge** budget,
> with **Witness Confirmation** (chord) for inference-rewarded claims and the
> **Witness Probe** (line scan) as the first structural-scan instrument,
> backed by a bounded **probe history** ledger so the field's observations
> do not evaporate the moment the last reading is replaced. Tiles are
> `unresolved | resolved | flagged`, the run phase is
> `active | breached | cleared`, the player has a finite pool of direct
> observations, and they now have a second kind of observation available:
> spending extra charge to ask *about a region*, not about a tile — and they
> can look back at the last several such questions without relying on a
> paper notebook. The core identity pivot — "spend certainty to make claims
> *or* to ask a better question" — is now expressed in the rules, and the
> first cognitive-prosthetic layer is in place. Next substantive foundation
> decisions: a deterministic replay buffer keyed off the action log, a
> headless test harness, and the second probe geometry (row/column signature
> or rectangular scan) once we have one structural instrument in players'
> hands to calibrate against. Still foundation work — not progression,
> metagame, or content.

**Superseded — Visual-proof HUD line:**
> * HUD shows witness charge with a meter and tiered coloring
>   (steady → low at ≤25% or ≤3 remaining → exhausted at 0), confirmation
>   count, seed, field dims, hazard count, tile tallies, cursor, phase
>   (`active | breached | stabilized`), and a breach or stabilization banner
>   as applicable (the stabilization banner reads "field stabilized · witness
>   protocol complete")

Design notes for this pass:
- **Two rules, no more.** Rule A (over-flag: `adjacentFlags >
  adjacentConstraint`) and Rule B (under-space: `adjacentFlags +
  adjacentUnresolved < adjacentConstraint`) — both are strictly local,
  strictly provable, strictly one-constraint-per-decision. No multi-tile
  inference, no SAT solver, no subset-deduction. The brief carved out
  space for either class to grow, but both must clear a sharp bar:
  *from the local state alone, no assignment of mines satisfies the
  constraint.* Anything requiring cross-tile reasoning is inference,
  not contradiction, and belongs to a later pass (if ever).
- **Zero-adjacency tiles don't anchor contradictions.** A resolved
  numbered tile with `adjacentMines === 0` can still be surrounded by a
  misplaced flag, but the proof anchor — the number on the tile — is
  missing. The correct place to surface that error is on whichever
  adjacent *numbered* tile is over-flagged; anchoring the halo on a
  blank tile would be visually confusing (no constraint to read) and
  theoretically muddled. Skip them.
- **Terminal-phase suppression.** Breached and cleared fields both
  drop detection. On breach, the mis-flag already has its own red
  tint; stacking a halo on top would double the visual language. On
  clear, the selector's output is definitionally empty (every safe
  tile is resolved ⇒ every remaining flag is a hazard ⇒ no under-space
  or over-flag can hold), so suppression is also a cheap short-circuit
  that avoids scanning the board one last time.
- **Selector, not engine state.** Contradictions are a *derivation*,
  like `tallyTiles` — a function of the current board, not something
  the reducer maintains incrementally. Same reasoning as the tile
  tally: an incremental store would be a second source of truth and a
  sync-bug farm, and the O(tiles) scan is negligible at 16×16 and
  still cheap at much larger fields. A replay reading the same action
  log reproduces the same contradiction set on the same seed without
  any extra bookkeeping, because the selector is pure over `Board +
  flags`.
- **HUD and renderer consume one selector, never two.** The previous
  draft briefly considered having the renderer compute its halo set
  from a tighter "indices with contradictions" helper while the HUD
  called the full selector. That is the precise failure mode the brief
  warned against — "do not make renderer independently guess". The
  current architecture runs `detectContradictions(state)` once in
  `GameView`, derives a `Set<number>` of row-major indices for the
  renderer, and passes `contradictions.length` to the HUD. Two
  consumers, one truth.
- **Halo on its own Pixi layer.** The halo sits on a dedicated
  `Graphics` added to the stage above the tile root. Repainting 256
  tile backgrounds every frame to animate an alpha value would be
  absurd; the halo layer's alpha is driven by a single ticker callback
  that runs independently of the normal `render()` cycle. Geometry on
  the layer is only rebuilt when the contradiction set actually
  changes (keyed by the sorted, comma-joined index list), so rapid
  probe-mode hover events don't thrash the halo layer even though they
  trigger full renderer paints.
- **Pulse is a cosine ease, alpha in [0.55, 1.0].** Period ≈ 1.1 s.
  Chosen so the halo is readable as a *live warning* — not a static
  outline, not a flash. The min alpha never drops below 0.55 because
  the brief was explicit that the mark must be unmistakable at all
  times; fading to transparent mid-pulse would be casino flashing, not
  a truth anchor. Time accumulates on `ticker.deltaMS`, independent of
  frame rate, so a low-FPS session still pulses at the same cadence.
- **Pulse phase resets when the contradiction set changes.** If the
  operator creates a new contradiction (e.g., by placing a 4th flag
  around a "3"), the newly-added tile's halo should light up
  immediately, not enter at a low-alpha trough in the middle of a
  pulse cycle. Zeroing `haloPulseT` on geometry change hands the
  operator an instant "you just broke the constraint" signal.
- **Halo geometry: stacked outer-glow + inner-stroke.** A width-3
  outer stroke at alpha 0.35 plus a width-1.5 inner stroke at full
  alpha. The double-stroke reads as a *marked* tile, not a *selected*
  tile — selection language in the UI (like the probe preview) is
  cyan and inset; contradiction language is red and outset. Those
  two registers must not collide, because a player with both a probe
  preview and a contradiction on the same tile needs to see both
  meanings independently. A future self-test: if the two outlines
  become ambiguous, the contradiction halo is what should win.
- **HUD readout, no banner.** The brief explicitly said "Do not add
  scoreboards yet. Just current-state observability." A contradiction
  count sits as a single row in the same tally section as confirms
  and tile tallies, styled normally when zero and pulsing red when
  nonzero. No modal, no top banner, no urgency klaxon — the board's
  halos are the operator-visible *event*; the HUD row is the
  *aggregate*. The `aria-live="polite"` announcement lets screen
  readers surface a count change without interrupting other output.
- **Flag-ring for contradicting flags deferred.** The brief marked
  this optional and conditional on "naturally easy". It is not
  naturally easy without over-engineering the renderer's per-tile
  paint path (contradiction origin has to thread into `paintTile` to
  decide which flags participate in a given resolved tile's
  contradiction), and the required truth anchor — the numbered tile
  — is already doing the work. If a later pass wants it, the selector
  already carries `adjacentFlags` per `Contradiction`, so the
  geometry is derivable without any change to the engine surface.
- **No refusal feedback.** If the operator creates and then immediately
  fixes a contradiction (place a bad flag, notice the halo, un-flag),
  the halo simply vanishes on the next render. No "contradiction
  resolved" pill, no celebratory flash. The whole point of a truth
  layer is that it reports status, not ceremony — it's doing its job
  most loudly when it's silent.

Files changed this pass:
- `src/engine/contradiction.ts` — new file. `Contradiction` /
  `ContradictionKind` types and the pure `detectContradictions(state)`
  selector.
- `src/engine/index.ts` — re-exported `detectContradictions` and its
  types.
- `src/render/BoardRenderer.ts` — imported `TickerCallback`; added
  `COLOR_CONTRADICTION`, `CONTRADICTION_PULSE_PERIOD_MS`, and alpha
  bounds; extended `RenderOverlay` with `contradictions:
  ReadonlySet<number> | null`; added a dedicated `haloLayer` Graphics
  sibling of the tile root, a `haloTicker` callback that animates
  alpha on `app.ticker`, a `paintHalos` method keyed on the sorted
  index set so geometry rebuilds only when it changes, and halo
  teardown on `destroy()`. `rebuildBoard` syncs halo layer position
  and clears the cached key so a new board paints fresh halos.
- `src/ui/GameView.tsx` — imported `detectContradictions`; added
  memoized contradiction list and row-major index set; passed the
  index set through to the renderer's overlay on both the init path
  and the per-state effect; passed the count to the HUD.
- `src/ui/HUD.tsx` — added `contradictionCount` prop; added a
  `contradictions` row styled with `hud-value-contradiction` when
  nonzero; added a hint line ("red halo — local constraint proven
  impossible").
- `src/styles.css` — added `.hud-value-contradiction` with a slow
  opacity pulse keyframe matching the halo's cadence in register.

Explicitly deferred (carried forward): probability hints, "recommended
move" logic, guess-detection, contradiction auto-fix, multi-tile /
subset / SAT-style inference, a telemetry or replay system, a dedicated
contradiction banner or audio cue, an adjacent-flag warning ring,
refusal / resolution ceremony, row/column signature probes, 3×3 block
probes, additional probe geometries generally, a replay viewer keyed
off the action log, a headless test harness, and any progression or
metagame system. The brief continues to forbid shops, batteries,
passive regen, inventory, backend, multiplayer, and campaign systems
— still no cathedral. The player now has a truth serum. They do not
yet have an oracle, and will not get one.
