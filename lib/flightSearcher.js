const crypto = require('node:crypto');
const { ConfigManager } = require('./configManager');
const { writeReport } = require('./reportGenerator');

const KIWI_SEARCH_URL = 'https://api.tequila.kiwi.com/v2/search';
const DEFAULT_RATE_LIMIT_MS = 2000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 8000;
const AIRLINES = ['United', 'Delta', 'American', 'Southwest', 'JetBlue', 'Alaska', 'Spirit', 'Frontier'];

class FlightSearcher {
  constructor({
    apiKey = process.env.FLIGHT_API_KEY,
    provider = process.env.FLIGHT_PROVIDER || 'kiwi',
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
    rateLimitMs = DEFAULT_RATE_LIMIT_MS,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    retryAttempts = DEFAULT_RETRY_ATTEMPTS,
    rng = Math.random,
    logger = console,
  } = {}) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.now = now;
    this.rateLimitMs = rateLimitMs;
    this.cacheTtlMs = cacheTtlMs;
    this.retryAttempts = retryAttempts;
    this.rng = rng;
    this.logger = logger;
    this.cache = new Map();
    this.lastRequestAt = 0;
  }

  // ---- static utilities ----

  static formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  static generateFlightURL(departure, destination, outDate, returnDate) {
    const q = returnDate
      ? `Flights from ${departure} to ${destination} on ${outDate} returning ${returnDate}`
      : `Flights from ${departure} to ${destination} on ${outDate}`;
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
  }

  static getDateRangesForMonth(year, month, stayDays) {
    const monthIdx = month - 1;
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const ranges = [];
    const lastValidStart = daysInMonth - stayDays + 1;
    for (let day = 1; day <= lastValidStart; day++) {
      const start = new Date(Date.UTC(year, monthIdx, day));
      const end = new Date(Date.UTC(year, monthIdx, day + stayDays - 1));
      ranges.push([FlightSearcher.formatDate(start), FlightSearcher.formatDate(end)]);
    }
    return ranges;
  }

  // ---- main search ----

  async scrapeGoogleFlights(departure, destination, outDate, returnDate) {
    const key = `${departure}|${destination}|${outDate}|${returnDate ?? ''}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.ts < this.cacheTtlMs) {
      return cached.result;
    }

    const elapsed = this.now() - this.lastRequestAt;
    if (elapsed < this.rateLimitMs) {
      await this.sleep(this.rateLimitMs - elapsed);
    }

    let result;
    if (this.apiKey && this.provider === 'kiwi' && this.fetchImpl) {
      try {
        result = await this._queryKiwi(departure, destination, outDate, returnDate);
      } catch (err) {
        this._log('error', `kiwi query failed (${err.message}); using mock`);
        result = this._mockFlight(departure, destination, outDate, returnDate);
      }
    } else {
      result = this._mockFlight(departure, destination, outDate, returnDate);
    }

    this.lastRequestAt = this.now();
    this.cache.set(key, { ts: this.now(), result });
    return result;
  }

  async searchAllCombinations(config, { onProgress, year } = {}) {
    const results = [];
    const errors = [];
    const today = new Date();
    const currentYear = today.getUTCFullYear();
    const currentMonth = today.getUTCMonth() + 1;
    const combos = [];

    for (const departure of config.departureAirports) {
      for (const destination of config.destinations) {
        for (const stay of config.stayOptions) {
          for (const month of config.travelMonths) {
            const targetYear = year ?? (month <= currentMonth ? currentYear + 1 : currentYear);
            for (const [out, back] of FlightSearcher.getDateRangesForMonth(targetYear, month, stay)) {
              combos.push({ departure, destination, stay, month, out, back });
            }
          }
        }
      }
    }

    for (let i = 0; i < combos.length; i++) {
      const c = combos[i];
      if (typeof onProgress === 'function') onProgress(i + 1, combos.length, c);
      try {
        const r = await this.scrapeGoogleFlights(c.departure, c.destination, c.out, c.back);
        results.push({ ...r, departDate: c.out, returnDate: c.back, stayDays: c.stay });
      } catch (err) {
        errors.push({ combo: c, error: err.message });
      }
    }
    return { results, errors };
  }

  findBestDeals(results, limit = 10) {
    return [...results].sort((a, b) => a.price - b.price).slice(0, limit);
  }

  groupByDestination(results) {
    const grouped = {};
    for (const r of results) {
      (grouped[r.destination] ??= []).push(r);
    }
    return grouped;
  }

  // ---- internals ----

  async _queryKiwi(departure, destination, outDate, returnDate) {
    const params = new URLSearchParams({
      fly_from: departure,
      fly_to: destination,
      date_from: this._toKiwiDate(outDate),
      date_to: this._toKiwiDate(outDate),
      curr: 'USD',
      sort: 'price',
      limit: '1',
    });
    if (returnDate) {
      params.set('return_from', this._toKiwiDate(returnDate));
      params.set('return_to', this._toKiwiDate(returnDate));
    }
    const url = `${KIWI_SEARCH_URL}?${params.toString()}`;
    const result = await this._withRetry(async () => {
      const res = await this.fetchImpl(url, { headers: { apikey: this.apiKey } });
      if (!res.ok) throw new Error(`kiwi HTTP ${res.status}`);
      const json = await res.json();
      if (!json.data || json.data.length === 0) throw new Error('no results');
      const f = json.data[0];
      return {
        departure,
        destination,
        price: Math.round(f.price),
        airline: (f.airlines && f.airlines[0]) || 'Unknown',
        duration: f.duration?.total != null ? this._fmtDuration(f.duration.total) : 'unknown',
        stops: Array.isArray(f.route) ? Math.max(0, f.route.length - 1) : 0,
        url: f.deep_link || FlightSearcher.generateFlightURL(departure, destination, outDate, returnDate),
      };
    });
    this._log('log', `kiwi ${departure}->${destination} ${outDate} → $${result.price}`);
    return result;
  }

  async _withRetry(fn) {
    let lastErr;
    for (let i = 0; i < this.retryAttempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i === this.retryAttempts - 1) break;
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** i + Math.floor(this.rng() * 250));
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  _mockFlight(departure, destination, outDate, returnDate) {
    const hash = crypto.createHash('sha1').update(`${departure}|${destination}|${outDate}`).digest();
    const basePrice = 180 + (hash[0] % 600);
    const jitter = Math.floor(this.rng() * 80);
    const airline = AIRLINES[hash[1] % AIRLINES.length];
    const stopRoll = hash[2] % 100;
    const stops = stopRoll < 60 ? 0 : stopRoll < 90 ? 1 : 2;
    const durationHours = 2 + (hash[3] % 14);
    const durationMins = hash[4] % 60;
    return {
      departure,
      destination,
      price: basePrice + jitter,
      airline,
      duration: `${durationHours}h ${durationMins}m`,
      stops,
      url: FlightSearcher.generateFlightURL(departure, destination, outDate, returnDate),
    };
  }

  _toKiwiDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  _fmtDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  _log(level, msg) {
    const ts = new Date().toISOString();
    const fn = this.logger?.[level];
    if (typeof fn === 'function') fn(`[FlightSearcher ${ts}] ${msg}`);
  }
}

async function runSearch(opts = {}) {
  const { config: providedConfig, logger = console, ...searcherOpts } = opts;
  const config = providedConfig ?? (await ConfigManager.load());
  const validation = ConfigManager.validate(config);
  if (!validation.ok) {
    logger.error('Config is invalid. Run `node index.js --setup` to fix:');
    for (const err of validation.errors) logger.error(`  - ${err}`);
    return { results: [], errors: validation.errors.map((message) => ({ error: message })) };
  }
  const searcher = new FlightSearcher(searcherOpts);
  const spinChars = ['|', '/', '-', '\\'];
  process.stdout.write('Searching... ');
  const { results, errors } = await searcher.searchAllCombinations(config, {
    onProgress: (i, total) => {
      process.stdout.write(`\rSearching... ${spinChars[i % 4]} ${i}/${total}  `);
    },
  });
  process.stdout.write(`\rSearched ${results.length} combinations (${errors.length} errors).\n`);
  await writeReport(results.map((r) => ({
    date: FlightSearcher.formatDate(new Date()),
    origin: r.departure,
    destination: r.destination,
    departDate: r.departDate,
    returnDate: r.returnDate,
    price: r.price,
    currency: 'USD',
    carrier: r.airline,
  })));
  const top = searcher.findBestDeals(results, 5);
  if (top.length) {
    console.log('\nTop deals:');
    top.forEach((d, i) => {
      console.log(`  ${i + 1}. $${d.price} ${d.airline} — ${d.departure}→${d.destination} ${d.departDate} (${d.duration}, ${d.stops} stops)`);
    });
  }
  return { results, errors };
}

module.exports = { FlightSearcher, runSearch };
