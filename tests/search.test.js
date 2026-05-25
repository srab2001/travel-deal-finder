const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, HEADER } = require('../lib/reportGenerator');
const { FlightSearcher, runSearch } = require('../lib/flightSearcher');

test('reportGenerator.toCsv writes header on empty input', () => {
  assert.equal(toCsv([]), HEADER.join(',') + '\n');
});

test('reportGenerator.toCsv escapes commas and quotes', () => {
  const csv = toCsv([
    {
      date: '2026-05-24',
      origin: 'SFO',
      destination: 'Tokyo, Japan',
      departDate: '2026-08-01',
      returnDate: '2026-08-15',
      price: 812,
      currency: 'USD',
      carrier: 'ANA "All Nippon"',
    },
  ]);
  assert.match(csv, /"Tokyo, Japan"/);
  assert.match(csv, /"ANA ""All Nippon"""/);
});

test('flightSearcher exports runSearch', () => {
  assert.equal(typeof runSearch, 'function');
});

function silentLogger() {
  return { errors: [], error(msg) { this.errors.push(msg); }, log() {} };
}

function validConfig() {
  return {
    destinations: ['Paris'],
    departureAirports: ['JFK'],
    stayOptions: [4, 10],
    travelMonths: [3, 6, 7, 9, 12],
    priceThresholds: { alert: 500, veryGood: 400 },
    scheduledTime: '08:00',
    timezone: 'UTC',
    lastRunTime: null,
    isScheduled: false,
  };
}

test('runSearch refuses to run with an invalid config', async () => {
  const logger = silentLogger();
  const config = validConfig();
  config.destinations = [];
  config.travelMonths = [1, 2];
  const result = await runSearch({ config, logger, apiKey: undefined, rateLimitMs: 0, sleep: async () => {} });
  assert.deepEqual(result.results, []);
  assert.ok(result.errors.length >= 2);
  const allMessages = logger.errors.join('\n');
  assert.match(allMessages, /Config is invalid/);
  assert.match(allMessages, /destinations/);
  assert.match(allMessages, /travelMonths/);
});

test('FlightSearcher.formatDate produces YYYY-MM-DD', () => {
  assert.equal(FlightSearcher.formatDate(new Date(Date.UTC(2026, 5, 7))), '2026-06-07');
  assert.equal(FlightSearcher.formatDate('2026-12-31'), '2026-12-31');
});

test('FlightSearcher.generateFlightURL returns a Google Flights URL with route info', () => {
  const url = FlightSearcher.generateFlightURL('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.match(url, /^https:\/\/www\.google\.com\/travel\/flights/);
  assert.match(url, /JFK/);
  assert.match(url, /CDG/);
  assert.match(url, /2026-06-01/);
  assert.match(url, /2026-06-10/);
});

test('FlightSearcher.getDateRangesForMonth covers all windows that fit in the month', () => {
  const ranges = FlightSearcher.getDateRangesForMonth(2026, 6, 4);
  assert.equal(ranges.length, 27);
  assert.deepEqual(ranges[0], ['2026-06-01', '2026-06-04']);
  assert.deepEqual(ranges[26], ['2026-06-27', '2026-06-30']);
});

test('FlightSearcher.getDateRangesForMonth handles 28-day Feb correctly', () => {
  const ranges = FlightSearcher.getDateRangesForMonth(2026, 2, 7);
  assert.equal(ranges.length, 22);
  assert.deepEqual(ranges[ranges.length - 1], ['2026-02-22', '2026-02-28']);
});

test('FlightSearcher.getDateRangesForMonth returns empty when stay > daysInMonth', () => {
  const ranges = FlightSearcher.getDateRangesForMonth(2026, 2, 35);
  assert.deepEqual(ranges, []);
});

test('scrapeGoogleFlights returns mock with the documented shape when no apiKey', async () => {
  const fs = new FlightSearcher({ apiKey: undefined, rateLimitMs: 0, sleep: async () => {} });
  const r = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.deepEqual(
    Object.keys(r).sort(),
    ['airline', 'departure', 'destination', 'duration', 'price', 'stops', 'url'],
  );
  assert.equal(typeof r.price, 'number');
  assert.match(r.duration, /^\d+h \d+m$/);
});

test('scrapeGoogleFlights caches within the TTL window', async () => {
  let now = 0;
  const fs = new FlightSearcher({ apiKey: undefined, rateLimitMs: 0, sleep: async () => {}, now: () => now, cacheTtlMs: 1000 });
  const a = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  now += 500;
  const b = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.strictEqual(a, b, 'should return the cached object reference');
  assert.equal(fs.cache.size, 1);
});

test('scrapeGoogleFlights skips the rate limit in mock mode (no API key)', async () => {
  const slept = [];
  const fs = new FlightSearcher({
    apiKey: undefined,
    rateLimitMs: 2000,
    sleep: async (ms) => { slept.push(ms); },
    now: () => 0,
    cacheTtlMs: 0,
  });
  await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-02', '2026-06-11');
  assert.deepEqual(slept, [], 'mock mode should not sleep');
});

test('scrapeGoogleFlights enforces rateLimitMs in live mode', async () => {
  let now = 0;
  const slept = [];
  const fakeKiwiResponse = { ok: true, status: 200, json: async () => ({ data: [{ price: 100, airlines: ['XX'], duration: { total: 3600 }, route: [{}] }] }) };
  const fs = new FlightSearcher({
    apiKey: 'fake',
    provider: 'kiwi',
    fetchImpl: async () => fakeKiwiResponse,
    rateLimitMs: 2000,
    sleep: async (ms) => { slept.push(ms); now += ms; },
    now: () => now,
    cacheTtlMs: 0,
    logger: { error: () => {}, log: () => {} },
  });
  await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-02', '2026-06-11');
  assert.ok(slept.includes(2000), `expected one 2000ms sleep in live mode, got ${JSON.stringify(slept)}`);
});

test('searchAllCombinations runs concurrent workers (mock mode, full parallelism)', async () => {
  const config = {
    departureAirports: ['JFK', 'SFO'],
    destinations: ['CDG'],
    stayOptions: [4],
    travelMonths: [6],
  };
  const slept = [];
  const fs = new FlightSearcher({
    apiKey: undefined,
    rateLimitMs: 2000,
    sleep: async (ms) => { slept.push(ms); },
    now: () => 0,
    cacheTtlMs: 0,
  });
  const { results, errors } = await fs.searchAllCombinations(config, { year: 2027 });
  assert.equal(errors.length, 0);
  // 2 airports × 27 four-day windows in June = 54
  assert.equal(results.length, 54);
  assert.deepEqual(slept, [], 'no sleeps in mock mode');
});

test('searchAllCombinations honors an explicit concurrency cap', async () => {
  // Track max in-flight calls using a shared counter.
  let inFlight = 0;
  let peakInFlight = 0;
  const config = {
    departureAirports: ['JFK', 'SFO', 'ORD'],
    destinations: ['CDG', 'NRT'],
    stayOptions: [4],
    travelMonths: [6],
  };
  const fs = new FlightSearcher({
    apiKey: undefined,
    rateLimitMs: 0,
    sleep: async () => {},
    cacheTtlMs: 0,
  });
  // Wrap scrapeGoogleFlights to count parallelism.
  const original = fs.scrapeGoogleFlights.bind(fs);
  fs.scrapeGoogleFlights = async (...args) => {
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise((r) => setImmediate(r));
    const result = await original(...args);
    inFlight--;
    return result;
  };
  await fs.searchAllCombinations(config, { year: 2027, concurrency: 2 });
  assert.ok(peakInFlight <= 2, `expected at most 2 in flight, peaked at ${peakInFlight}`);
  assert.ok(peakInFlight >= 2, `expected concurrency of 2 to actually run in parallel, peaked at ${peakInFlight}`);
});

test('searchAllCombinations iterates the cartesian product', async () => {
  const config = {
    departureAirports: ['JFK', 'SFO'],
    destinations: ['CDG'],
    stayOptions: [4, 10],
    travelMonths: [6],
  };
  const fs = new FlightSearcher({ apiKey: undefined, rateLimitMs: 0, sleep: async () => {} });
  const { results, errors } = await fs.searchAllCombinations(config, { year: 2027 });
  assert.equal(errors.length, 0);
  // 2 airports × 1 destination × (27 four-day windows + 21 ten-day windows) = 96
  assert.equal(results.length, 2 * (27 + 21));
  assert.ok(results[0].departDate);
  assert.ok(results[0].returnDate);
  assert.ok(['JFK', 'SFO'].includes(results[0].departure));
});

test('findBestDeals returns top N by price ascending', () => {
  const fs = new FlightSearcher({ apiKey: undefined, rateLimitMs: 0 });
  const results = [{ price: 500 }, { price: 200 }, { price: 800 }, { price: 100 }, { price: 300 }];
  assert.deepEqual(fs.findBestDeals(results, 3).map((r) => r.price), [100, 200, 300]);
});

test('groupByDestination buckets results by destination', () => {
  const fs = new FlightSearcher({ apiKey: undefined, rateLimitMs: 0 });
  const grouped = fs.groupByDestination([
    { destination: 'CDG', price: 500 },
    { destination: 'CDG', price: 400 },
    { destination: 'NRT', price: 900 },
  ]);
  assert.equal(grouped.CDG.length, 2);
  assert.equal(grouped.NRT.length, 1);
});

test('scrapeGoogleFlights falls back to mock when Kiwi returns an error', async () => {
  const fs = new FlightSearcher({
    apiKey: 'fake',
    provider: 'kiwi',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    rateLimitMs: 0,
    sleep: async () => {},
    retryAttempts: 1,
    logger: { error: () => {}, log: () => {} },
  });
  const r = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.equal(typeof r.price, 'number');
});

test('scrapeGoogleFlights parses Kiwi response into the shared shape', async () => {
  const fakeResponse = {
    data: [{
      price: 432.5,
      airlines: ['AF'],
      duration: { total: 28800 },
      route: [{}, {}, {}],
      deep_link: 'https://kiwi.com/booking/abc',
    }],
  };
  const fs = new FlightSearcher({
    apiKey: 'fake',
    provider: 'kiwi',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => fakeResponse }),
    rateLimitMs: 0,
    sleep: async () => {},
    logger: { error: () => {}, log: () => {} },
  });
  const r = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.equal(r.price, 433);
  assert.equal(r.airline, 'AF');
  assert.equal(r.duration, '8h 0m');
  assert.equal(r.stops, 2);
  assert.equal(r.url, 'https://kiwi.com/booking/abc');
});

test('_withRetry retries on transient failure and eventually succeeds', async () => {
  let attempts = 0;
  const fs = new FlightSearcher({
    apiKey: 'fake',
    provider: 'kiwi',
    fetchImpl: async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return { ok: true, status: 200, json: async () => ({ data: [{ price: 100, airlines: ['XX'], duration: { total: 3600 }, route: [{}] }] }) };
    },
    rateLimitMs: 0,
    sleep: async () => {},
    retryAttempts: 3,
    logger: { error: () => {}, log: () => {} },
  });
  const r = await fs.scrapeGoogleFlights('JFK', 'CDG', '2026-06-01', '2026-06-10');
  assert.equal(attempts, 3);
  assert.equal(r.price, 100);
});
