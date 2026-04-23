# Gridshadow: Witness Protocol

A tactical minesweeper roguelike about diagnosing failure inside a hostile constraint field.

Gridshadow treats the board as a living system rather than a puzzle sheet. You are not "clearing mines" — you are operating inside a damaged computational substrate, resolving unstable regions, tracing hidden dependencies, and deciding which risks to absorb.

Each board is a semantic battlefield:

* uncertain information
* cascading failure
* hidden structure
* partial observability
* deliberate tradeoffs between safety and progress

The fantasy is less "desktop puzzle game" and more:
**remote operator inside a failing reactor performing manual stabilization passes.**

Core pillars:

* deterministic tactical play
* information as a resource
* meaningful ambiguity, not random guessing
* system diagnosis over raw reflexes
* persistent progression through increasingly hostile constraint fields

Minesweeper is the surface language.
The real game is learning how to read the machine.

---

## Current status

This repository is at the **substrate** stage. It provides:

* a deterministic, seed-driven engine core with no framework coupling
* a PixiJS rendering client that consumes engine snapshots
* a React shell that dispatches actions back into the engine
* a clean GitHub Pages deployment path

No gameplay (reveal, flag, scoring, progression, shops, metagame) has been built yet, and by design. This pass is about the first clean stone.

---

## Stack

| Layer          | Choice                          | Why                                                                 |
| -------------- | ------------------------------- | ------------------------------------------------------------------- |
| Language       | TypeScript (strict)             | Legible invariants; catches engine/render contract drift early.     |
| Build          | Vite                            | Fast dev, trivial static output, first-class TS/React support.      |
| UI shell       | React 18                        | Thin HUD / overlays only — not the game rendering surface.          |
| Rendering      | PixiJS v8                       | GPU-accelerated 2D canvas; decoupled from engine state.             |
| Deterministic  | In-house seeded RNG (mulberry32)| Same seed → same board, forever.                                    |
| Deploy         | GitHub Actions → Pages          | One push to `main` publishes `dist/`.                               |

Explicitly rejected (for this phase): Unity/Godot, Rust/WASM, any networking layer, any backend.

---

## Project layout

```
src/
  engine/     # pure, deterministic rules/state. no react, no pixi.
    rng.ts       seedable PRNG (mulberry32 + FNV-1a hashing)
    board.ts     board generation + adjacency (pure)
    state.ts     GameState reducer: hover / select / regen
    index.ts     public engine surface
  render/     # PixiJS rendering client of the engine
    BoardRenderer.ts
    index.ts
  ui/         # React shell, HUD, overlays — nothing gameplay-critical
    App.tsx
    GameView.tsx
    HUD.tsx
  systems/    # reserved for future simulation systems
  types/      # shared contract types (board, tile, game state)
  main.tsx    # React entry
  styles.css
index.html
vite.config.ts
tsconfig.json
.github/workflows/deploy.yml
```

The engine layer is the hard boundary. It must never import from `render/` or `ui/`. Rendering and UI are clients of engine snapshots and dispatch engine actions; they do not mutate engine state directly. This is what makes an eventual authoritative multiplayer host feasible without rewriting the rules.

---

## Philosophy — why engine-first

A tactical roguelike lives or dies on whether its rules are **legible, deterministic, and portable**. Three constraints follow from that:

1. **Seed in, board out.** A `seed` fully determines the board. Debugging, replays, daily challenges, and multiplayer parity all fall out of this for free — but only if the rules never quietly reach for `Math.random`, `Date.now`, `performance.now`, or the DOM.
2. **The engine knows nothing about how it is drawn.** Rendering is a consumer. Swap PixiJS for WebGPU, for a headless test harness, or for a server-side tick loop without touching the rules.
3. **The UI never owns truth.** React renders HUD and overlays, but the engine owns state and transitions. A React component dying mid-frame cannot corrupt the simulation.

Everything downstream — information economy, cascading failure, diagnosis systems, progression — assumes this discipline. It is cheaper to hold the line now than to excavate it later.

---

## Local bootstrap

Requires Node 20+ (Node 25 works fine). pnpm preferred if present; npm is acceptable and is what this repo's lockfile uses.

```bash
# 1. Install
npm install

# 2. Run the dev server (http://localhost:5173)
npm run dev

# 3. Typecheck
npm run typecheck

# 4. Production build (outputs to dist/)
npm run build

# 5. Preview the production build locally
npm run preview
```

The happy path is `npm install && npm run dev`.

---

## Deployment (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which:

1. Installs with `npm ci`.
2. Builds with `GITHUB_PAGES=true npm run build`, which flips Vite's `base` to `/Gridshadow/` so assets resolve at `https://<user>.github.io/Gridshadow/`.
3. Uploads `dist/` via `actions/upload-pages-artifact@v3`.
4. Deploys via `actions/deploy-pages@v4`.

One-time repo setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.** No other config is required.

Manual deploys are available via the workflow's `workflow_dispatch` trigger.

---

## What the current proof object does

* Renders a 16×16 interactive board (Pixi canvas).
* Hover highlights a tile; the HUD reflects the cursor coordinate.
* Click selects a tile (click again to deselect); HUD reflects the selection.
* "Reseed" regenerates a deterministic board from a new seed.
* Board generation is pure: same seed → byte-identical board, every time.

This is intentionally the floor, not the ceiling. Reveal, flag, cascade, scoring, and every other gameplay mechanic are explicit non-goals for this pass.

---

## Contributing conventions

See `CLAUDE.md` for working guidelines and `DIRECTORS_NOTES.md` for the living design log (Current Canon + append-only pivots).
