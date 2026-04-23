import type { GameState } from '../types';

interface HUDProps {
  state: GameState;
  onReseed: (seed: number) => void;
}

export function HUD({ state, onReseed }: HUDProps) {
  const { config } = state.board;
  return (
    <div className="hud">
      <div className="hud-title">gridshadow // witness protocol</div>
      <div className="hud-row">
        <span className="hud-label">seed</span>
        <span className="hud-value">{config.seed}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">dims</span>
        <span className="hud-value">
          {config.width} × {config.height}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">mines</span>
        <span className="hud-value">{config.mineCount}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">cursor</span>
        <span className="hud-value">
          {state.cursor ? `${state.cursor.x},${state.cursor.y}` : '—'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">selection</span>
        <span className="hud-value">
          {state.selection
            ? `${state.selection.x},${state.selection.y}`
            : '—'}
        </span>
      </div>
      <button
        type="button"
        className="hud-button"
        onClick={() => onReseed(Math.floor(Math.random() * 0x7fffffff))}
      >
        reseed
      </button>
    </div>
  );
}
