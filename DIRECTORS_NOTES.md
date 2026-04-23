# DIRECTORS_NOTES

Living design doc. **Current Canon** is the present-state truth — edit in place.
**Resolved Dragons and Pivots** is append-only; once written, entries are not edited.

When a fact stops being true in Canon, move the old text **verbatim** into the
archive with a new dated entry that supersedes it.

---

## Current Canon

### Stage
Reveal / flag / breach loop implemented. The board speaks Minesweeper with
Witness Protocol vocabulary: tiles are `unresolved | resolved | flagged`,
and the run phase is `active` or `breached`. Next substantive foundation
decisions: win condition (full resolution without breach), chord
interactions, and an information-budget system. Still foundation work —
not progression, metagame, or content.

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
* `createGameState(config: BoardConfig): GameState` — produces an `active` phase.
* `reduceGame(state, action): GameState` where action is one of
  `hover | hoverClear | reveal | flag | regen`. Pure.
* `generateBoard(config)`: deterministic from `{width, height, mineCount, seed}`.
  Computes `isMine` and `adjacentMines`.
* `tallyTiles(state): TileTally` — pure derivation of
  unresolved / resolved / flagged counts, for HUD and future observers.
* `reveal` is the only action that can change `phase`: revealing a mine
  transitions to `{ kind: 'breached', at }`. Both `reveal` and `flag` are
  no-ops while breached; `regen` resets phase to `active`.
* Reveal cascades: revealing a tile with `adjacentMines === 0` floods through
  connected zero-adjacency tiles, revealing their numbered borders too.
  Flagged tiles stop propagation.
* First-click safety is intentionally NOT implemented: the seed fully
  determines the board, so the first reveal can legitimately detonate.
  The player learning to read the field is the game.

### What the visual proof does
16×16 interactive grid with the full reveal/flag loop:
* left-click resolves a tile; zero-adjacency regions flood-reveal
* right-click toggles a flag (browser context menu is suppressed over the board)
* revealing a hazard transitions phase to `breached`, renders remaining hazards
  (render-only — engine leaves them `unresolved`), tints mis-flagged tiles red,
  and disables further pointer actions
* HUD shows seed, field dims, hazard count, tile tallies, cursor, phase,
  and a breach banner when applicable
* reseed regenerates a fresh active board from a new seed

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
