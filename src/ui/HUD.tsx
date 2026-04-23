import { useEffect, useRef, useState } from 'react';
import { tallyTiles, witnessStatus } from '../engine';
import type { GameState } from '../types';

interface HUDProps {
  state: GameState;
  onReseed: (seed: number) => void;
}

const RESTORE_FLASH_MS = 1800;

export function HUD({ state, onReseed }: HUDProps) {
  const { config } = state.board;
  const tally = tallyTiles(state);
  const breach = state.phase.kind === 'breached' ? state.phase.at : null;
  const cleared = state.phase.kind === 'cleared';
  const wStatus = witnessStatus(state);
  const { charge, max, confirms } = state.witness;

  // Confidence-restoration flash. The engine's `witness.confirms` counter
  // increments monotonically on every successful safe Witness Confirmation.
  // We detect increments and surface a brief pill. The timer itself is
  // UI-ephemeral — engine state stays deterministic — and the ref-before-
  // effect-body update avoids double-firing under StrictMode.
  const prevConfirmsRef = useRef(confirms);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    const prev = prevConfirmsRef.current;
    prevConfirmsRef.current = confirms;
    if (confirms > prev) {
      setFlashing(true);
      const id = window.setTimeout(() => setFlashing(false), RESTORE_FLASH_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [confirms]);

  return (
    <div className="hud">
      <div className="hud-title">witness protocol</div>

      {breach && (
        <div className="hud-breach" role="status">
          <div className="hud-breach-label">breach</div>
          <div className="hud-breach-detail">
            detonation at {breach.x},{breach.y}
          </div>
        </div>
      )}

      {cleared && (
        <div className="hud-cleared" role="status">
          <div className="hud-cleared-label">field stabilized</div>
          <div className="hud-cleared-detail">witness protocol complete</div>
        </div>
      )}

      <div className={`hud-witness hud-witness-${wStatus}`}>
        <div className="hud-witness-head">
          <span className="hud-witness-label">witness charge</span>
          <span className="hud-witness-count">
            <span className="hud-witness-charge">{charge}</span>
            <span className="hud-witness-sep">/</span>
            <span className="hud-witness-max">{max}</span>
          </span>
        </div>
        <div className="hud-witness-meter" aria-hidden>
          <div
            className="hud-witness-meter-fill"
            style={{ width: max > 0 ? `${(charge / max) * 100}%` : '0%' }}
          />
        </div>
        <div className="hud-witness-note">
          {wStatus === 'exhausted'
            ? 'charge exhausted — inference only'
            : 'direct reveal cost: 1 charge'}
        </div>
        <div
          className={`hud-witness-restore ${
            flashing ? 'hud-witness-restore-on' : ''
          }`}
          role="status"
          aria-live="polite"
        >
          {flashing ? 'witness confirmed · integrity restored' : ''}
        </div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">seed</span>
          <span className="hud-value">{config.seed}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">field</span>
          <span className="hud-value">
            {config.width} × {config.height}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">hazards</span>
          <span className="hud-value">{config.mineCount}</span>
        </div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">resolved</span>
          <span className="hud-value">{tally.resolved}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">flagged</span>
          <span className="hud-value">{tally.flagged}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">unresolved</span>
          <span className="hud-value">{tally.unresolved}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">confirms</span>
          <span className="hud-value">{confirms}</span>
        </div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">cursor</span>
          <span className="hud-value">
            {state.cursor ? `${state.cursor.x},${state.cursor.y}` : '—'}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">phase</span>
          <span
            className={`hud-value ${
              state.phase.kind === 'breached'
                ? 'hud-value-breach'
                : state.phase.kind === 'cleared'
                ? 'hud-value-cleared'
                : ''
            }`}
          >
            {state.phase.kind === 'cleared' ? 'stabilized' : state.phase.kind}
          </span>
        </div>
      </div>

      <div className="hud-hint">
        <div>left-click unresolved — resolve (costs 1 charge)</div>
        <div>right-click — flag (free)</div>
        <div>click numbered tile — confirm (when flags match)</div>
        <div>successful confirm restores +1 charge</div>
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
