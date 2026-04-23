import {
  Application,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
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

const STROKE_UNRESOLVED = 0x0d1218;
const STROKE_UNRESOLVED_HOVER = 0x4a6b8a;
const STROKE_RESOLVED = 0x1a252f;
const STROKE_FLAGGED = 0x6a4a1a;
const STROKE_MINE_REVEALED = 0x6a2a2a;
const STROKE_BREACH = 0xff4655;
const STROKE_STABILIZED = 0x2a5a6a;

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
// Cleared-phase glyph colors — hazards become dormant sentinels, correctly
// flagged tiles read as corroborated, safe tiles keep their constraint
// colors (they already tell the truth).
const COLOR_MINE_GLYPH_STABILIZED = 0x7a8a95;
const COLOR_FLAG_GLYPH_STABILIZED = 0x7effff;
// Probe preview — an inset cyan outline on the would-be scanned segment.
// Inset (not overdraw) so the underlying fill and stroke remain readable;
// the preview is instrumentation, not a selection state.
const COLOR_PROBE_PREVIEW = 0x7effff;

const GLYPH_FLAG = '⚑';
const GLYPH_MINE = '●';

export interface BoardRendererEvents {
  onHover(x: number, y: number): void;
  onHoverClear(): void;
  onReveal(x: number, y: number): void;
  onFlag(x: number, y: number): void;
  onConfirm(x: number, y: number): void;
}

// Per-frame UI-layer overlay: state the renderer should *paint* but that
// the engine does not (and should not) own. Kept separate from GameState so
// adding more overlays (path previews, constraint highlights) does not
// pollute the reducer's state shape.
export interface RenderOverlay {
  readonly probeMode: ProbeOrientation | null;
}

export class BoardRenderer {
  private readonly app: Application;
  private readonly events: BoardRendererEvents;
  private readonly root: Container;
  private tileBackgrounds: Graphics[] = [];
  private tileGlyphs: Text[] = [];
  private currentBoard: Board | null = null;

  constructor(app: Application, events: BoardRendererEvents) {
    this.app = app;
    this.events = events;
    this.root = new Container();
    this.app.stage.addChild(this.root);
  }

  render(state: GameState, overlay: RenderOverlay): void {
    if (this.currentBoard !== state.board) {
      this.rebuildBoard(state.board);
      this.currentBoard = state.board;
    }
    this.paint(state, overlay);
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.tileBackgrounds = [];
    this.tileGlyphs = [];
    this.currentBoard = null;
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
          const tile = this.currentBoard?.tiles[hy * this.currentBoard.config.width + hx];
          if (tile && tile.state === 'resolved' && !tile.isMine && tile.adjacentMines > 0) {
            this.events.onConfirm(hx, hy);
          } else {
            this.events.onReveal(hx, hy);
          }
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

    // Derive the probe preview's set of tile indices once per paint. The
    // segment geometry comes from the engine's own `probeSegment`, so the
    // preview outline cannot drift from what the probe action actually
    // scans. Preview only appears in active phase + probe mode on + cursor
    // on-board — terminal phases suppress it along with hover.
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

    if (tile.state === 'resolved') {
      if (tile.isMine) {
        // Only the detonated tile is "resolved + mine" via the engine; other
        // revealed mines come through the breached-unresolved branch below.
        fill = isBreachTile ? TILE_BREACH : TILE_MINE_REVEALED;
        stroke = isBreachTile ? STROKE_BREACH : STROKE_MINE_REVEALED;
        text = GLYPH_MINE;
        color = isBreachTile ? COLOR_BREACH_GLYPH : COLOR_MINE_GLYPH;
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
}
