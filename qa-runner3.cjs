const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Compare London vs Tokyo at ff=90 for sm-4 difficulty ordering
  const pageLon90 = await browser.newPage();
  await pageLon90.goto('http://localhost:5173/?city=london&seed=1&ff=90&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const london90 = await pageLon90.evaluate(() => {
    const state = window.__gameStore?.state;
    if (!state) return null;
    return {
      day: state.day,
      totalGauge: (state.stations || []).reduce((s, st) => s + (st.gauge || 0), 0),
      maxGauge: Math.max(...(state.stations || []).map(st => st.gauge || 0)),
      stations: (state.stations || []).map(s => ({ id: s.id, gauge: s.gauge || 0, pax: (s.passengers||[]).length }))
    };
  });
  console.log('London ff=90:', JSON.stringify(london90, null, 2));
  await pageLon90.screenshot({ path: '/tmp/qa-sm4-london90.png' });
  await pageLon90.close();

  // Tokyo ff=90
  const pageTok90 = await browser.newPage();
  await pageTok90.goto('http://localhost:5173/?city=tokyo&seed=1&ff=90&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const tokyo90 = await pageTok90.evaluate(() => {
    const state = window.__gameStore?.state;
    if (!state) return null;
    return {
      day: state.day,
      totalGauge: (state.stations || []).reduce((s, st) => s + (st.gauge || 0), 0),
      maxGauge: Math.max(...(state.stations || []).map(st => st.gauge || 0)),
      stations: (state.stations || []).map(s => ({ id: s.id, gauge: s.gauge || 0, pax: (s.passengers||[]).length }))
    };
  });
  console.log('Tokyo ff=90:', JSON.stringify(tokyo90, null, 2));
  await pageTok90.screenshot({ path: '/tmp/qa-sm4-tokyo90.png' });
  await pageTok90.close();

  // Mumbai ff=90 for ordering check
  const pageMum90 = await browser.newPage();
  await pageMum90.goto('http://localhost:5173/?city=mumbai&seed=1&ff=90&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const mumbai90 = await pageMum90.evaluate(() => {
    const state = window.__gameStore?.state;
    if (!state) return null;
    return {
      day: state.day,
      totalGauge: (state.stations || []).reduce((s, st) => s + (st.gauge || 0), 0),
      maxGauge: Math.max(...(state.stations || []).map(st => st.gauge || 0)),
      stations: (state.stations || []).map(s => ({ id: s.id, gauge: s.gauge || 0, pax: (s.passengers||[]).length }))
    };
  });
  console.log('Mumbai ff=90:', JSON.stringify(mumbai90, null, 2));
  await pageMum90.close();

  // st-1 failure investigation: at ff=60 demo, do ANY passengers ever accumulate?
  // Check the score and spawnedPassengers count to understand if passengers are spawning
  const pageSt1 = await browser.newPage();
  await pageSt1.goto('http://localhost:5173/?city=london&seed=1&ff=60&demo', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const spawnInfo = await pageSt1.evaluate(() => {
    const state = window.__gameStore?.state;
    if (!state) return null;
    return {
      score: state.score,
      spawnedPassengers: state.spawnedPassengers,
      nextStationIn: state.nextStationIn,
      stationsCount: (state.stations || []).length,
      trainsCount: (state.trains || []).length,
      linesCount: (state.lines || []).filter(l => l.stations && l.stations.length > 0).length
    };
  });
  console.log('st-1 spawn info at ff=60:', JSON.stringify(spawnInfo, null, 2));
  await pageSt1.close();

  await browser.close();
})();
