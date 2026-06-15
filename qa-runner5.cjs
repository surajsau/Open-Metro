const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Deeply inspect one station object at ff=60 no-demo (passengers must exist somewhere)
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/?city=london&seed=1&ff=60', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);

  const deepState = await page.evaluate(() => {
    const s = window.__gameStore?.state;
    if (!s) return { error: 'no state' };

    // Get all keys of first station
    const st = (s.stations || [])[0];
    const stKeys = st ? Object.keys(st) : [];

    // Show all stations with ALL fields
    const stations = (s.stations || []).map(station => {
      const obj = {};
      for (const k of Object.keys(station)) {
        const v = station[k];
        if (typeof v === 'function') continue;
        if (Array.isArray(v)) {
          obj[k] = { isArray: true, length: v.length, first: v[0] };
        } else if (typeof v === 'object' && v !== null) {
          obj[k] = { isObject: true, keys: Object.keys(v) };
        } else {
          obj[k] = v;
        }
      }
      return obj;
    });

    return {
      stationKeys: stKeys,
      stations
    };
  });

  console.log('Deep station structure:', JSON.stringify(deepState, null, 2));

  // Also check if passengers are in a separate collection
  const passengerInfo = await page.evaluate(() => {
    const s = window.__gameStore?.state;
    if (!s) return null;

    // Check for top-level passengers array or similar
    const stateKeys = Object.keys(s);
    const result = { stateKeys };

    // Get trains and their passengers
    result.trains = (s.trains || []).map(t => ({
      id: t.id,
      passengersCount: t.passengers ? (Array.isArray(t.passengers) ? t.passengers.length : Object.keys(t.passengers).length) : 0
    }));

    return result;
  });

  console.log('Passenger info:', JSON.stringify(passengerInfo, null, 2));

  await page.close();
  await browser.close();
})();
