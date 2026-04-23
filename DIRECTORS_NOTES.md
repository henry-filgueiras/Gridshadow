# DIRECTORS_NOTES

Living design doc. **Current Canon** is the present-state truth — edit in place.
**Resolved Dragons and Pivots** is append-only; once written, entries are not edited.

When a fact stops being true in Canon, move the old text **verbatim** into the
archive with a new dated entry that supersedes it.

---

## Current Canon

### Stage
Substrate only. No gameplay. The next substantive design decisions should be
about reveal semantics, information economy, and the cascading-failure model —
not about rendering, build, or deploy.

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
* `createGameState(config: BoardConfig): GameState`
* `reduceGame(state, action): GameState` where action is one of
  `hover | hoverClear | select | regen`.
* `generateBoard(config)`: deterministic from `{width, height, mineCount, seed}`.
  Computes `isMine` and `adjacentMines`. No reveal/flag/win/loss logic yet.

### What the visual proof does
16×16 interactive grid. Hover, tile selection (toggle), deterministic reseed
via the HUD. That is the entire gameplay surface. Everything else is
intentionally absent.

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
