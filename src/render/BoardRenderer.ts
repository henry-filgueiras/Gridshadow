import {
  Application,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  type TickerCallback,
  Text,
} from 'pixi.js';
import { probeSegment } from '../engine';
import type { Board, Coord, GameState, ProbeOrientation, Tile } from '../types';

// Pixi v8 rendering of the board. This is a one-way consumer of engine state
// plus a one-way emitter of pointer intent. No game rules live here.

const TILE_SIZE = 32;
const TILE_GAP = 2;

// Palette — Witness Protocol reactor feel. Unresolved tiles sit "raised"
// (lighter) over resolved ones (recessed/darker).
const TILE_UNRESOLVED = 0x1b2430;
const TILE_UNRESOLVED_HOVER = 0x2d4056;
const TILE_RESOLVED = 0x0a1118;
const TILE_FLAGGED = 0x221a10;
const TILE_MINE_REVEALED = 0x2a0e0e;
const TILE_BREACH = 0x5a1a1a;
// Cleared-phase: hazards sit dormant (desaturated) and stabilized safe tiles
// pick up a faint cyan wash so the field reads as resolved, not inert.
const TILE_MINE_STABILIZED = 0x0f1a22;
const TILE_RESOLVED_STABILIZED = 0x0e1a22;
const TILE_FLAGGED_STABILIZED = 0x12202a;
// Protected Constraints v1 — occluded safe tiles. Distinct from regular
// resolved (so the operator can see they need to pay to read the value)
// without bleeding into the probe-preview register (which is inset cyan).
// Palette: slightly cooler fill than resolved, a muted-cyan stroke, and
// a sealed sigil glyph where the number would otherwise sit.
const TILE_PROTECTED = 0x0d1c22;
const TILE_PROTECTED_STABILIZED = 0x0f2028;

const STROKE_UNRESOLVED = 0x0d1218;
const STROKE_UNRESOLVED_HOVER = 0x4a6b8a;
const STROKE_RESOLVED = 0x1a252f;
const STROKE_FLAGGED = 0x6a4a1a;
const STROKE_MINE_REVEALED = 0x6a2a2a;
const STROKE_BREACH = 0xff4655;
const STROKE_STABILIZED = 0x2a5a6a;
const STROKE_PROTECTED = 0x2d5a68;
// Inset accent on occluded tiles — the "seal" border that tells the
// operator this tile withholds its number. Quieter than the probe preview
// on purpose: probe is a live instrument overlay, protected is static
// board state.
const COLOR_PROTECTED_ACCENT = 0x3a7e8a;

// Constraint-count glyph colors: cool → warm as the region's pressure rises.
const CONSTRAINT_COLORS: readonly number[] = [
  0x7effff, // 1 — cyan
  0x7effa1, // 2 — mint
  0xffdf7e, // 3 — amber
  0xff9a7e, // 4 — coral
  0xff7e9c, // 5 — rose
  0xcf7eff, // 6 — violet
  0xffffff, // 7 — white
  0xff4655, // 8 — red
];

const COLOR_FLAG_GLYPH = 0xffcf7e;
const COLOR_FLAG_GLYPH_WRONG = 0xff4655;
const COLOR_MINE_GLYPH = 0xff4655;
const COLOR_BREACH_GLYPH = 0xffe0e0;
// Occluded constraint sigil. Cool, muted — reads as "sealed" rather than
// "interactive". After unveil, the tile swaps to the normal constraint
// palette and this glyph is never shown.
const COLOR_PROTECTED_GLYPH = 0x6fa8b5;
const COLOR_PROTECTED_GLYPH_STABILIZED = 0x4a8892;
// Cleared-phase glyph colors — hazards become dormant sentinels, correctly
// flagged tiles read as corroborated, safe tiles keep their constraint
// colors (they already tell the truth).
const COLOR_MINE_GLYPH_STABILIZED = 0x7a8a95;
const COLOR_FLAG_GLYPH_STABILIZED = 0x7effff;
// Probe preview — an inset cyan outline on the would-be scanned segment.
// Inset (not overdraw) so the underlying fill and stroke remain readable;
// the preview is instrumentation, not a selection state.
const COLOR_PROBE_PREVIEW = 0x7effff;
// Contradiction halo — a red stroke around a resolved numbered tile whose
// local flag/unresolved counts make its adjacency constraint impossible to
// satisfy. Different register from the probe preview: it's a truth claim
// ("this cannot be true"), not instrumentation. Draws on its own layer so
// the pulse animation does not repaint the whole tile grid every frame.
const COLOR_CONTRADICTION = 0xff4655;
// Pulse period chosen fast enough to read as a live warning, slow enough
// to avoid casino-flash urgency. Alpha oscillates in [MIN, MAX] — never
// fully fades, so the halo remains unmistakable even at trough.
const CONTRADICTION_PULSE_PERIOD_MS = 1100;
const CONTRADICTION_ALPHA_MIN = 0.55;
const CONTRADICTION_ALPHA_MAX = 1.0;

const GLYPH_FLAG = '⚑';
const GLYPH_MINE = '●';
// Diamond-in-diamond: reads as a sealed container without collapsing into
// any existing register (flag/mine/number). Widely supported across
// platform fonts.
const GLYPH_PROTECTED = '◈';

export interface BoardRendererEvents {
  onHover(x: number, y: number): void;
  onHoverClear(): void;
  onReveal(x: number, y: number): void;
  onFlag(x: number, y: number): void;
  onConfirm(x: number, y: number): void;
  // Protected Constraints v1: emitted when the operator left-clicks a
  // resolved, protected, not-yet-unveiled tile. The engine handles the
  // charge deduction and the `valueRevealed` flip; the renderer just
  // routes the intent based on tile state. GameView may choose to
  // re-route this to a different action (e.g., while probe mode is
  // armed) — input *policy* belongs above the renderer.
  onUnveil(x: number, y: number): void;
}

// Per-frame UI-layer overlay: state the renderer should *paint* but that
// the engine does not (and should not) own. Kept separate from GameState so
// adding more overlays (path previews, constraint highlights) does not
// pollute the reducer's state shape.
export interface RenderOverlay {
  readonly probeMode: ProbeOrientation | null;
  // When the operator hovers a probe-history entry in the HUD, the
  // corresponding segment's cells are passed here so the board re-highlights
  // exactly what that probe scanned. Same visual language as the live probe
  // preview — this is "what did I learn?" projected back onto the field.
  readonly historyHighlight: ReadonlyArray<Coord> | null;
  // Row-major `y * width + x` indices of resolved numbered tiles whose
  // constraint cannot be satisfied from the current flag/unresolved layout.
  // The engine's `detectContradictions` selector is the authority; the
  // renderer only paints the halo. An empty set (or null) means no halos.
  readonly contradictions: ReadonlySet<number> | null;
}

export class BoardRenderer {
  private readonly app: Application;
  private readonly events: BoardRendererEvents;
  private readonly root: Container;
  // Dedicated overlay for contradiction halos. Sits above the tile root so
  // the halo stroke draws over tile fills without obscuring the constraint
  // glyph underneath. Geometry rebuilds only when the contradiction set
  // changes; a ticker animates its alpha each frame for the pulse.
  private readonly haloLayer: Graphics;
  private readonly haloTicker: TickerCallback<BoardRenderer>;
  private haloPulseT = 0;
  // Cached key of the last-painted contradiction set, so we only rebuild
  // the halo geometry when the set actually changes. Sorted comma-joined
  // list of row-major indices — stable across renders that don't change it.
  private lastContradictionKey = '';
  private tileBackgrounds: Graphics[] = [];
  private tileGlyphs: Text[] = [];
  private currentBoard: Board | null = null;

  constructor(app: Application, events: BoardRendererEvents) {
    this.app = app;
    this.events = events;
    this.root = new Container();
    this.haloLayer = new Graphics();
    this.haloLayer.alpha = 0;
    this.app.stage.addChild(this.root);
    this.app.stage.addChild(this.haloLayer);

    // Pulse animation lives here, not in paint(), so we don't repaint the
    // 256 tile graphics every frame just to animate a stroke alpha. The
    // ticker is cheap — one sin() per tick on a layer with a handful of
    // rects at most.
    this.haloTicker = (ticker) => {
      if (this.lastContradictionKey === '') {
        if (this.haloLayer.alpha !== 0) this.haloLayer.alpha = 0;
        return;
      }
      this.haloPulseT += ticker.deltaMS;
      const phase =
        (this.haloPulseT % CONTRADICTION_PULSE_PERIOD_MS) /
        CONTRADICTION_PULSE_PERIOD_MS;
      // 0 → 1 → 0 triangle mapped through cosine for smooth ease.
      const eased = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      this.haloLayer.alpha =
        CONTRADICTION_ALPHA_MIN +
        (CONTRADICTION_ALPHA_MAX - CONTRADICTION_ALPHA_MIN) * eased;
    };
    this.app.ticker.add(this.haloTicker, this);
  }

  render(state: GameState, overlay: RenderOverlay): void {
    if (this.currentBoard !== state.board) {
      this.rebuildBoard(state.board);
      this.currentBoard = state.board;
    }
    this.paint(state, overlay);
    this.paintHalos(state, overlay);
  }

  destroy(): void {
    this.app.ticker.remove(this.haloTicker, this);
    this.haloLayer.destroy();
    this.root.destroy({ children: true });
    this.tileBackgrounds = [];
    this.tileGlyphs = [];
    this.currentBoard = null;
    this.lastContradictionKey = '';
  }

  private rebuildBoard(board: Board): void {
    this.root.removeChildren();
    this.tileBackgrounds = [];
    this.tileGlyphs = [];
    const { width, height } = board.config;

    const pixelWidth = width * TILE_SIZE + (width - 1) * TILE_GAP;
    const pixelHeight = height * TILE_SIZE + (height - 1) * TILE_GAP;
    this.root.x = Math.round((this.app.screen.width - pixelWidth) / 2);
    this.root.y = Math.round((this.app.screen.height - pixelHeight) / 2);
    // Halo layer rides the same origin as the tile grid, so halo geometry
    // can be expressed in tile-local coordinates (parallel to rebuildBoard
    // and paintHalos) rather than re-adding the board offset everywhere.
    this.haloLayer.x = this.root.x;
    this.haloLayer.y = this.root.y;
    // Board rebuilt — old halo geometry no longer valid. Force a rebuild
    // on the next paint cycle rather than paint into potentially-stale
    // coordinate space.
    this.haloLayer.clear();
    this.lastContradictionKey = '';

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const container = new Container();
        container.x = x * (TILE_SIZE + TILE_GAP);
        container.y = y * (TILE_SIZE + TILE_GAP);
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.hitArea = new Rectangle(0, 0, TILE_SIZE, TILE_SIZE);

        const hx = x;
        const hy = y;
        container.on('pointerover', () => this.events.onHover(hx, hy));
        container.on('pointerout', () => this.events.onHoverClear());
        container.on('pointerdown', (event: FederatedPointerEvent) => {
          // button: 0 = left, 1 = middle, 2 = right. Middle and left-on-a-
          // resolved-numbered-tile both request a Witness Confirmation; the
          // engine rejects the action if preconditions aren't met, so the
          // renderer doesn't duplicate gameplay rules — it only routes the
          // most natural input for each tile state.
          if (event.button === 1) {
            this.events.onConfirm(hx, hy);
            return;
          }
          if (event.button === 2) {
            this.events.onFlag(hx, hy);
            return;
          }
          if (event.button !== 0) return;
          const tile =
            this.currentBoard?.tiles[hy * this.currentBoard.config.width + hx];
          if (tile && tile.state === 'resolved' && !tile.isMine) {
            // Protected-occluded: left-click buys the number (engine
            // validates charge and state). A protected tile after
            // unveiling behaves like any other numbered tile — falls
            // through to the confirm branch below.
            if (tile.protected && !tile.valueRevealed) {
              this.events.onUnveil(hx, hy);
              return;
            }
            if (tile.adjacentMines > 0) {
              this.events.onConfirm(hx, hy);
              return;
            }
            // Zero-adjacency resolved: nothing actionable. Fall through
            // to onReveal so probe mode (which routes through
            // `onReveal`) still has a chance to fire on resolved
            // zero-cells — the engine will refuse, but routing stays
            // predictable.
          }
          this.events.onReveal(hx, hy);
        });

        const bg = new Graphics();
        const glyph = new Text({
          text: '',
          style: {
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: 16,
            fontWeight: 'bold',
            fill: 0xffffff,
            align: 'center',
          },
        });
        glyph.anchor.set(0.5);
        glyph.x = TILE_SIZE / 2;
        glyph.y = TILE_SIZE / 2;

        container.addChild(bg);
        container.addChild(glyph);
        this.root.addChild(container);

        this.tileBackgrounds.push(bg);
        this.tileGlyphs.push(glyph);
      }
    }
  }

  private paint(state: GameState, overlay: RenderOverlay): void {
    const { width, height } = state.board.config;
    const breachAt: Coord | null =
      state.phase.kind === 'breached' ? state.phase.at : null;
    const breached = breachAt !== null;
    const cleared = state.phase.kind === 'cleared';

    // Derive the probe preview's set of tile indices once per paint. Two
    // sources feed it, sharing one visual (inset cyan outline):
    //   - live probe-mode preview driven by the on-board cursor
    //   - history re-highlight driven by a HUD hover
    // Both use the same cells-to-indices set, so the painter doesn't care
    // which one produced it. The live preview's geometry comes from the
    // engine's own `probeSegment`, and the history highlight's cells come
    // straight from the stored `ProbeReading.cells` — neither path can
    // drift from what the probe action actually scanned. Terminal phases
    // suppress the live preview; history highlighting remains available so
    // the operator can still look back over their ledger.
    let previewCells: Set<number> | null = null;
    if (
      overlay.probeMode !== null &&
      state.cursor !== null &&
      !breached &&
      !cleared
    ) {
      const cells = probeSegment(
        width,
        height,
        state.cursor.x,
        state.cursor.y,
        overlay.probeMode,
      );
      previewCells = new Set(cells.map((c) => c.y * width + c.x));
    }
    if (overlay.historyHighlight !== null) {
      if (previewCells === null) previewCells = new Set();
      for (const c of overlay.historyHighlight) {
        previewCells.add(c.y * width + c.x);
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        this.paintTile(
          state.board.tiles[idx]!,
          idx,
          state,
          breached,
          breachAt,
          cleared,
          previewCells?.has(idx) ?? false,
        );
      }
    }
  }

  private paintTile(
    tile: Tile,
    idx: number,
    state: GameState,
    breached: boolean,
    breachAt: Coord | null,
    cleared: boolean,
    isProbePreview: boolean,
  ): void {
    const bg = this.tileBackgrounds[idx]!;
    const glyph = this.tileGlyphs[idx]!;
    // Hover highlight is suppressed in any terminal phase — the field is no
    // longer interactive, so the pointer should stop "suggesting" reveals.
    // Also suppressed in probe mode: the 5-cell preview outline is the
    // relevant affordance, and a standalone hover on the center tile would
    // just clutter it.
    const isHover =
      !breached &&
      !cleared &&
      !isProbePreview &&
      state.cursor?.x === tile.x &&
      state.cursor?.y === tile.y;
    const isBreachTile =
      breachAt !== null && breachAt.x === tile.x && breachAt.y === tile.y;

    let fill = TILE_UNRESOLVED;
    let stroke = STROKE_UNRESOLVED;
    let text = '';
    let color = 0xffffff;

    const isOccluded =
      tile.state === 'resolved' &&
      !tile.isMine &&
      tile.protected &&
      !tile.valueRevealed;

    if (tile.state === 'resolved') {
      if (tile.isMine) {
        // Only the detonated tile is "resolved + mine" via the engine; other
        // revealed mines come through the breached-unresolved branch below.
        fill = isBreachTile ? TILE_BREACH : TILE_MINE_REVEALED;
        stroke = isBreachTile ? STROKE_BREACH : STROKE_MINE_REVEALED;
        text = GLYPH_MINE;
        color = isBreachTile ? COLOR_BREACH_GLYPH : COLOR_MINE_GLYPH;
      } else if (isOccluded) {
        // Occluded safe tile — the operator knows this is safe but has
        // not paid to read its constraint. Distinct fill + stroke +
        // sigil glyph, quiet enough to avoid competing with number
        // tiles for attention, distinct enough that the pay-to-read
        // affordance is unmissable.
        fill = cleared ? TILE_PROTECTED_STABILIZED : TILE_PROTECTED;
        stroke = cleared ? STROKE_STABILIZED : STROKE_PROTECTED;
        text = GLYPH_PROTECTED;
        color = cleared
          ? COLOR_PROTECTED_GLYPH_STABILIZED
          : COLOR_PROTECTED_GLYPH;
      } else {
        fill = cleared ? TILE_RESOLVED_STABILIZED : TILE_RESOLVED;
        stroke = cleared ? STROKE_STABILIZED : STROKE_RESOLVED;
        if (tile.adjacentMines > 0) {
          text = String(tile.adjacentMines);
          const ci = Math.min(
            tile.adjacentMines - 1,
            CONSTRAINT_COLORS.length - 1,
          );
          color = CONSTRAINT_COLORS[ci]!;
        }
      }
    } else if (tile.state === 'flagged') {
      fill = cleared ? TILE_FLAGGED_STABILIZED : TILE_FLAGGED;
      stroke = cleared ? STROKE_STABILIZED : STROKE_FLAGGED;
      text = GLYPH_FLAG;
      // Mis-flag on breach: keep the flag but tint it so the operator can
      // see where their reading diverged from the field. On clear, every
      // remaining flagged tile is necessarily a hazard (all safe tiles are
      // resolved), so flags read as corroborated — a quiet cyan.
      if (cleared) {
        color = COLOR_FLAG_GLYPH_STABILIZED;
      } else if (breached && !tile.isMine) {
        color = COLOR_FLAG_GLYPH_WRONG;
      } else {
        color = COLOR_FLAG_GLYPH;
      }
    } else {
      // unresolved
      if ((breached || cleared) && tile.isMine) {
        // Render-time reveal of remaining hazards on terminal phases. Engine
        // state remains 'unresolved' — this is purely observability, so
        // replays and audits can still distinguish `detonated` /
        // `resolved-by-cascade` / `merely-exposed-by-ui`.
        fill = cleared ? TILE_MINE_STABILIZED : TILE_MINE_REVEALED;
        stroke = cleared ? STROKE_STABILIZED : STROKE_MINE_REVEALED;
        text = GLYPH_MINE;
        color = cleared ? COLOR_MINE_GLYPH_STABILIZED : COLOR_MINE_GLYPH;
      } else if (isHover) {
        fill = TILE_UNRESOLVED_HOVER;
        stroke = STROKE_UNRESOLVED_HOVER;
      }
    }

    bg.clear();
    bg.rect(0, 0, TILE_SIZE, TILE_SIZE);
    bg.fill(fill);
    bg.stroke({ color: stroke, width: 1, alignment: 0 });

    if (isOccluded) {
      // "Seal" border — a dashed-feeling inset rectangle drawn as four
      // short strokes at the corners. Reads as "this is sealed". Static
      // (no animation): the brief called for subtle, identifiable,
      // never-a-surprise. The corners sit *inside* the tile so the
      // underlying base stroke is untouched and a probe preview outline
      // can still render on top without stacking visual noise.
      const inset = 3;
      const len = 5;
      const right = TILE_SIZE - inset;
      const bottom = TILE_SIZE - inset;
      // Four L-shaped corner brackets
      const corners: Array<[number, number, number, number]> = [
        [inset, inset + len, inset, inset], // top-left vertical
        [inset, inset, inset + len, inset], // top-left horizontal
        [right - len, inset, right, inset], // top-right horizontal
        [right, inset, right, inset + len], // top-right vertical
        [inset, bottom - len, inset, bottom], // bottom-left vertical
        [inset, bottom, inset + len, bottom], // bottom-left horizontal
        [right - len, bottom, right, bottom], // bottom-right horizontal
        [right, bottom - len, right, bottom], // bottom-right vertical
      ];
      for (const [x0, y0, x1, y1] of corners) {
        bg.moveTo(x0, y0);
        bg.lineTo(x1, y1);
      }
      bg.stroke({ color: COLOR_PROTECTED_ACCENT, width: 1, alignment: 0.5 });
    }

    if (isProbePreview) {
      // Inset cyan outline: instrumentation mark, not a selection state.
      // Alignment 1 puts the stroke on the inside edge of the inset rect so
      // it does not overlap the tile's base stroke.
      bg.rect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);
      bg.stroke({ color: COLOR_PROBE_PREVIEW, width: 1.5, alignment: 1 });
    }

    if (glyph.text !== text) glyph.text = text;
    if (glyph.style.fill !== color) glyph.style.fill = color;
  }

  // Rebuild the halo layer's geometry iff the contradiction set changed.
  // Geometry is a set of red-stroked rectangles, one per contradicting
  // resolved numbered tile. Pulse animation is driven by the ticker
  // installed in the constructor — this method only handles "which tiles".
  private paintHalos(state: GameState, overlay: RenderOverlay): void {
    const indices = overlay.contradictions;
    // Derive a stable key so we can skip redraws when the contradiction set
    // is unchanged across rapid-fire paints (e.g., probe-mode hover
    // triggering a fresh render without any flag change).
    let key = '';
    if (indices && indices.size > 0) {
      const sorted = Array.from(indices).sort((a, b) => a - b);
      key = sorted.join(',');
    }

    if (key === this.lastContradictionKey) return;
    this.lastContradictionKey = key;
    this.haloLayer.clear();

    if (key === '' || indices === null) {
      this.haloLayer.alpha = 0;
      return;
    }

    // Reset pulse phase on geometry change so a newly-created contradiction
    // lights up near peak alpha rather than fading in from a random spot.
    this.haloPulseT = 0;

    const { width } = state.board.config;
    for (const idx of indices) {
      const x = idx % width;
      const y = (idx / width) | 0;
      const px = x * (TILE_SIZE + TILE_GAP);
      const py = y * (TILE_SIZE + TILE_GAP);
      // Two strokes stacked: an outer glow-ish rect at lower width for
      // presence, and an inner sharp stroke for unmistakable edge. Both
      // draw within the tile bounds so a halo at the field edge still
      // renders fully — no bleed into the canvas margin.
      this.haloLayer.rect(px - 1, py - 1, TILE_SIZE + 2, TILE_SIZE + 2);
      this.haloLayer.stroke({
        color: COLOR_CONTRADICTION,
        width: 3,
        alpha: 0.35,
        alignment: 0.5,
      });
      this.haloLayer.rect(px, py, TILE_SIZE, TILE_SIZE);
      this.haloLayer.stroke({
        color: COLOR_CONTRADICTION,
        width: 1.5,
        alignment: 0,
      });
    }
  }
}
