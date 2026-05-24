const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  saveResultsToCSV,
  saveResultsToJSON,
  loadHistoricalResults,
  updateBestPrices,
  calculatePriceTrends,
  CSV_HEADER,
  parseCsv,
} = require('../lib/persistence');

async function withTmpDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdf-persist-'));
  try {
    await fn(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function sampleResult(overrides = {}) {
  return {
    departure: 'JFK',
    destination: 'CDG',
    price: 432,
    airline: 'AF',
    duration: '8h 0m',
    stops: 1,
    url: 'https://www.google.com/travel/flights?q=x',
    departDate: '2026-06-01',
    returnDate: '2026-06-10',
    stayDays: 9,
    ...overrides,
  };
}

test('CSV_HEADER matches prompt 10 column list', () => {
  assert.deepEqual(CSV_HEADER, [
    'date_checked', 'departure', 'destination', 'outbound_date', 'return_date',
    'stay_days', 'price_usd', 'price_per_day', 'airline', 'stops', 'duration', 'url',
  ]);
});

test('saveResultsToCSV writes default filename results_YYYY-MM-DD.csv with header', async () => {
  await withTmpDir(async (dir) => {
    const file = await saveResultsToCSV([sampleResult()], undefined, { outDir: dir, date: new Date('2026-06-15T00:00:00Z') });
    assert.equal(path.basename(file), 'results_2026-06-15.csv');
    const text = await fs.readFile(file, 'utf8');
    assert.ok(text.startsWith(CSV_HEADER.join(',') + '\n'));
    assert.match(text, /2026-06-15,JFK,CDG/);
    assert.match(text, /432,48/); // price_per_day = 432 / 9 = 48
  });
});

test('saveResultsToCSV uses provided filename when given', async () => {
  await withTmpDir(async (dir) => {
    const file = await saveResultsToCSV([sampleResult()], 'custom.csv', { outDir: dir });
    assert.equal(path.basename(file), 'custom.csv');
  });
});

test('saveResultsToJSON includes metadata + count + savedAt', async () => {
  await withTmpDir(async (dir) => {
    const date = new Date('2026-06-15T12:30:00Z');
    const file = await saveResultsToJSON([sampleResult(), sampleResult({ price: 600 })], undefined, { outDir: dir, date });
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(path.basename(file), 'results_2026-06-15.json');
    assert.equal(parsed.count, 2);
    assert.equal(parsed.date, '2026-06-15');
    assert.equal(parsed.savedAt, '2026-06-15T12:30:00.000Z');
    assert.equal(parsed.results.length, 2);
  });
});

test('loadHistoricalResults returns [] when dir is empty or missing', async () => {
  await withTmpDir(async (dir) => {
    assert.deepEqual(await loadHistoricalResults(30, { dir, now: new Date('2026-06-30T00:00:00Z') }), []);
  });
  assert.deepEqual(await loadHistoricalResults(30, { dir: '/nonexistent-path-tdf-test', now: new Date() }), []);
});

test('loadHistoricalResults filters by age and parses CSVs', async () => {
  await withTmpDir(async (dir) => {
    const now = new Date('2026-07-01T00:00:00Z');
    await saveResultsToCSV([sampleResult({ price: 400 })], undefined, { outDir: dir, date: new Date('2026-06-25T00:00:00Z') });
    await saveResultsToCSV([sampleResult({ price: 800 })], undefined, { outDir: dir, date: new Date('2026-04-01T00:00:00Z') });
    const recent = await loadHistoricalResults(30, { dir, now });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].price_usd, 400);
    assert.equal(recent[0].destination, 'CDG');
    const all = await loadHistoricalResults(365, { dir, now });
    assert.equal(all.length, 2);
  });
});

test('loadHistoricalResults sorts oldest → newest', async () => {
  await withTmpDir(async (dir) => {
    await saveResultsToCSV([sampleResult({ price: 700 })], undefined, { outDir: dir, date: new Date('2026-06-10T00:00:00Z') });
    await saveResultsToCSV([sampleResult({ price: 300 })], undefined, { outDir: dir, date: new Date('2026-06-05T00:00:00Z') });
    const rows = await loadHistoricalResults(365, { dir, now: new Date('2026-06-30T00:00:00Z') });
    assert.equal(rows[0].date_checked, '2026-06-05');
    assert.equal(rows[1].date_checked, '2026-06-10');
  });
});

test('updateBestPrices writes new entries and only updates on lower price', async () => {
  await withTmpDir(async (dir) => {
    const d1 = new Date('2026-06-01T00:00:00Z');
    const d2 = new Date('2026-06-02T00:00:00Z');
    await updateBestPrices([sampleResult({ price: 500 })], { dir, date: d1 });
    let raw = JSON.parse(await fs.readFile(path.join(dir, 'best_prices.json'), 'utf8'));
    assert.equal(raw['JFK-CDG'].price, 500);
    assert.equal(raw['JFK-CDG'].date, '2026-06-01');

    // Higher price should NOT overwrite
    await updateBestPrices([sampleResult({ price: 600 })], { dir, date: d2 });
    raw = JSON.parse(await fs.readFile(path.join(dir, 'best_prices.json'), 'utf8'));
    assert.equal(raw['JFK-CDG'].price, 500);
    assert.equal(raw['JFK-CDG'].date, '2026-06-01');

    // Lower price SHOULD overwrite
    await updateBestPrices([sampleResult({ price: 400, airline: 'DL' })], { dir, date: d2 });
    raw = JSON.parse(await fs.readFile(path.join(dir, 'best_prices.json'), 'utf8'));
    assert.equal(raw['JFK-CDG'].price, 400);
    assert.equal(raw['JFK-CDG'].airline, 'DL');
    assert.equal(raw['JFK-CDG'].date, '2026-06-02');
  });
});

test('updateBestPrices tracks multiple route keys independently', async () => {
  await withTmpDir(async (dir) => {
    await updateBestPrices([
      sampleResult({ price: 500 }),
      sampleResult({ destination: 'NRT', price: 900 }),
    ], { dir });
    const raw = JSON.parse(await fs.readFile(path.join(dir, 'best_prices.json'), 'utf8'));
    assert.equal(raw['JFK-CDG'].price, 500);
    assert.equal(raw['JFK-NRT'].price, 900);
  });
});

test('calculatePriceTrends reports unknown when no history', async () => {
  await withTmpDir(async (dir) => {
    const t = await calculatePriceTrends('CDG', 30, { dir, now: new Date() });
    assert.equal(t.samples, 0);
    assert.equal(t.trend, 'unknown');
  });
});

test('calculatePriceTrends computes min/max/avg and rising trend', async () => {
  await withTmpDir(async (dir) => {
    const now = new Date('2026-06-30T00:00:00Z');
    await saveResultsToCSV([sampleResult({ price: 300 })], undefined, { outDir: dir, date: new Date('2026-06-01T00:00:00Z') });
    await saveResultsToCSV([sampleResult({ price: 320 })], undefined, { outDir: dir, date: new Date('2026-06-08T00:00:00Z') });
    await saveResultsToCSV([sampleResult({ price: 500 })], undefined, { outDir: dir, date: new Date('2026-06-22T00:00:00Z') });
    await saveResultsToCSV([sampleResult({ price: 550 })], undefined, { outDir: dir, date: new Date('2026-06-29T00:00:00Z') });
    const t = await calculatePriceTrends('CDG', 30, { dir, now });
    assert.equal(t.samples, 4);
    assert.equal(t.min, 300);
    assert.equal(t.max, 550);
    assert.equal(t.avg, 417.5);
    assert.equal(t.trend, 'up');
  });
});

test('calculatePriceTrends detects falling trend', async () => {
  await withTmpDir(async (dir) => {
    const now = new Date('2026-06-30T00:00:00Z');
    for (const [date, price] of [
      ['2026-06-01', 800], ['2026-06-08', 750],
      ['2026-06-22', 500], ['2026-06-29', 450],
    ]) {
      await saveResultsToCSV([sampleResult({ price })], undefined, { outDir: dir, date: new Date(date + 'T00:00:00Z') });
    }
    const t = await calculatePriceTrends('CDG', 30, { dir, now });
    assert.equal(t.trend, 'down');
  });
});

test('parseCsv handles quoted fields with commas and escaped quotes', () => {
  const csv = 'a,b,c\n"Tokyo, Japan","ANA ""All Nippon""",42\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, 'Tokyo, Japan');
  assert.equal(rows[0].b, 'ANA "All Nippon"');
  assert.equal(rows[0].c, '42');
});
