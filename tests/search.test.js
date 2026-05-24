const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, HEADER } = require('../lib/reportGenerator');

test('reportGenerator.toCsv writes header on empty input', () => {
  const csv = toCsv([]);
  assert.equal(csv, HEADER.join(',') + '\n');
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
  const { runSearch } = require('../lib/flightSearcher');
  assert.equal(typeof runSearch, 'function');
});
