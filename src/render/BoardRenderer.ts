import { Application, Container, Graphics } from 'pixi.js';
import type { Board, GameState } from '../types';

// Pixi v8 rendering of the board. This is a one-way consumer of engine state
// plus a one-way emitter of pointer intent. No game rules live here.

const TILE_SIZE = 32;
const TILE_GAP = 2;

const COLOR_TILE_IDLE = 0x1b2430;
const COLOR_TILE_HOVER = 0x2d4056;
const COLOR_TILE_SELECT = 0x2a7a78;
const COLOR_STROKE_IDLE = 0x0d1218;
const COLOR_STROKE_HOVER = 0x4a6b8a;
const COLOR_STROKE_SELECT = 0x7effff;

export interface BoardRendererEvents {
  onHover(x: number, y: number): void;
  onHoverClear(): void;
  onSelect(x: number, y: number): void;
}

export class BoardRenderer {
  private readonly app: Application;
  private readonly events: BoardRendererEvents;
  private readonly root: Container;
  private tiles: Graphics[] = [];
  private currentBoard: Board | null = null;

  constructor(app: Application, events: BoardRendererEvents) {
    this.app = app;
    this.events = events;
    this.root = new Container();
    this.app.stage.addChild(this.root);
  }

  render(state: GameState): void {
    if (this.currentBoard !== state.board) {
      this.rebuildBoard(state.board);
      this.currentBoard = state.board;
    }
    this.paint(state);
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.tiles = [];
    this.currentBoard = null;
  }

  private rebuildBoard(board: Board): void {
    this.root.removeChildren();
    this.tiles = [];
    const { width, height } = board.config;

    const pixelWidth = width * TILE_SIZE + (width - 1) * TILE_GAP;
    const pixelHeight = height * TILE_SIZE + (height - 1) * TILE_GAP;
    this.root.x = Math.round((this.app.screen.width - pixelWidth) / 2);
    this.root.y = Math.round((this.app.screen.height - pixelHeight) / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const g = new Graphics();
        g.x = x * (TILE_SIZE + TILE_GAP);
        g.y = y * (TILE_SIZE + TILE_GAP);
        g.eventMode = 'static';
        g.cursor = 'pointer';
        const hx = x;
        const hy = y;
        g.on('pointerover', () => this.events.onHover(hx, hy));
        g.on('pointerout', () => this.events.onHoverClear());
        g.on('pointerdown', () => this.events.onSelect(hx, hy));
        this.root.addChild(g);
        this.tiles.push(g);
      }
    }
  }

  private paint(state: GameState): void {
    const { width, height } = state.board.config;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const g = this.tiles[y * width + x];
        const isHover = state.cursor?.x === x && state.cursor?.y === y;
        const isSelect = state.selection?.x === x && state.selection?.y === y;

        let fill = COLOR_TILE_IDLE;
        let stroke = COLOR_STROKE_IDLE;
        if (isSelect) {
          fill = COLOR_TILE_SELECT;
          stroke = COLOR_STROKE_SELECT;
        } else if (isHover) {
          fill = COLOR_TILE_HOVER;
          stroke = COLOR_STROKE_HOVER;
        }

        g.clear();
        g.rect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fill(fill);
        g.stroke({ color: stroke, width: 1, alignment: 0 });
      }
    }
  }
}
