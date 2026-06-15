const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Explore what's available in the game store
  const pageExplore = await browser.newPage();
  await pageExplore.goto('http://localhost:5173/?city=london&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);

  const storeInfo = await pageExplore.evaluate(() => {
    const store = window.__gameStore;
    if (!store) return { error: 'no store' };
    const storeKeys = Object.keys(store);
    const state = store._state || store.state;
    let stateKeys = [];
    if (state) {
      stateKeys = Object.keys(state);
    }
    return { storeKeys, stateKeys };
  });
  console.log('Store structure:', JSON.stringify(storeInfo, null, 2));

  // Get full state at ff=60 London
  const fullState60 = await pageExplore.evaluate(() => {
    const store = window.__gameStore;
    if (!store) return null;
    const state = store._state || store.state;
    if (!state) return null;
    return {
      score: state.score,
      day: state.day,
      pressureFactor: state.pressureFactor,
      adaptivePressure: state.adaptivePressure,
      totalPassengersDelivered: state.totalPassengersDelivered,
      nextStationSpawn: state.nextStationSpawn,
      nextPassengerSpawn: state.nextPassengerSpawn,
      simTime: state.simTime || state.clock || state.elapsed,
      stations: (state.stations || []).map(s => ({
        id: s.id,
        shape: s.shape,
        gauge: s.gauge || 0,
        passengers: (s.passengers || []).length,
        capacity: s.capacity
      }))
    };
  });
  console.log('London ff=60 full state:', JSON.stringify(fullState60, null, 2));
  await pageExplore.close();

  // Tokyo at ff=60 for sm-4 comparison
  const pageTokyo = await browser.newPage();
  await pageTokyo.goto('http://localhost:5173/?city=tokyo&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const tokyoState60 = await pageTokyo.evaluate(() => {
    const store = window.__gameStore;
    if (!store) return null;
    const state = store._state || store.state;
    if (!state) return null;
    return {
      pressureFactor: state.pressureFactor,
      day: state.day,
      stations: (state.stations || []).map(s => ({
        id: s.id,
        shape: s.shape,
        gauge: s.gauge || 0,
        passengers: (s.passengers || []).length
      }))
    };
  });
  console.log('Tokyo ff=60 full state:', JSON.stringify(tokyoState60, null, 2));

  // Tokyo at ff=200 endless for sm-3 (check pressureFactor)
  await pageTokyo.goto('http://localhost:5173/?city=tokyo&seed=1&ff=200&demo&endless', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const tokyoState200 = await pageTokyo.evaluate(() => {
    const store = window.__gameStore;
    if (!store) return null;
    const state = store._state || store.state;
    if (!state) return { keys: Object.keys(store) };
    return {
      pressureFactor: state.pressureFactor,
      day: state.day,
      overcrowded: (state.stations || []).filter(s => s.overcrowded).length,
      stations: (state.stations || []).map(s => ({
        id: s.id,
        gauge: s.gauge || 0,
        overcrowded: s.overcrowded,
        passengers: (s.passengers || []).length
      }))
    };
  });
  console.log('Tokyo ff=200 endless state:', JSON.stringify(tokyoState200, null, 2));
  await pageTokyo.close();

  await browser.close();
})();
