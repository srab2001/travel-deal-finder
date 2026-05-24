const fs = require('node:fs/promises');
const path = require('node:path');
const { toCsv, csvEscape } = require('./reportGenerator');

const CSV_HEADER = [
  'date_checked',
  'departure',
  'destination',
  'outbound_date',
  'return_date',
  'stay_days',
  'price_usd',
  'price_per_day',
  'airline',
  'stops',
  'duration',
  'url',
];

const RESULTS_PREFIX = 'results_';
const RESULTS_CSV_PATTERN = /^results_(\d{4}-\d{2}-\d{2})\.csv$/;
const BEST_PRICES_FILE = 'best_prices.json';

function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function rowFromResult(result, dateChecked) {
  const stay = Number(result.stayDays) || 0;
  const price = Number(result.price) || 0;
  const pricePerDay = stay > 0 ? Math.round((price / stay) * 100) / 100 : null;
  return {
    date_checked: dateChecked,
    departure: result.departure,
    destination: result.destination,
    outbound_date: result.departDate ?? result.outboundDate ?? '',
    return_date: result.returnDate ?? '',
    stay_days: stay || '',
    price_usd: price || '',
    price_per_day: pricePerDay ?? '',
    airline: result.airline ?? '',
    stops: result.stops ?? '',
    duration: result.duration ?? '',
    url: result.url ?? '',
  };
}

async function saveResultsToCSV(results, filename, { outDir = process.cwd(), date = new Date() } = {}) {
  const stamp = todayIso(date);
  const file = path.join(outDir, filename || `${RESULTS_PREFIX}${stamp}.csv`);
  const rows = results.map((r) => rowFromResult(r, stamp));
  await fs.writeFile(file, toCsv(rows, CSV_HEADER));
  return file;
}

async function saveResultsToJSON(results, filename, { outDir = process.cwd(), date = new Date() } = {}) {
  const stamp = todayIso(date);
  const file = path.join(outDir, filename || `${RESULTS_PREFIX}${stamp}.json`);
  const payload = {
    savedAt: date.toISOString(),
    date: stamp,
    count: results.length,
    results,
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    if (row.price_usd !== '') row.price_usd = Number(row.price_usd);
    if (row.price_per_day !== '') row.price_per_day = Number(row.price_per_day);
    if (row.stay_days !== '') row.stay_days = Number(row.stay_days);
    if (row.stops !== '') row.stops = Number(row.stops);
    return row;
  });
}

async function loadHistoricalResults(days = 30, { dir = process.cwd(), now = new Date() } = {}) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const matched = entries
    .map((name) => {
      const m = name.match(RESULTS_CSV_PATTERN);
      if (!m) return null;
      const fileDate = new Date(`${m[1]}T00:00:00Z`);
      return { name, dateMs: fileDate.getTime(), iso: m[1] };
    })
    .filter((e) => e && e.dateMs >= cutoffMs)
    .sort((a, b) => a.dateMs - b.dateMs);
  const out = [];
  for (const { name } of matched) {
    const raw = await fs.readFile(path.join(dir, name), 'utf8');
    out.push(...parseCsv(raw));
  }
  return out;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function updateBestPrices(results, { dir = process.cwd(), date = new Date() } = {}) {
  const file = path.join(dir, BEST_PRICES_FILE);
  const existing = await readJson(file);
  const stamp = todayIso(date);
  for (const r of results) {
    const key = `${r.departure}-${r.destination}`;
    const current = existing[key];
    if (!current || r.price < current.price) {
      existing[key] = {
        price: r.price,
        airline: r.airline,
        date: stamp,
        departDate: r.departDate ?? null,
        returnDate: r.returnDate ?? null,
      };
    }
  }
  await fs.writeFile(file, JSON.stringify(existing, null, 2) + '\n');
  return existing;
}

async function calculatePriceTrends(destination, days = 30, { dir = process.cwd(), now = new Date() } = {}) {
  const history = await loadHistoricalResults(days, { dir, now });
  const subset = history.filter((r) => r.destination === destination && typeof r.price_usd === 'number');
  if (subset.length === 0) {
    return { destination, samples: 0, min: null, max: null, avg: null, trend: 'unknown' };
  }
  const prices = subset.map((r) => r.price_usd);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100;

  let trend = 'stable';
  if (subset.length >= 4) {
    const sorted = subset.slice().sort((a, b) => a.date_checked.localeCompare(b.date_checked));
    const half = Math.floor(sorted.length / 2);
    const oldAvg = mean(sorted.slice(0, half).map((r) => r.price_usd));
    const newAvg = mean(sorted.slice(half).map((r) => r.price_usd));
    const delta = (newAvg - oldAvg) / oldAvg;
    if (delta > 0.05) trend = 'up';
    else if (delta < -0.05) trend = 'down';
  }
  return { destination, samples: subset.length, min, max, avg, trend };
}

function mean(arr) {
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

module.exports = {
  saveResultsToCSV,
  saveResultsToJSON,
  loadHistoricalResults,
  updateBestPrices,
  calculatePriceTrends,
  CSV_HEADER,
  parseCsv,
  parseCsvLine,
};
