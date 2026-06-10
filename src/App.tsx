import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Interactions } from './input/interactions';
import { computeViewport, renderFrame, type Viewport } from './render/renderer';
import { store } from './store';
import { Hud } from './ui/Hud';
import { InventoryBar } from './ui/InventoryBar';
import { LineChips } from './ui/LineChips';
import { GameOverOverlay, RewardModal, StartScreen, Toasts } from './ui/Modals';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay">
        <div className="panel">
          <h2>Something derailed</h2>
          <p>An unexpected error stopped the game.</p>
          <button className="primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

function Game() {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<Viewport>(computeViewport(1, 1));
  const interactionsRef = useRef<Interactions | null>(null);
  if (!interactionsRef.current) {
    interactionsRef.current = new Interactions(store, () => vpRef.current);
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      vpRef.current = computeViewport(w, h);
    };
    resize();
    window.addEventListener('resize', resize);
    const detach = interactionsRef.current!.attach(canvas);

    let raf = 0;
    const loop = (ts: number) => {
      store.tick(ts);
      renderFrame(ctx, store.state, interactionsRef.current!.getDrag(), vpRef.current, window.devicePixelRatio || 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      detach();
    };
  }, []);

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />
      {snap.started && <Hud snap={snap} />}
      {snap.started && (
        <InventoryBar snap={snap} onItemDrag={(item, e) => interactionsRef.current!.beginInventoryDrag(item, e)} />
      )}
      {snap.started && <LineChips snap={snap} />}
      {!snap.started && <StartScreen />}
      <RewardModal snap={snap} />
      {snap.gameOver && <GameOverOverlay snap={snap} />}
      <Toasts snap={snap} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Game />
    </ErrorBoundary>
  );
}
