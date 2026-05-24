const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { ConfigManager, DEFAULT_CONFIG } = require('../lib/configManager');

function validConfig(overrides = {}) {
  return {
    destinations: ['Paris', 'Tokyo'],
    departureAirports: ['JFK', 'LAX'],
    stayOptions: [4, 10],
    travelMonths: [3, 6, 7, 9, 12],
    priceThresholds: { alert: 500, veryGood: 400 },
    scheduledTime: '08:00',
    timezone: 'America/New_York',
    lastRunTime: null,
    isScheduled: false,
    ...overrides,
  };
}

async function inTempCwd(fn) {
  const original = process.cwd();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdf-'));
  process.chdir(tmp);
  try {
    await fn(tmp);
  } finally {
    process.chdir(original);
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

test('DEFAULT_CONFIG matches the prompt 7 schema', () => {
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), [
    'departureAirports',
    'destinations',
    'isScheduled',
    'lastRunTime',
    'priceThresholds',
    'scheduledTime',
    'stayOptions',
    'timezone',
    'travelMonths',
  ]);
  assert.equal(DEFAULT_CONFIG.scheduledTime, '08:00');
  assert.equal(DEFAULT_CONFIG.timezone, 'America/New_York');
  assert.equal(DEFAULT_CONFIG.isScheduled, false);
  assert.equal(DEFAULT_CONFIG.lastRunTime, null);
});

test('ConfigManager.defaults returns a deep copy, not a shared reference', () => {
  const a = ConfigManager.defaults();
  const b = ConfigManager.defaults();
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.priceThresholds, b.priceThresholds);
  a.destinations.push('mutated');
  assert.equal(b.destinations.length, 0);
});

test('ConfigManager.load returns defaults when no config.json exists', async () => {
  await inTempCwd(async () => {
    const loaded = await ConfigManager.load();
    assert.deepEqual(loaded, ConfigManager.defaults());
  });
});

test('ConfigManager.save + load round-trips and merges defaults', async () => {
  await inTempCwd(async () => {
    await ConfigManager.save({ destinations: ['Tokyo'], departureAirports: ['SFO'] });
    const loaded = await ConfigManager.load();
    assert.deepEqual(loaded.destinations, ['Tokyo']);
    assert.deepEqual(loaded.departureAirports, ['SFO']);
    assert.equal(loaded.scheduledTime, '08:00');
  });
});

test('ConfigManager.reset writes defaults to disk', async () => {
  await inTempCwd(async () => {
    await ConfigManager.save({ destinations: ['Paris'] });
    const reset = await ConfigManager.reset();
    assert.deepEqual(reset.destinations, []);
    const loaded = await ConfigManager.load();
    assert.deepEqual(loaded.destinations, []);
  });
});

test('ConfigManager.validate accepts a fully-populated config', () => {
  const result = ConfigManager.validate(validConfig());
  assert.equal(result.ok, true, `errors: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, []);
});

test('ConfigManager.validate flags missing destinations', () => {
  const result = ConfigManager.validate(validConfig({ destinations: [] }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('|'), /destinations/);
});

test('ConfigManager.validate flags departureAirports out of 1-5 range', () => {
  for (const airports of [[], ['A', 'B', 'C', 'D', 'E', 'F']]) {
    const result = ConfigManager.validate(validConfig({ departureAirports: airports }));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('|'), /departureAirports/);
  }
});

test('ConfigManager.validate flags stayOptions ≠ 2 entries or out-of-range', () => {
  for (const stay of [[4], [4, 10, 20], [0, 10], [10, 400], [4, 4]]) {
    const result = ConfigManager.validate(validConfig({ stayOptions: stay }));
    assert.equal(result.ok, false, `expected ${JSON.stringify(stay)} to fail`);
    assert.match(result.errors.join('|'), /stayOptions/);
  }
});

test('ConfigManager.validate flags travelMonths ≠ 5 unique entries in 1-12', () => {
  for (const months of [[1, 2, 3, 4], [1, 2, 3, 4, 5, 6], [1, 1, 2, 3, 4], [0, 1, 2, 3, 4], [13, 1, 2, 3, 4]]) {
    const result = ConfigManager.validate(validConfig({ travelMonths: months }));
    assert.equal(result.ok, false, `expected ${JSON.stringify(months)} to fail`);
    assert.match(result.errors.join('|'), /travelMonths/);
  }
});

test('ConfigManager.validate flags priceThresholds where veryGood > alert or below floor', () => {
  for (const pt of [
    { alert: 300, veryGood: 400 },
    { alert: 49, veryGood: 49 },
    { alert: 500 },
    null,
  ]) {
    const result = ConfigManager.validate(validConfig({ priceThresholds: pt }));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('|'), /priceThresholds/);
  }
});

test('ConfigManager.display returns a human-readable string', () => {
  const out = ConfigManager.display(validConfig());
  assert.match(out, /destinations:\s+Paris, Tokyo/);
  assert.match(out, /departureAirports:\s+JFK, LAX/);
  assert.match(out, /travelMonths:\s+3, 6, 7, 9, 12/);
  assert.match(out, /alert < \$500/);
  assert.match(out, /scheduledTime:\s+08:00/);
});

test('ConfigManager.display handles a fresh/empty config', () => {
  const out = ConfigManager.display(ConfigManager.defaults());
  assert.match(out, /destinations:\s+\(none\)/);
});
