import { useEffect, useReducer, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { createGameState, reduceGame } from '../engine';
import { BoardRenderer } from '../render';
import type { BoardConfig, ProbeOrientation } from '../types';
import { HUD } from './HUD';

const INITIAL_CONFIG: BoardConfig = {
  width: 16,
  height: 16,
  mineCount: 40,
  seed: 1,
  witnessCharges: 12,
};

export function GameView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const [state, dispatch] = useReducer(
    reduceGame,
    INITIAL_CONFIG,
    createGameState,
  );

  // Probe mode is a pure UI concern — engine state is unchanged by toggling,
  // so a replay keyed off the action log is untouched. Probe mode only
  // rewires how a left-click on an unresolved tile is translated into an
  // action: in probe mode it becomes `probe`, otherwise `reveal`.
  const [probeMode, setProbeMode] = useState<ProbeOrientation | null>(null);
  const probeModeRef = useRef<ProbeOrientation | null>(null);
  useEffect(() => {
    probeModeRef.current = probeMode;
  }, [probeMode]);

  // Probe mode auto-exits on terminal phase so the HUD indicator can't
  // persist past a run ending. Reseed enters active again with probe mode
  // already null.
  useEffect(() => {
    if (state.phase.kind !== 'active' && probeMode !== null) {
      setProbeMode(null);
    }
  }, [state.phase.kind, probeMode]);

  // Keyboard: H / V toggle the corresponding orientation (pressing the same
  // key twice exits). Escape always exits. Ignored while focus is inside a
  // focusable interactive element — today only the reseed button, but
  // future text fields will get the same behavior for free.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setProbeMode((m) => (m === 'horizontal' ? null : 'horizontal'));
      } else if (e.key === 'v' || e.key === 'V') {
        setProbeMode((m) => (m === 'vertical' ? null : 'vertical'));
      } else if (e.key === 'Escape') {
        setProbeMode(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Pixi v8 init is async. StrictMode double-invokes this effect, so the
    // first cleanup can fire *before* the first init resolves. We must not
    // call Application.destroy() on an uninitialized app (it touches fields
    // populated only by init()). Track whether init completed and only
    // destroy then; if cancellation lands mid-init, tear down inside the
    // async path once init resolves.
    let cancelled = false;
    let app: Application | null = null;
    let renderer: BoardRenderer | null = null;

    (async () => {
      const instance = new Application();
      try {
        await instance.init({
          resizeTo: host,
          background: '#060b10',
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('pixi init failed', err);
        return;
      }

      if (cancelled) {
        instance.destroy(true, { children: true });
        return;
      }

      host.appendChild(instance.canvas);
      const r = new BoardRenderer(instance, {
        onHover: (x, y) => dispatch({ type: 'hover', x, y }),
        onHoverClear: () => dispatch({ type: 'hoverClear' }),
        onReveal: (x, y) => {
          // Left-click on an unresolved tile. In probe mode this becomes a
          // structural scan; the engine validates target-must-be-unresolved
          // and segment-ambiguity rules, so the UI does not duplicate them.
          const mode = probeModeRef.current;
          if (mode) {
            dispatch({ type: 'probe', x, y, orientation: mode });
          } else {
            dispatch({ type: 'reveal', x, y });
          }
        },
        onFlag: (x, y) => dispatch({ type: 'flag', x, y }),
        // Middle-click keeps its ritual-confirm semantics even in probe
        // mode: the mode only rewires left-click, because confirming a
        // resolved numbered tile is a different instrument than probing.
        onConfirm: (x, y) => dispatch({ type: 'confirm', x, y }),
      });

      app = instance;
      renderer = r;
      rendererRef.current = r;

      r.render(state, { probeMode: probeModeRef.current });
    })();

    return () => {
      cancelled = true;
      renderer?.destroy();
      renderer = null;
      app?.destroy(true, { children: true });
      app = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.render(state, { probeMode });
  }, [state, probeMode]);

  return (
    <div className="game-view">
      <div
        ref={hostRef}
        className="board-host"
        // Suppress the browser context menu so right-click can flag instead.
        onContextMenu={(e) => e.preventDefault()}
      />
      <HUD
        state={state}
        probeMode={probeMode}
        onReseed={(seed) => dispatch({ type: 'regen', seed })}
      />
    </div>
  );
}
