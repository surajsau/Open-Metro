import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { stepGame } from './game/sim';
import { store } from './store';
import './styles.css';

// Dev affordances for headless/manual testing.
const params = new URLSearchParams(location.search);
const city = params.get('city');
const mode = params.has('endless') ? 'endless' : 'normal';
// ?endless implies autostart (same as ?city= today).
if (city || mode === 'endless') store.startCity(city ?? store.state.city.id, mode);
const seed = Number(params.get('seed') ?? 0);
if (seed > 0) store.restart(seed); // restart marks the game started, keeps city
else if (params.has('autostart') || params.has('demo')) store.start();
if (params.has('demo')) {
  // Connect the four starter stations so a train is visible immediately.
  store.commitCreate([1, 3, 2], false);
  store.commitCreate([2, 4], false);
}
const ff = Number(params.get('ff') ?? 0);
if (ff > 0) {
  // Synchronously fast-forward the sim (headless rAF barely advances).
  const dt = 1 / 30;
  for (let t = 0; t < ff; t += dt) stepGame(store.state, dt);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
