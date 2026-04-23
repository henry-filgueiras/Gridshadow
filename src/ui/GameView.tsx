import { useEffect, useReducer, useRef } from 'react';
import { Application } from 'pixi.js';
import { createGameState, reduceGame } from '../engine';
import { BoardRenderer } from '../render';
import type { BoardConfig } from '../types';
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
        onReveal: (x, y) => dispatch({ type: 'reveal', x, y }),
        onFlag: (x, y) => dispatch({ type: 'flag', x, y }),
      });

      app = instance;
      renderer = r;
      rendererRef.current = r;

      r.render(state);
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
    rendererRef.current?.render(state);
  }, [state]);

  return (
    <div className="game-view">
      <div
        ref={hostRef}
        className="board-host"
        // Suppress the browser context menu so right-click can flag instead.
        onContextMenu={(e) => e.preventDefault()}
      />
      <HUD state={state} onReseed={(seed) => dispatch({ type: 'regen', seed })} />
    </div>
  );
}
