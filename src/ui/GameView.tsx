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

    let disposed = false;
    const app = new Application();

    app
      .init({
        resizeTo: host,
        background: '#060b10',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        const renderer = new BoardRenderer(app, {
          onHover: (x, y) => dispatch({ type: 'hover', x, y }),
          onHoverClear: () => dispatch({ type: 'hoverClear' }),
          onSelect: (x, y) => dispatch({ type: 'select', x, y }),
        });
        rendererRef.current = renderer;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('pixi init failed', err);
      });

    return () => {
      disposed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.render(state);
  }, [state]);

  return (
    <div className="game-view">
      <div ref={hostRef} className="board-host" />
      <HUD state={state} onReseed={(seed) => dispatch({ type: 'regen', seed })} />
    </div>
  );
}
