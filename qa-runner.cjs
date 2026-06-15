const { chromium } = require('playwright');
const path = require('path');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // Helper to get game state
  async function getGameState(page) {
    return page.evaluate(() => window.__gameStore?.getSnapshot());
  }

  // Helper to count stations with waiting passengers
  async function countStationsWithPassengers(page) {
    return page.evaluate(() => {
      const snap = window.__gameStore?.getSnapshot();
      if (!snap) return -1;
      const state = window.__gameStore._state;
      if (!state) return -1;
      // Try to access raw state
      return null;
    });
  }

  // ---- SMOKE TEST sm-1 ----
  // Intent: On London seed=1 at 60s, noticeably more waiting passengers — queues non-empty on at least 2 stations
  {
    const page = await browser.newPage();
    try {
      await page.goto('http://localhost:5173/?city=london&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      // Read game state to count stations with waiting passengers
      const stationsWithPassengers = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) {
          // Try getSnapshot
          const snap = store.getSnapshot();
          return { snap: JSON.stringify(snap).slice(0, 200) };
        }
        const stations = state.stations || [];
        const counts = stations.map(s => ({
          id: s.id,
          waiting: s.passengers ? s.passengers.length : 0
        }));
        return { stations: counts };
      });

      console.log('sm-1 raw:', JSON.stringify(stationsWithPassengers));

      await page.screenshot({ path: '/tmp/qa-sm-1.png' });
      results.push({ id: 'sm-1', raw: stationsWithPassengers });
    } catch(e) {
      results.push({ id: 'sm-1', error: e.message });
    }
    await page.close();
  }

  // ---- SMOKE TEST sm-2 ----
  // Intent: Well-connected network on London (4 starter stations) keeps pace first week — trains not perpetually overwhelmed
  {
    const page = await browser.newPage();
    try {
      // Fast forward to end of week 1 (7 days). 1 day ~ a few hundred sim-seconds depending on game speed
      // Let's check at ff=120 (2 minutes of sim time) - early week 1
      await page.goto('http://localhost:5173/?city=london&seed=1&ff=120&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      const stateInfo = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) return { snap: JSON.stringify(store.getSnapshot()).slice(0, 300) };
        const stations = state.stations || [];
        const overcrowded = stations.filter(s => s.overcrowded);
        const maxLoad = stations.map(s => ({ id: s.id, gauge: s.gauge || 0, passengers: (s.passengers || []).length }));
        return { overcrowded: overcrowded.length, maxLoad, day: state.day };
      });

      console.log('sm-2 raw:', JSON.stringify(stateInfo));
      await page.screenshot({ path: '/tmp/qa-sm-2.png' });
      results.push({ id: 'sm-2', raw: stateInfo });
    } catch(e) {
      results.push({ id: 'sm-2', error: e.message });
    }
    await page.close();
  }

  // ---- SMOKE TEST sm-3 ----
  // Intent: Tokyo remains completable past week 2 with sensible lines — pressureFactor mercy path engages
  {
    const page = await browser.newPage();
    try {
      // Check at ff=200 (deeper into game) with demo connections
      await page.goto('http://localhost:5173/?city=tokyo&seed=1&ff=200&demo&endless', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      const stateInfo = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) return { snap: JSON.stringify(store.getSnapshot()).slice(0, 300) };
        return {
          day: state.day,
          pressureFactor: state.pressureFactor,
          overcrowded: (state.stations || []).filter(s => s.overcrowded).length,
          totalStations: (state.stations || []).length,
          gauges: (state.stations || []).map(s => s.gauge || 0)
        };
      });

      console.log('sm-3 raw:', JSON.stringify(stateInfo));
      await page.screenshot({ path: '/tmp/qa-sm-3.png' });
      results.push({ id: 'sm-3', raw: stateInfo });
    } catch(e) {
      results.push({ id: 'sm-3', error: e.message });
    }
    await page.close();
  }

  // ---- SMOKE TEST sm-4 ----
  // Intent: Difficulty ordering London < Mumbai < Tokyo preserved — Tokyo queues grow faster than London same seed/topology
  {
    let londonPassengers = 0, tokyoPassengers = 0;

    // London at ff=60
    const pageLon = await browser.newPage();
    try {
      await pageLon.goto('http://localhost:5173/?city=london&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);
      const londonState = await pageLon.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return null;
        const state = store._state || store.state;
        if (!state) return null;
        return { totalPassengers: (state.stations || []).reduce((sum, s) => sum + (s.passengers || []).length, 0) };
      });
      londonPassengers = londonState ? londonState.totalPassengers : -1;
      console.log('sm-4 london raw:', JSON.stringify(londonState));
      await pageLon.screenshot({ path: '/tmp/qa-sm-4-london.png' });
    } catch(e) {
      console.log('sm-4 london error:', e.message);
    }
    await pageLon.close();

    // Tokyo at ff=60
    const pageTok = await browser.newPage();
    try {
      await pageTok.goto('http://localhost:5173/?city=tokyo&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);
      const tokyoState = await pageTok.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return null;
        const state = store._state || store.state;
        if (!state) return null;
        return { totalPassengers: (state.stations || []).reduce((sum, s) => sum + (s.passengers || []).length, 0) };
      });
      tokyoPassengers = tokyoState ? tokyoState.totalPassengers : -1;
      console.log('sm-4 tokyo raw:', JSON.stringify(tokyoState));
      await pageTok.screenshot({ path: '/tmp/qa-sm-4-tokyo.png' });
    } catch(e) {
      console.log('sm-4 tokyo error:', e.message);
    }
    await pageTok.close();

    results.push({ id: 'sm-4', londonPassengers, tokyoPassengers });
  }

  // ---- STRUCTURED TEST st-1 ----
  // URL: london seed=1 ff=60 demo
  // Assert: at least 2 stations have 1+ waiting passengers
  {
    const page = await browser.newPage();
    try {
      await page.goto('http://localhost:5173/?city=london&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      const stateInfo = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) {
          const snap = store.getSnapshot();
          return { snapKeys: Object.keys(snap || {}), snap: JSON.stringify(snap).slice(0, 500) };
        }
        const stations = state.stations || [];
        return {
          stationCount: stations.length,
          stationsWithPassengers: stations.filter(s => (s.passengers || []).length > 0).length,
          allPassengerCounts: stations.map(s => ({ id: s.id, shape: s.shape, pax: (s.passengers || []).length }))
        };
      });

      console.log('st-1 raw:', JSON.stringify(stateInfo));
      await page.screenshot({ path: '/tmp/qa-st-1.png' });
      results.push({ id: 'st-1', raw: stateInfo });
    } catch(e) {
      results.push({ id: 'st-1', error: e.message });
    }
    await page.close();
  }

  // ---- STRUCTURED TEST st-2 ----
  // URL: london seed=1 ff=14 demo
  // Assert: score HUD shows 0 and no station has gauge > 0%
  {
    const page = await browser.newPage();
    try {
      await page.goto('http://localhost:5173/?city=london&seed=1&ff=14&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      // Check score in HUD
      const scoreText = await page.evaluate(() => {
        const allText = document.body.innerText;
        return allText;
      });

      const stateInfo = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) {
          const snap = store.getSnapshot();
          return { snap: JSON.stringify(snap).slice(0, 500) };
        }
        const stations = state.stations || [];
        return {
          score: state.score,
          day: state.day,
          stationsWithGauge: stations.filter(s => (s.gauge || 0) > 0).length,
          gaugeDetails: stations.map(s => ({ id: s.id, gauge: s.gauge || 0, passengers: (s.passengers || []).length }))
        };
      });

      console.log('st-2 raw:', JSON.stringify(stateInfo));
      console.log('st-2 HUD text:', scoreText.slice(0, 300));
      await page.screenshot({ path: '/tmp/qa-st-2.png' });
      results.push({ id: 'st-2', raw: stateInfo, hudText: scoreText.slice(0, 300) });
    } catch(e) {
      results.push({ id: 'st-2', error: e.message });
    }
    await page.close();
  }

  // ---- STRUCTURED TEST st-3 ----
  // URL: tokyo seed=1 ff=90 demo
  // Assert: at least one station shows non-zero gauge (red fill) by second 90
  {
    const page = await browser.newPage();
    try {
      await page.goto('http://localhost:5173/?city=tokyo&seed=1&ff=90&demo', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(2000);

      const stateInfo = await page.evaluate(() => {
        const store = window.__gameStore;
        if (!store) return { error: 'no store' };
        const state = store._state || store.state;
        if (!state) {
          const snap = store.getSnapshot();
          return { snap: JSON.stringify(snap).slice(0, 500) };
        }
        const stations = state.stations || [];
        return {
          stationsWithGauge: stations.filter(s => (s.gauge || 0) > 0).length,
          gaugeDetails: stations.map(s => ({ id: s.id, shape: s.shape, gauge: s.gauge || 0, passengers: (s.passengers || []).length }))
        };
      });

      console.log('st-3 raw:', JSON.stringify(stateInfo));
      await page.screenshot({ path: '/tmp/qa-st-3.png' });
      results.push({ id: 'st-3', raw: stateInfo });
    } catch(e) {
      results.push({ id: 'st-3', error: e.message });
    }
    await page.close();
  }

  await browser.close();

  // Print all results
  console.log('\n=== ALL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
})();
