# DIRECTORS_NOTES

Living design doc. **Current Canon** is the present-state truth — edit in place.
**Resolved Dragons and Pivots** is append-only; once written, entries are not edited.

When a fact stops being true in Canon, move the old text **verbatim** into the
archive with a new dated entry that supersedes it.

---

## Current Canon

### Stage
Reveal / flag / breach / clear loop under a finite **witness charge** budget
on a viewport-selected default field — 24×24 / 99 hazards / 18 charges on
desktop, 16×16 / 40 hazards / 12 charges on phones (selected once at
module load via `(max-width: 768px)` matchMedia, frozen for the run) —
with **Witness Confirmation** (chord)
for inference-rewarded claims, the **Witness Probe** (line scan) as the
first structural-scan instrument, a bounded **probe history** ledger that
preserves recent readings, **contradiction highlighting** — a proof-only
truth layer that marks any resolved numbered tile whose local
flag/unresolved counts make its constraint impossible to satisfy —
**Protected Constraints v1** as a live experiment where a deterministic
~12% fraction of safe numbered tiles reveal as "safe, but value sealed"
and require 1 witness charge to unveil the constraint number, and
**Constraint Closure Restoration** — the authority-return layer, where
witness charge comes back to the operator when a resolved numbered tile
becomes locally fully stabilized (flags match its constraint, no adjacent
tile remains unresolved), strictly once per tile, automatically, with no
button press and no ceremony, and **Mobile Playability v1** — a unified
input/layout pass so the same build runs comfortably on a phone browser
(touch tap = reveal, long-press = flag, visible HUD probe-arm buttons,
column layout under 720 CSS px, board auto-scaled to fit, viewport-aware
initial board defaults — desktop boots into 24×24 / 99 / 18, narrow
viewports boot into 16×16 / 40 / 12 — selected once at module load so
resize and reseed never mutate an active run, and no separate mobile
codepath). Tiles are `unresolved | resolved | flagged`,
the run phase is `active | breached | cleared`, the player has a finite
pool of direct observations, they can ask *about a region* rather than a
tile, they can look back at the last several such questions without a
paper notebook, the field visibly refuses to host impossibilities, some
tiles require an additional payment to reveal their constraint after
being proved safe, and authority returns only when the field actually
stabilizes — not when the operator clicks. The identity loop now reads:
safety and legibility are separate purchases, and restoration is earned
by demonstrated understanding, not by button correctness. Next
substantive foundation decisions: evaluating whether closure-only
restoration tightens the economy enough to become canon over a full run,
a deterministic replay buffer keyed off the action log, a headless test
harness, and the second probe geometry (row/column signature or
rectangular scan). Still foundation work — not progression, metagame, or
content.

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
  `hover | hoverClear | reveal | flag | confirm | probe | unveil | regen`.
  Pure.
* `generateBoard(config)`: deterministic from
  `{width, height, mineCount, seed}`. `witnessCharges` is a gameplay-budget
  input that does not affect board generation — the board is the same under
  any charge count for a given seed. After mines and adjacency counts are
  computed, the same rng stream deterministically selects
  `floor(PROTECTED_TUNABLES.fraction × eligible)` safe numbered tiles as
  *protected* (value starts occluded) via Fisher-Yates shuffle of eligible
  indices. Eligibility: non-mine AND `adjacentMines > 0`. Same seed → same
  mines → same protected set, forever.
* `tallyTiles(state): TileTally` — pure derivation of
  unresolved / resolved / flagged counts, for HUD and future observers.
* `protectedTally(state): ProtectedTally` — pure derivation of
  `{ total, occluded, unveiled }` where `occluded` is the count of
  resolved, protected, not-yet-unveiled tiles — the actionable number for
  HUD planning. `total` is the board-intrinsic protected count (stable
  across actions); `unveiled` tracks how many the operator has paid for.
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
  effectful direct reveal consumes 1 charge; an `unveil` (pay to reveal a
  protected tile's number) also consumes 1 charge; cascade expansion,
  flagging, confirmation, and denied actions are free. When charge reaches
  0, `reveal` and `unveil` become no-ops; `confirm` remains available —
  the game continues through inference and claim-making. No passive regen,
  no shops, no batteries. Starting budget: 18 charges on the desktop
  default (24×24 / 99 hazards), 12 charges on the mobile default
  (16×16 / 40 hazards) — see Stage for how the default is picked.
* **Witness Confirmation (chord)**: `confirm` targets a resolved numbered
  tile. If the count of adjacent flags equals `tile.adjacentMines` AND at
  least one adjacent unresolved, unflagged neighbor exists, every such
  neighbor is revealed (using the same cascade core as `reveal`). If any
  revealed neighbor is a mine the run breaches at that neighbor; otherwise
  the confirmation is successful — `witness.confirms` increments by 1.
  Confirm no longer refunds witness charge directly; any restoration that
  follows a correct confirm arrives because the confirm produced
  **Constraint Closure** on the target tile (and possibly on resolved
  numbered neighbors), not because the button was pressed. Refused
  confirmations (wrong tile state, zero adjacency, flag-count mismatch,
  no unresolved neighbors, breached phase) do not change state.
* **Constraint Closure Restoration**: witness charge is returned when a
  resolved numbered tile's local truth is fully stabilized — `adjacentFlags
  === tile.adjacentMines` AND no Moore-neighbor is `unresolved`. Each
  eligible tile banks `closedForWitness: true` exactly once and adds +1
  charge (capped at `max`). Strictly monotonic: un-flagging or re-flagging
  after closure cannot re-award the refund. Zero-adjacency tiles are not
  anchors (nothing to stabilize). Protected-but-occluded tiles are skipped
  until `valueRevealed` — otherwise the charge tick would leak the hidden
  constraint by reverse-inference. Contradictions (over-flag or
  under-space) naturally fail the gate, so sloppy flagging loses access to
  the restoration without any explicit punishment branch. The detection
  lives in a single pure `applyClosureRestoration` helper inside
  `state.ts`, applied after every mutating action (`reveal`, `flag`,
  `confirm`, `unveil`); suppressed in terminal phases. Replays keyed on
  the action log reproduce identical closures and identical charge
  trajectories.
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
  cannot carry a contradiction by construction. Also suppresses
  protected-but-not-unveiled tiles — surfacing a halo against a hidden
  constraint would leak the constraint by reverse-inference, defeating
  the unveil purchase. The selector is the single authority — HUD count
  and renderer halos both consume its output, neither recomputes.
* **Protected Constraints v1 (experimental)**: a deterministic subset of
  safe numbered tiles (default ~12%) are marked `protected` at board-
  generation time. When such a tile is revealed — directly or by
  cascade — it becomes `resolved` but its constraint number remains
  *occluded* until the operator spends 1 witness charge via the
  `unveil` action. Reveal buys safety; unveil buys legibility. Tunables
  (`PROTECTED_TUNABLES.fraction | unveilCost`) live at `src/engine/board.ts`
  file scope and are re-exported so HUD copy reads from the same source
  as the reducer. Confirm is gated on visible value — a chord against
  an occluded tile is refused so the number cannot leak via the chord's
  outcome. This layer is explicitly an experiment, not final canon, and
  may be tuned or retracted based on play feel before promoting.
* First-click safety is intentionally NOT implemented: the seed fully
  determines the board, so the first reveal can legitimately detonate.
  The player learning to read the field is the game.

### What the visual proof does
Interactive grid with the full reveal / flag / confirm / probe / unveil
loop under a witness budget. Field size is viewport-selected at module
load: desktop boots into the 24×24 / 99-hazard expert field with 18
witness charges; viewports under 768 CSS px boot into the 16×16 / 40-
hazard friend-test field with 12 charges. The choice is captured once
per page load and never mutates — rotating a phone or resizing a
window does not change the active board, and reseeding carries the
same config forward. Plays on desktop (mouse + keyboard) and mobile
(touch + visible HUD controls) without a forked codepath — the
renderer routes per-tile-state intent and the layout stacks on narrow
viewports:
* tap (touch) or left-click (mouse) on an unresolved tile resolves it and
  spends 1 witness charge; zero-adjacency regions flood-reveal for free;
  reveals with zero charge are refused
* tap or left-click on a resolved, protected, not-yet-unveiled tile
  dispatches `unveil` — the engine validates tile state and charge, then
  flips `valueRevealed` and deducts 1 charge, making the constraint number
  visible; probe mode does *not* preempt unveil (probe refuses resolved
  targets anyway, and forcing a disarm to unveil would be mode sludge)
* tap or left-click on a resolved numbered tile dispatches `confirm` — the
  engine validates the flag-match condition and reveals the remaining
  unflagged neighbors as a group; confirm on an occluded tile is refused
  (the hidden number cannot leak via chord outcomes); on desktop, middle-
  click anywhere is a redundant alias for the same action
* long-press (touch, ~400ms with cancellation past 10 CSS px of drift) or
  right-click (mouse) toggles a flag — always free, fires on any tile
  state and at any time, including while probe mode is armed
* `h` arms a horizontal probe, `v` arms a vertical probe, pressing either
  again (or `Esc`) disarms; the same arming is reachable on touch via
  three explicit HUD buttons (H / V / cancel) so mobile operators do not
  need a keyboard. While armed, the hovered 5-cell segment is outlined
  in cyan, hover highlight is suppressed, and tapping/clicking the center
  spends 2 charge to return the segment's total hazard count (no per-tile
  truth revealed); the HUD's **witness probe history** block lists the
  recent successful probes (newest first, up to 8 entries) with
  orientation / coord / hazards / scanned-cell count; hovering a row
  re-highlights that probe's exact segment on the board using the same
  inset cyan outline as the live preview
* a safe confirmation no longer grants a charge refund directly — it
  still increments the confirms tally, but any restoration that follows
  is produced by **Constraint Closure** on the target tile (and resolved
  numbered neighbors freed by the confirm)
* every time a resolved numbered tile becomes locally fully stabilized
  — adjacent flags match its constraint AND no adjacent tile is
  unresolved — its `closedForWitness` flips once and +1 charge is
  returned (capped at max), silently; no pill, no banner, just the meter
  ticking up
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
* resolved-but-protected safe tiles paint with a distinct cooler fill,
  a muted-cyan stroke, four inset corner brackets (the "seal" border),
  and a sigil glyph (◈) where the number would otherwise sit; after
  unveil, the tile swaps to the normal numbered-tile palette
* HUD shows witness charge with a meter and tiered coloring
  (steady → low at ≤25% or ≤3 remaining → exhausted at 0), confirmation
  count, contradiction count (pulsing red when nonzero), occluded
  count (cyan when nonzero — tiles still needing an unveil), seed, field
  dims, hazard count, tile tallies, cursor, phase (`active | breached |
  stabilized`), and a breach or stabilization banner as applicable
  (the stabilization banner reads "field stabilized · witness protocol
  complete")
* reseed regenerates a fresh active board, refills charge to max, and
  resets confirms to 0
* layout is responsive: above 720 CSS px viewport width the board sits
  beside the HUD (existing desktop layout); at or below 720 px the
  `.game-view` flex switches to column — board first, HUD beneath, page
  scrollable. The renderer auto-fits the tile root with a uniform scale
  capped at 1.0 so the 24×24 grid is always fully visible inside Pixi's
  current screen, centered, never clipped at edges or under the HUD;
  tiles shrink (rather than overflow) on narrow viewports. `.board-host`
  carries `touch-action: none` so a long-press never raises the system
  context menu and a swipe across the board never drags the page

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

### 2026-04-24 — Claude Opus 4.7 (Protected Constraints v1 — interpretation costs authority)
First experimental layer. The prior passes established *safety* as the
thing witness charge buys; this pass introduces a second axis —
*legibility*. A deterministic ~12% fraction of safe numbered tiles now
resolves as "safe, value occluded", and the operator pays 1 charge per
tile to read the constraint number. The brief's framing was precise:
this is an experiment, not final canon, testing whether players
naturally infer around hidden truths or always pay immediately. The
field also grew from 16×16/40 to 24×24/99 so that hidden-value pressure
has more real ambiguity to bite on, with the starting budget tightened
from 12 → 18 charges (less than proportional, by design). Demoted five
Canon sections: Stage, three Engine-surface bullets (reduceGame,
generateBoard, witness-charge default), and two Visual-proof bullets
(opening line + HUD enumeration + left-click behavior). Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach / clear loop under a finite **witness charge** budget,
> with **Witness Confirmation** (chord) for inference-rewarded claims, the
> **Witness Probe** (line scan) as the first structural-scan instrument,
> a bounded **probe history** ledger that preserves recent readings, and
> **contradiction highlighting** — a proof-only truth layer that marks any
> resolved numbered tile whose local flag/unresolved counts make its
> constraint impossible to satisfy. Tiles are `unresolved | resolved |
> flagged`, the run phase is `active | breached | cleared`, the player has
> a finite pool of direct observations, they can ask *about a region* rather
> than a tile, they can look back at the last several such questions without
> a paper notebook, and the field now visibly refuses to host impossibilities.
> The core identity pivot — "spend certainty to make claims *or* to ask a
> better question, and the field tells you when your reading cannot be
> true" — is expressed end-to-end in the rules. Next substantive foundation
> decisions: a deterministic replay buffer keyed off the action log, a
> headless test harness, and the second probe geometry (row/column signature
> or rectangular scan) once we have one structural instrument in players'
> hands to calibrate against. Still foundation work — not progression,
> metagame, or content.

**Superseded — Engine surface (reducer action list):**
> * `reduceGame(state, action): GameState` where action is one of
>   `hover | hoverClear | reveal | flag | confirm | probe | regen`. Pure.

**Superseded — Engine surface (generateBoard):**
> * `generateBoard(config)`: deterministic from
>   `{width, height, mineCount, seed}`. `witnessCharges` is a gameplay-budget
>   input that does not affect board generation — the board is the same under
>   any charge count for a given seed.

**Superseded — Engine surface (witness charge default):**
> * **Witness charge**: a finite integer budget in `GameState.witness`. Each
>   effectful direct reveal consumes 1 charge; cascade expansion, flagging,
>   confirmation, and denied actions are free. When charge reaches 0, `reveal`
>   becomes a no-op; `confirm` remains available — the game continues through
>   inference and claim-making. No passive regen, no shops, no batteries.
>   Default budget: 12 charges on a 16×16, 40-hazard field.

**Superseded — Visual proof (grid header + two left-click bullets):**
> 16×16 interactive grid with the full reveal / flag / confirm / probe loop
> under a witness budget:
> * left-click on an unresolved tile resolves it and spends 1 witness charge;
>   zero-adjacency regions flood-reveal for free; reveals with zero charge
>   are refused
> * left-click on a resolved numbered tile *or* middle-click anywhere
>   dispatches `confirm` — the engine validates the flag-match condition and
>   reveals the remaining unflagged neighbors as a group

**Superseded — Visual proof (HUD enumeration):**
> * HUD shows witness charge with a meter and tiered coloring
>   (steady → low at ≤25% or ≤3 remaining → exhausted at 0), confirmation
>   count, contradiction count (pulsing red when nonzero), seed, field
>   dims, hazard count, tile tallies, cursor, phase (`active | breached |
>   stabilized`), and a breach or stabilization banner as applicable
>   (the stabilization banner reads "field stabilized · witness protocol
>   complete")

Design notes for this pass:
- **Protection is a board-intrinsic property, not play state.** `Tile.protected`
  is set by `generateBoard` and never mutates through the reducer; only
  `valueRevealed` flips under play. This split matters because the
  experiment's whole premise is "same seed → same sealed layout, every
  run." If protection were mutable (say, by a reveal heuristic, or a
  runtime difficulty dial), the seed would no longer pin the board and
  the reproducibility contract — load-bearing for replay, multiplayer,
  and the headless harness — would bend.
- **Selection is the same rng stream as mine placement.** Fisher-Yates
  shuffle of eligible safe-numbered indices, take the first K where
  `K = floor(eligibleCount × PROTECTED_FRACTION)`. Same seed → same
  mines → same shuffle → same protected set, forever. Fisher-Yates in
  preference to per-tile Bernoulli trials because exact-K selection
  makes the occluded count stable across seeds at the same config
  (predictable pressure profile) rather than binomially drifting.
- **Zero-adjacency tiles are ineligible.** A zero has no constraint to
  purchase — unveiling it would say "there are 0 mines around this
  tile", which the operator can already infer the moment it's revealed
  (cascades still fire normally). Excluding zeros also keeps cascade
  semantics trivially clean: a cascade reveals numbered borders,
  protected or not, but never has to decide whether to occlude a "0"
  (it never does). Mines are ineligible for the obvious reason.
- **Cascade does not auto-unveil.** A zero-flood resolves protected
  tiles on its border, but `valueRevealed` stays false for each of
  them. This is the strongest expression of the experiment's identity:
  the cascade bought the safety for free as always, but it did *not*
  buy the legibility. A player who wants to read the cascade's
  numbered border now pays per tile. This ratchets up the pressure
  exactly where the old design was slackest.
- **Interaction: left-click on a resolved, protected, not-yet-unveiled
  tile → `unveil`.** One state → one gesture. Considered alternatives
  and rejected them in order:
  (a) Modifier + click (Shift+click): invisibly rewires a gesture
      that might later carry multi-select semantics; and players who
      miss the modifier face a silent no-op.
  (b) Dedicated armed mode (press `u`, then click): exactly the
      "mode sludge" the brief warned against. Two modes (probe +
      unveil) would compete for mental real estate.
  (c) Middle-click on occluded: middle-click is already "ritual
      confirm"; overloading it with a divergent action based on
      tile type would break the single-meaning-per-gesture rule.
  Left-click-routes-by-tile-state is the pattern already in use
  (left-click on resolved numbered → confirm; left-click on
  unresolved → reveal/probe). Adding "left-click on occluded →
  unveil" is consistent with that pattern, not an extension of it.
- **Probe mode does *not* preempt unveil.** An armed probe refuses
  resolved targets anyway (probe needs an unresolved center), so
  nothing is lost by letting left-click on an occluded tile go
  through as an unveil while probe is armed. Preempting would force
  the operator to disarm probe just to pay for a number, and that is
  the exact mode-sludge flavor the brief called out. Single rule: if
  the tile is occluded, left-click unveils, full stop.
- **Confirm refuses occluded tiles.** Without this guard, chord
  outcomes would leak the hidden number by inference — a safe chord
  means "flag count matched", a detonation means "flag count was too
  high", and the sign of the leak is exactly the information the
  unveil purchase is supposed to gate. Refusing at the reducer is
  cheaper than trying to simulate a "hidden chord outcome" visual.
- **Contradictions suppress on occluded tiles.** Same reasoning, same
  vector. A halo that lights up only when `adjacentFlags` exceeds a
  hidden threshold, or only when unresolved count falls below a
  hidden threshold, would let a patient operator binary-search the
  number with a single flag. The selector skips these tiles entirely;
  once unveiled, they rejoin the contradiction pool naturally.
- **Visual: distinct fill, muted-cyan stroke, four inset corner
  brackets, ◈ sigil.** Four separate identification channels because
  the brief was explicit — *never surprise tax*, the operator must
  know before spending the unveil charge that this tile is asking
  for one. The sigil alone wasn't enough (at fast pan it can scan as
  a number glyph if the resolution is low), and the stroke alone
  wasn't enough (stroke colors cluster at a glance). The "seal"
  corner brackets are static — no pulse, no shimmer. Protected
  tiles are board state, not a live warning; a pulsing halo would
  have falsely read as "urgent to unveil" when in fact the operator
  may deliberately decide *not* to unveil for the whole run.
- **Board size & budget.** Jumped to 24×24 / 99 hazards (~17%
  density) from 16×16 / 40 (~15.6%), with the witness budget moved
  from 12 → 18 — less than proportional. Reasoning: the old baseline
  left most runs with leftover charge at clear, which made "spend
  certainty to make claims" less load-bearing than intended. With
  more field to read *and* a meaningful fraction of it arriving
  occluded, charge budget pressure moves from "a nice-to-have
  worry" to "the central question of the run", which is exactly
  what the experiment needs to measure against.
- **`protectedTally` is a selector, not stored.** Same pattern as
  `tallyTiles` and `detectContradictions`. O(tiles) per call is
  negligible at 576; keeping it derived means the HUD's `occluded`
  count cannot drift from the board's actual occluded state, no
  matter what sequence of actions produced the current snapshot.

Files changed this pass:
- `src/types/index.ts` — added `protected` and `valueRevealed` fields
  to `Tile`, with commentary explaining the invariants.
- `src/engine/board.ts` — added `PROTECTED_TUNABLES`; extended
  `generateBoard` to initialize new tile fields and run a Fisher-Yates
  selection of protected indices from the same rng stream; exported
  the tunables from the engine barrel.
- `src/engine/state.ts` — added `unveil` action variant and
  `unveilTile` reducer (charge guard, tile-state guard, pure
  transition); gated `confirmTile` on visible value to close the
  chord-leak vector.
- `src/engine/contradiction.ts` — added occluded-tile skip so halos
  cannot leak the hidden number by reverse-inference.
- `src/engine/selectors.ts` — added `protectedTally` with
  `{ total, occluded, unveiled }` derivation.
- `src/engine/index.ts` — re-exported `PROTECTED_TUNABLES`,
  `protectedTally`, and `ProtectedTally`.
- `src/render/BoardRenderer.ts` — added occluded palette
  (fill/stroke/glyph/accent); routed left-click on occluded to a new
  `onUnveil` event; drew the "seal" corner-bracket border on
  occluded tiles; preserved the probe-preview and contradiction-halo
  stacking order above the occluded visuals.
- `src/ui/GameView.tsx` — bumped `INITIAL_CONFIG` to 24×24/99/18;
  wired `onUnveil` through to `dispatch({ type: 'unveil' })` (no
  probe-mode preemption); memoized `protectedTally`; passed
  `occludedCount` to the HUD.
- `src/ui/HUD.tsx` — imported `PROTECTED_TUNABLES`; added
  `occludedCount` prop; rendered an `occluded` row styled
  `hud-value-occluded` when nonzero; added a hint line explaining
  the seal sigil and its cost.
- `src/styles.css` — added `.hud-value-occluded` (static muted cyan;
  not pulsing — protected state is not a live warning).

Explicitly deferred: topology-aware protected placement (e.g.,
forbidding two protected tiles from touching, or biasing toward
choke-points / cascade borders), per-tile variable unveil cost, a
"peek" at an occluded constraint without fully buying it, an audit
or telemetry surface for hidden-value play patterns, a breach-save
mechanic, a forced-guess protocol, loadouts / build variants, any
progression or metagame system, multiplayer, and any backend. The
brief continues to forbid shops, batteries, passive regen, inventory,
campaign systems — still no cathedral. This is an experiment. The
open question the pass is asking: when truth resists observation,
does the game get better?

### 2026-04-24 — Claude Opus 4.7 (layout fix — HUD no longer overlays the board)
Bug report: at 100% zoom on the 24×24 board, the HUD overlapped the
right edge of the grid. Root cause was the original layout: board-host
was `position: absolute; inset: 0` filling the viewport, HUD was
`position: absolute; top/right: 16px` layered *on top* of the board.
At 16×16 the centered 544×544 grid fit inside the HUD-free zone; at
814×814 the grid extended behind the HUD. Fix: switched `.game-view`
to a flexbox row. Board-host is now `flex: 1 1 auto; min-width: 0`
(the `min-width: 0` is load-bearing — flex's default `auto` would let
Pixi's canvas push the board container back out past the HUD and
reintroduce the overlap). HUD is a flex sibling with `width:
clamp(240px, 20vw, 320px)` and `max-height: calc(100vh - 32px);
overflow-y: auto` so it scrolls internally on short viewports. Pixi's
`resizeTo: host` already listens to the host element's size, so the
board centers itself in the remaining width with no renderer changes
needed. Not a design pass; no Canon changes.

### 2026-04-24 — Claude Opus 4.7 (Constraint Closure Restoration)
Replaced the confirm-based witness refund with Constraint Closure
Restoration. The old refund worked mechanically but felt too free in
real play — "click the chord → get a charge back" was becoming a
ritual that rewarded button correctness rather than demonstrated
understanding. The replacement anchors restoration on a board-state
condition (local truth is fully stabilized), not on an action, so the
economy reads as *the field recognizing closure* rather than *the UI
granting relief*. Demoted three Canon sections. Verbatim:

**Superseded — Stage:**
> Reveal / flag / breach / clear loop under a finite **witness charge** budget
> on a 24×24 / 99-hazard default field, with **Witness Confirmation** (chord)
> for inference-rewarded claims, the **Witness Probe** (line scan) as the
> first structural-scan instrument, a bounded **probe history** ledger that
> preserves recent readings, **contradiction highlighting** — a proof-only
> truth layer that marks any resolved numbered tile whose local
> flag/unresolved counts make its constraint impossible to satisfy — and
> **Protected Constraints v1** as a live experiment: a deterministic ~12%
> fraction of safe numbered tiles reveal as "safe, but value sealed" and
> require 1 witness charge to unveil the constraint number. Tiles are
> `unresolved | resolved | flagged`, the run phase is `active | breached |
> cleared`, the player has a finite pool of direct observations, they can
> ask *about a region* rather than a tile, they can look back at the last
> several such questions without a paper notebook, the field visibly refuses
> to host impossibilities, and some tiles require an additional payment to
> reveal their constraint after being proved safe. The identity loop now
> includes "interpretation costs authority" — safety and legibility are
> separable purchases. Next substantive foundation decisions: evaluating
> whether hidden-value pressure changes the inference/payment ratio enough
> to become canon, a deterministic replay buffer keyed off the action log,
> a headless test harness, and the second probe geometry (row/column
> signature or rectangular scan). Still foundation work — not progression,
> metagame, or content.

**Superseded — Witness Confirmation (chord):**
> `confirm` targets a resolved numbered tile. If the count of adjacent
> flags equals `tile.adjacentMines` AND at least one adjacent unresolved,
> unflagged neighbor exists, every such neighbor is revealed (using the
> same cascade core as `reveal`). If any revealed neighbor is a mine the
> run breaches at that neighbor; otherwise the confirmation is
> successful — `witness.charge` is incremented by 1 (capped at `max`) and
> `witness.confirms` increments by 1. Refused confirmations (wrong tile
> state, zero adjacency, flag-count mismatch, no unresolved neighbors,
> breached phase) do not change state.

**Superseded — visual-proof bullet (confirm restore):**
> * a safe confirmation restores +1 charge (capped at max) and triggers a
>   brief "witness confirmed · integrity restored" pill in the HUD, keyed
>   off `witness.confirms` incrementing

Output contract answers:

1. **Files changed:** `src/types/index.ts` (added `Tile.closedForWitness`);
   `src/engine/board.ts` (init `closedForWitness: false` in
   `generateBoard`); `src/engine/state.ts` (added pure
   `applyClosureRestoration` helper, routed `reveal`/`flag`/`confirm`/
   `unveil` through it, removed the `+1 charge` line from the
   confirm-safe branch, rewrote the confirm doc-comment);
   `src/ui/HUD.tsx` (removed `witness.confirms`-keyed flash effect and
   pill DOM, updated the hint-block line from "successful confirm
   restores +1 charge" to "fully stabilizing a constraint restores +1
   charge"); `src/styles.css` (deleted now-orphan `.hud-witness-restore*`
   rules and the `hud-witness-restore-fade` keyframe). `DIRECTORS_NOTES.md`.

2. **Closure detection (exact):** for each tile in row-major order, a
   tile is a closure candidate iff all of:
   - `state === 'resolved'` and `!isMine` and `adjacentMines > 0`
   - not (`protected && !valueRevealed`)
   - `!closedForWitness`
   - Moore-neighbor counts: `adjacentFlags === tile.adjacentMines` AND
     `adjacentUnresolved === 0`. In active phase this provably implies
     every flag in the neighborhood covers a real mine (resolved mines
     would have breached, and the unresolved set is empty), so "genuine
     local stabilization" falls out of the two visible counts without
     a separate `isMine`-aware pass. The scan runs only in active
     phase.

3. **Witness restoration (exact transition):** for each tile that
   passes the detection, flip `closedForWitness` to `true` via a tile
   spread — strictly monotonic, the candidate check excludes
   already-closed tiles so flag churn cannot re-award. Accumulate a
   `restored` counter and, if nonzero, rebuild `board.tiles` once and
   return `witness = { ...witness, charge: min(max, charge + restored) }`.
   If no tiles closed on this action, return the input state by
   reference (no needless allocations). The cap is applied against
   the total, so simultaneous multi-closure actions cannot push
   charge above `max`.

4. **Confirm behavior after the change:** confirm's acceptance gate is
   unchanged (resolved numbered non-occluded target, flag count matches
   constraint, ≥1 unresolved unflagged neighbor). Safe branch no
   longer increments `witness.charge`; `witness.confirms` still
   increments by 1. Breach branch is unchanged. The target tile is
   by construction now a closure candidate (flags match, all former
   unresolved neighbors are resolved by the confirm), so the +1 that
   used to look like a confirm refund still typically arrives — but
   via closure, one step removed from the click.

5. **Contradiction / flag interaction:** contradictions never need a
   special case. An over-flag has `flags > constraint`; an under-space
   has `flags + unresolved < constraint`. Neither equals the closure
   gate `flags === constraint && unresolved === 0`. So sloppy flagging
   buys the operator exactly the economic cost the brief asked for —
   no restoration until the contradiction is resolved — with no
   explicit punishment branch. Flags become more valuable without
   becoming mandatory: the player *can* play without flagging and burn
   through the base charge budget, but disciplined flagging is how the
   economy reopens.

6. **Determinism preservation:** `applyClosureRestoration` is a pure
   function of `GameState`, row-major over `board.tiles`, no RNG,
   no clock, no DOM. The `closedForWitness` transition is strictly
   monotonic (false→true only). No other new state enters the engine.
   Same seed + same action log → same closures in the same order →
   same charge trajectory, bit-identical. Replay buffer work remains
   compatible.

7. **Explicitly deferred:** on-board visual indicator of closed tiles;
   HUD pill / popup / banner / counter for closure events (the design
   is specifically quiet); variable reward by tile number; combo
   system; achievement layer; closure telemetry / graphs; "peek at
   occluded constraint without unveiling"; neighborhood-aware
   closure scan (today it's full-board, cheap at 576 tiles); forced
   closure on un-flag regression. Everything the brief forbade
   (loadouts, breach save, progression, cathedral) remains deferred.
   Open question for next pass: across a full run, does closure-only
   restoration give the operator enough charge to finish, or does the
   base budget need a small bump to compensate? Answer through play,
   not modelling.

### 2026-04-24 — Claude Opus 4.7 (mobile playability v1)
First pass at making the existing game operable on a phone browser.
Mechanics are unchanged — every action, every cost, every breach/clear
condition is identical to desktop. The work was strictly input and
layout: the HUD no longer overlays the board, the board no longer
overflows narrow viewports, touch input has a deliberate flag gesture,
and probe arming has visible buttons because mobile has no H / V keys.
Demoted three Canon bullets (left-click / right-click / probe arming)
because the input path widened to include touch equivalents — the old
mouse-only language stopped being true. Verbatim:

**Superseded — visual-proof bullet (left-click reveal):**
> * left-click on an unresolved tile resolves it and spends 1 witness charge;
>   zero-adjacency regions flood-reveal for free; reveals with zero charge
>   are refused

**Superseded — visual-proof bullet (left/middle-click confirm + right-click flag):**
> * left-click on a resolved, protected, not-yet-unveiled tile dispatches
>   `unveil` — the engine validates tile state and charge, then flips
>   `valueRevealed` and deducts 1 charge, making the constraint number
>   visible; probe mode does *not* preempt unveil (probe refuses resolved
>   targets anyway, and forcing a disarm to unveil would be mode sludge)
> * left-click on a resolved numbered tile *or* middle-click anywhere
>   dispatches `confirm` — the engine validates the flag-match condition and
>   reveals the remaining unflagged neighbors as a group; confirm on an
>   occluded tile is refused (the hidden number cannot leak via chord
>   outcomes)
> * right-click toggles a flag — always free

**Superseded — visual-proof bullet (probe arming via keyboard only):**
> * `h` arms a horizontal probe, `v` arms a vertical probe, pressing either
>   again (or `Esc`) disarms; while armed, the hovered 5-cell segment is
>   outlined in cyan, hover highlight is suppressed, and left-click on the
>   center spends 2 charge to return the segment's total hazard count
>   (no per-tile truth revealed); the HUD's **witness probe history** block
>   lists the recent successful probes (newest first, up to 8 entries) with
>   orientation / coord / hazards / scanned-cell count; hovering a row
>   re-highlights that probe's exact segment on the board using the same
>   inset cyan outline as the live preview

Output contract answers:

1. **Files changed:** `src/styles.css` (responsive `@media (max-width:
   720px)` stack, `.board-host` `touch-action: none` + sizing, new
   `.hud-probe-actions` button block); `src/render/BoardRenderer.ts`
   (touch gesture handling — `beginTouchGesture` / `cancelTouchGesture` /
   canvas-level pointermove/up/cancel listeners; `dispatchTap` factored
   from the prior inline left-click switch so mouse and touch share one
   tile-state-aware router; `applyFitScale` plus a `renderer.on('resize')`
   subscription so the board auto-fits whatever screen Pixi is sized to,
   centered, capped at 1.0 scale; `rebuildBoard` no longer positions
   `root` directly — it delegates to `applyFitScale` after geometry is
   built); `src/ui/HUD.tsx` (new `onArmProbe` / `onCancelProbe` props,
   three `<button>` controls in the existing probe block, hint copy
   widened to "tap / left-click", "long-press / right-click", "probe
   buttons (or h / v)"); `src/ui/GameView.tsx` (passes the two new
   handlers, with terminal-phase guard on arm); `DIRECTORS_NOTES.md`.

2. **Exact responsive layout behavior:** desktop (>720 CSS px viewport
   width) is unchanged: `.game-view` is a flex row, board fills the
   remaining width after the HUD's clamped 240–320 px column, document
   `overflow: hidden`. At ≤720 px, `.game-view` becomes
   `flex-direction: column`; document and root drop to `overflow: auto`
   so the page can scroll; `.board-host` is `width: min(100%, 80vh)`
   plus `aspect-ratio: 1 / 1` and `margin: 0 auto`, which cleanly resolves
   to a square that never exceeds 80% of viewport height (leaves room for
   the HUD's probe controls and witness meter without scrolling on
   ordinary phones); `.hud` becomes `width: auto; margin: 8px;
   max-height: none; overflow: visible`, so it flows in document order
   beneath the board and scrolls with the page rather than internally.
   Inside Pixi, `BoardRenderer.applyFitScale` computes
   `min(screenW / pixelWidth, screenH / pixelHeight, 1)` and applies that
   uniform scale to both `root` and `haloLayer`, then centers them — so
   even with a bare 360 px viewport, the full 24×24 grid is visible
   (tiles shrink to ~14 CSS px), no clipped edges, no horizontal scroll.

3. **Exact tap / long-press flag interaction:** at `pointerdown` the
   tile container checks `event.pointerType`. If `'touch'`, it opens a
   touch gesture: stash `(tileX, tileY, clientX, clientY, pointerId)`,
   start a 400 ms `setTimeout` whose firing dispatches `onFlag(tileX,
   tileY)` and sets `longPressFired = true`. The renderer also listens
   on the canvas itself (not per-tile) for `pointermove`, `pointerup`,
   and `pointercancel` keyed on the same `pointerId`. If pointermove
   reads `dx² + dy² > 100` (i.e. > 10 CSS px from the start), the
   gesture is canceled — neither flag nor tap fires, so a swipe across
   the board is inert. On `pointerup`, if the long-press already fired
   the upstroke is a no-op (preventing double-toggle); otherwise
   `dispatchTap(tileX, tileY)` runs the same routing left-click uses
   on desktop. `pointercancel` discards silently. Mouse and pen pointer
   types take the prior button-based path unchanged: button 0 →
   `dispatchTap` (tile-state aware), button 1 → confirm, button 2 →
   flag. A second simultaneous touch is ignored — the brief explicitly
   excluded multi-touch — so the original gesture completes naturally.

4. **Exact mobile probe affordance chosen:** three plain `<button>`s
   inside the HUD's existing `.hud-probe` block, in a 1-1-auto grid:
   "↔ H" arms horizontal, "↕ V" arms vertical, "esc" cancels. Tapping
   the same orientation again disarms (matches the H / V keyboard
   contract — `setProbeMode((m) => m === orientation ? null : orientation)`),
   so the buttons toggle rather than latch. The cancel button is
   `disabled` when no probe is armed, with `aria-pressed` on the H / V
   buttons reflecting current arm state. `min-height: 36px`,
   `touch-action: manipulation`, `-webkit-tap-highlight-color:
   transparent` — generous tap target, no double-tap-zoom 300ms delay,
   no iOS gray flash. Same buttons render and function on desktop.
   Keyboard shortcuts (H / V / Esc) remain wired in `GameView` via the
   existing `window.keydown` listener; both paths land on the same
   `setProbeMode` setter.

5. **Exact confirm interaction path on touch:** **tap on a resolved
   numbered (non-occluded) tile**. `BoardRenderer.dispatchTap` (factored
   out of the prior inline left-click switch) reads the tile and routes:
   resolved + protected-occluded → `onUnveil`; resolved + adjacentMines
   > 0 → `onConfirm`; otherwise → `onReveal`. So a single tap on a
   numbered tile already dispatches `confirm`, with the engine's chord-
   precondition check (flag count matches, ≥1 unresolved neighbor) as
   the only acceptance gate. No new toggle / armed mode / extra button —
   the existing tile-state routing **is** the confirm path. Middle-
   click stays on desktop as a redundant alias; mobile users do not
   need it because the same action is reachable by tapping the same
   tile they would have read. Accidental-confirm risk is low: confirm
   on a tile whose flags don't match the constraint is an engine no-op,
   and the worst-case (a correctly-configured neighborhood with one
   wrong flag) breaches — same as a wrong reveal would, by the same
   underlying mechanic. Intentionality is preserved by tile state, not
   by mode.

6. **Desktop compatibility notes:** zero behavioral regression in the
   common case. The pointerdown handler routes by `pointerType` — only
   `'touch'` enters the gesture path, so mouse and pen continue to use
   the existing button-based switch. Right-click flagging is unchanged.
   Middle-click confirm is unchanged. Hover preview is unchanged.
   Probe arming via H / V / Esc is unchanged. The new probe action
   buttons are an additive HUD control on desktop (some operators may
   prefer the click; either path lands on the same setter). The new
   `applyFitScale` will scale-down the board on a desktop window that
   is *narrower than the board needs* (previously it would clip) — a
   silent improvement, not a regression. Scale is capped at 1.0, so on
   a normal-sized desktop window the board renders pixel-for-pixel at
   the original 32-px tile size.

7. **Explicitly deferred:** drag / swipe / pinch / multi-touch gestures
   for any core action (the brief forbade them); a separate mobile-
   tuned board geometry (smaller grid, larger tiles) — left to a later
   pass once we see actual play data; haptic feedback on flag long-
   press; on-board indicator that distinguishes "tap will reveal" vs
   "tap will confirm" vs "tap will unveil" (today the tile state
   conveys this implicitly, and the brief explicitly accepted that the
   player must always know "what will happen if I tap this tile?"
   from the tile state); a dedicated Confirm-mode toggle button; mobile-
   specific tile-size scaling beyond uniform fit; gesture-based
   probe-mode arming; landscape-specific layout overrides (one
   breakpoint); long-press timing tuneable from settings; drag-out-of-
   tile behavior beyond the 10 px movement cancellation (today, drift
   past 10 px just cancels — there is no ongoing drag tracking). I
   was unable to do live in-browser regression testing in this
   environment, so this v1 ships verified-by-typecheck-and-build only;
   the next exchange should sanity-check the touch path on at least
   one phone before promoting any of this to canon for keeps.

### 2026-04-24 — Claude Opus 4.7 (mobile default board size)
Extension to Mobile Playability v1: viewport-aware initial board
defaults so the first phone-browser run is "I want one more run", not
"I need pinch-zoom therapy." The 24×24 / 99 expert field is right for
serious desktop play and stays the desktop default; on phones the same
density renders at ~14 CSS px per tile and the operator drowns. We now
boot the engine with one of two configs based on a single `matchMedia`
read at module load. Three Canon facts that previously asserted a
single default are demoted because the default has bifurcated.
Verbatim:

**Superseded — Stage opener (single-default field):**
> Reveal / flag / breach / clear loop under a finite **witness charge** budget
> on a 24×24 / 99-hazard default field, with **Witness Confirmation** (chord)

**Superseded — Witness charge default-budget line:**
>   no shops, no batteries. Default budget: 18 charges on a 24×24, 99-hazard
>   field.

**Superseded — visual-proof opener (single-default field):**
> 24×24 interactive grid (99 hazards default) with the full reveal / flag /
> confirm / probe / unveil loop under a witness budget. Plays on desktop
> (mouse + keyboard) and mobile (touch + visible HUD controls) without a
> forked codepath — the renderer routes per-tile-state intent and the layout
> stacks on narrow viewports:

Output contract addition:

8. **Exact mobile default board-size detection + initialization
   behavior.** Detection: `window.matchMedia('(max-width: 768px)')
   .matches` evaluated once at module load (in a top-level
   `pickInitialConfig()` whose result is bound to a module-scope
   `INITIAL_CONFIG` constant). 768 px is the conventional phone+
   small-tablet breakpoint and matches the "interaction surface, not
   device identity" rule the brief asked for: it answers "can a finger
   comfortably operate this?" rather than "is this technically a
   phone?" Two `typeof` guards (`window`, `window.matchMedia`) keep
   the call safe in non-DOM environments (a future SSR build, a
   headless test harness) — the missing-API path falls through to
   the desktop config. We deliberately do NOT subscribe to the
   matchMedia change event, do NOT re-read the breakpoint on resize,
   and do NOT read it on every render — the choice is frozen at page
   load. Chosen mobile config: `{ width: 16, height: 16, mineCount:
   40, witnessCharges: 12 }` (the historical 16×16 / 40 / 12
   baseline already documented in the desktop comment as the
   pre-Protected-Constraints field, so this is a clean restoration
   rather than a new tuning). Desktop config unchanged: `{ width:
   24, height: 24, mineCount: 99, witnessCharges: 18 }`. Active-board
   non-mutation is enforced by structure, not by a runtime guard:
   `INITIAL_CONFIG` is consumed exactly once by `useReducer` at
   `GameView` mount, and `regen` (the only path that re-creates a
   board) does `createGameState({ ...state.board.config, seed:
   action.seed })` — same width, same height, same mineCount, same
   witnessCharges, only the seed changes. So rotating the phone,
   crossing the breakpoint via devtools, or hitting reseed cannot
   move a 16×16 run to 24×24 (or vice versa) — same seed + same
   chosen config still picks out the same board, forever. Reading
   the breakpoint at module load also means an HMR reload during
   development picks up viewport changes naturally; production runs
   are end-to-end frozen. Files changed: `src/ui/GameView.tsx`
   (split `INITIAL_CONFIG` into `DESKTOP_INITIAL_CONFIG` /
   `MOBILE_INITIAL_CONFIG` plus a `pickInitialConfig()` selector,
   reworked the existing comment to reflect the bifurcation),
   `DIRECTORS_NOTES.md` (this entry plus three Canon edits with
   verbatim demotion). Explicitly deferred: a difficulty-selector
   UI, a board-size settings menu, per-device persistence, tablet-
   specific cases, gesture-driven mid-run difficulty changes — the
   brief forbade all of these and the cathedral they would build.
