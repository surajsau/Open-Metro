const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Check at multiple timepoints to verify difficulty ordering
  for (const ff of [120, 180, 300]) {
    for (const city of ['london', 'mumbai', 'tokyo']) {
      const page = await browser.newPage();
      await page.goto(`http://localhost:5173/?city=${city}&seed=1&ff=${ff}&demo`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);
      const state = await page.evaluate(() => {
        const s = window.__gameStore?.state;
        if (!s) return null;
        return {
          totalGauge: (s.stations || []).reduce((acc, st) => acc + (st.gauge || 0), 0),
          maxGauge: Math.max(...(s.stations || []).map(st => st.gauge || 0)),
          stationCount: (s.stations || []).length,
          score: s.score,
          gameOver: s.gameOver
        };
      });
      console.log(`${city} ff=${ff}:`, JSON.stringify(state));
      await page.close();
    }
  }

  // Also check at ff=60 to understand st-1 failure more:
  // How many passengers do stations have INSTANTANEOUSLY right after spawn before train arrives?
  // Check without demo (no trains to pick them up)
  const pageNoDemo = await browser.newPage();
  await pageNoDemo.goto('http://localhost:5173/?city=london&seed=1&ff=60', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const noDemo60 = await pageNoDemo.evaluate(() => {
    const s = window.__gameStore?.state;
    if (!s) return null;
    return {
      score: s.score,
      spawnedPassengers: s.spawnedPassengers,
      stationCount: (s.stations || []).length,
      stationsWithPax: (s.stations || []).filter(st => (st.passengers||[]).length > 0).length,
      stations: (s.stations || []).map(st => ({ id: st.id, shape: st.shape, gauge: st.gauge||0, pax: (st.passengers||[]).length }))
    };
  });
  console.log('London ff=60 NO DEMO (no trains):', JSON.stringify(noDemo60, null, 2));
  await pageNoDemo.close();

  await browser.close();
})();
