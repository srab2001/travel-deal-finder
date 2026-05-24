const readline = require('node:readline/promises');
const { ConfigManager } = require('./configManager');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  green: wrap('32'),
  yellow: wrap('33'),
  red: wrap('31'),
  cyan: wrap('36'),
  bold: wrap('1'),
  dim: wrap('2'),
};

const MAX_DESTINATIONS = 10;
const MIN_LEN = 2;
const MAX_LEN = 60;
const DESTINATION_PATTERN = /^[\p{L}\p{M}\s'.,\-]+$/u;

const STAY_MIN = 1;
const STAY_MAX = 365;
const STAY_OPTION_COUNT = 2;

const MAX_DEPARTURE_AIRPORTS = 5;
const IATA_PATTERN = /^[A-Za-z]{3,4}$/;

const MONTHS_REQUIRED = 5;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRICE_MIN = 50;

const CITY_TO_AIRPORT = Object.freeze({
  'new york':      ['JFK', 'LGA', 'EWR'],
  'london':        ['LHR', 'LGW', 'STN', 'LCY'],
  'paris':         ['CDG', 'ORY'],
  'tokyo':         ['HND', 'NRT'],
  'los angeles':   ['LAX', 'BUR', 'LGB'],
  'chicago':       ['ORD', 'MDW'],
  'san francisco': ['SFO', 'OAK', 'SJC'],
  'washington':    ['DCA', 'IAD', 'BWI'],
  'boston':        ['BOS'],
  'miami':         ['MIA', 'FLL'],
  'houston':       ['IAH', 'HOU'],
  'dallas':        ['DFW', 'DAL'],
  'atlanta':       ['ATL'],
  'seattle':       ['SEA'],
  'denver':        ['DEN'],
  'philadelphia':  ['PHL'],
  'phoenix':       ['PHX'],
  'toronto':       ['YYZ', 'YTZ'],
  'montreal':      ['YUL'],
  'vancouver':     ['YVR'],
  'mexico city':   ['MEX'],
  'berlin':        ['BER'],
  'frankfurt':     ['FRA'],
  'munich':        ['MUC'],
  'amsterdam':     ['AMS'],
  'madrid':        ['MAD'],
  'barcelona':     ['BCN'],
  'rome':          ['FCO', 'CIA'],
  'milan':         ['MXP', 'LIN'],
  'zurich':        ['ZRH'],
  'dubai':         ['DXB', 'DWC'],
  'singapore':     ['SIN'],
  'hong kong':     ['HKG'],
  'seoul':         ['ICN', 'GMP'],
  'sydney':        ['SYD'],
  'melbourne':     ['MEL'],
  'auckland':      ['AKL'],
  'mumbai':        ['BOM'],
  'delhi':         ['DEL'],
  'bangkok':       ['BKK', 'DMK'],
});

function createStdIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => rl.question(q),
    say: (s = '') => process.stdout.write(s + '\n'),
    close: () => rl.close(),
  };
}

function validatePrice(input) {
  if (input === null || input === undefined) return { ok: false, error: 'empty input' };
  const trimmed = String(input).trim();
  if (trimmed === '') return { ok: false, error: 'empty input' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'must be a whole dollar amount' };
  const n = Number.parseInt(trimmed, 10);
  if (n < PRICE_MIN) return { ok: false, error: `must be at least $${PRICE_MIN}` };
  return { ok: true, value: n };
}

function validateStayOption(input, { other } = {}) {
  if (input === null || input === undefined) return { ok: false, error: 'empty input' };
  const trimmed = String(input).trim();
  if (trimmed === '') return { ok: false, error: 'empty input' };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, error: 'must be a whole number' };
  const n = Number.parseInt(trimmed, 10);
  if (n < STAY_MIN || n > STAY_MAX) return { ok: false, error: `must be between ${STAY_MIN} and ${STAY_MAX}` };
  if (other !== undefined && n === other) return { ok: false, error: `must differ from the other option (${other})` };
  return { ok: true, value: n };
}

function validateDestination(input) {
  if (input === null || input === undefined) return { ok: false, error: 'empty input' };
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty input' };
  if (trimmed.length < MIN_LEN) return { ok: false, error: `too short (min ${MIN_LEN} chars)` };
  if (trimmed.length > MAX_LEN) return { ok: false, error: `too long (max ${MAX_LEN} chars)` };
  if (!DESTINATION_PATTERN.test(trimmed)) return { ok: false, error: 'contains invalid characters' };
  return { ok: true, value: trimmed };
}

class InputModule {
  constructor({ io } = {}) {
    this.io = io ?? createStdIO();
    this._ownsIO = !io;
  }

  async getDestinations() {
    const destinations = [];
    this.io.say(c.bold(c.cyan('\n— Destinations —')));
    this.io.say(c.dim(`Enter up to ${MAX_DESTINATIONS} destinations. Press Enter on an empty line to finish early.\n`));

    while (destinations.length < MAX_DESTINATIONS) {
      const progress = c.dim(`(${destinations.length + 1}/${MAX_DESTINATIONS})`);
      const raw = await this.io.ask(`${progress} Destination: `);
      if (raw === undefined || String(raw).trim() === '') {
        if (destinations.length === 0) {
          this.io.say(c.yellow('  ⚠  At least one destination is required.'));
          continue;
        }
        break;
      }
      const result = validateDestination(raw);
      if (!result.ok) {
        this.io.say(c.yellow(`  ⚠  ${result.error}`));
        continue;
      }
      if (destinations.includes(result.value)) {
        this.io.say(c.yellow(`  ⚠  "${result.value}" already added`));
        continue;
      }
      destinations.push(result.value);
      this.io.say(c.green(`  ✓ added "${result.value}"`));
    }

    this.io.say(c.bold('\nDestinations to search:'));
    destinations.forEach((d, i) => this.io.say(`  ${i + 1}. ${d}`));

    const answer = (await this.io.ask('\nProceed with these destinations? [Y/n] ')).trim().toLowerCase();
    if (answer === 'n' || answer === 'no') {
      this.io.say(c.yellow('\nStarting over.\n'));
      return this.getDestinations();
    }
    return destinations;
  }

  async getStayOptions() {
    while (true) {
      this.io.say(c.bold(c.cyan('\n— Stay duration —')));
      this.io.say(c.dim(`Pick exactly ${STAY_OPTION_COUNT} stay lengths in days (e.g. 4 and 10).\n`));
      const first = await this._promptStayOption(1);
      const second = await this._promptStayOption(2, first);
      this.io.say('');
      this.io.say(c.green(`  ✓ Stay options: 1. ${first} days, 2. ${second} days`));
      const answer = (await this.io.ask('\nContinue? [Y/n] ')).trim().toLowerCase();
      if (answer === 'n' || answer === 'no') {
        this.io.say(c.yellow('\nLet’s try again.\n'));
        continue;
      }
      return [first, second];
    }
  }

  async getDepartureAirports() {
    const airports = [];
    this.io.say(c.bold(c.cyan('\n— Departure airports —')));
    this.io.say(c.dim(`Enter up to ${MAX_DEPARTURE_AIRPORTS} airports as IATA codes (e.g. JFK) or city names. Empty line to finish.\n`));

    while (airports.length < MAX_DEPARTURE_AIRPORTS) {
      const progress = c.dim(`(${airports.length + 1}/${MAX_DEPARTURE_AIRPORTS})`);
      const raw = await this.io.ask(`${progress} Airport or city: `);
      if (raw === undefined || String(raw).trim() === '') {
        if (airports.length === 0) {
          this.io.say(c.yellow('  ⚠  At least one airport is required.'));
          continue;
        }
        break;
      }
      const choice = await this._resolveAirportInput(String(raw).trim());
      if (!choice) continue;
      if (airports.includes(choice)) {
        this.io.say(c.yellow(`  ⚠  ${choice} already added`));
        continue;
      }
      airports.push(choice);
      this.io.say(c.green(`  ✓ added ${choice}`));
    }

    this.io.say(c.bold('\nDeparture airports:'));
    airports.forEach((a, i) => this.io.say(`  ${i + 1}. ${a}`));

    const answer = (await this.io.ask('\nProceed with these airports? [Y/n] ')).trim().toLowerCase();
    if (answer === 'n' || answer === 'no') {
      this.io.say(c.yellow('\nStarting over.\n'));
      return this.getDepartureAirports();
    }
    return airports;
  }

  async _resolveAirportInput(raw) {
    if (IATA_PATTERN.test(raw)) {
      return raw.toUpperCase();
    }
    const key = raw.toLowerCase();
    const options = CITY_TO_AIRPORT[key];
    if (!options) {
      this.io.say(c.yellow(`  ⚠  Unknown city "${raw}". Enter an IATA code (e.g. JFK) or try another name.`));
      return null;
    }
    if (options.length === 1) {
      this.io.say(c.dim(`  Only one airport for ${raw}: ${options[0]}`));
      return options[0];
    }
    this.io.say(`  ${raw} has ${options.length} airports:`);
    options.forEach((code, i) => this.io.say(`    ${i + 1}. ${code}`));
    while (true) {
      const sel = await this.io.ask(`  Pick 1-${options.length} (or blank to skip): `);
      if (sel === undefined || String(sel).trim() === '') return null;
      const n = Number.parseInt(String(sel).trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        return options[n - 1];
      }
      this.io.say(c.yellow(`  ⚠  enter a number 1-${options.length}`));
    }
  }

  async getTravelMonths() {
    while (true) {
      this.io.say(c.bold(c.cyan('\n— Travel months —')));
      this.io.say(c.dim(`Pick exactly ${MONTHS_REQUIRED} months you're willing to travel.\n`));
      this._renderMonthList(new Set());
      const selected = new Set();
      while (selected.size < MONTHS_REQUIRED) {
        const slot = selected.size + 1;
        const raw = await this.io.ask(`${c.dim(`(${slot}/${MONTHS_REQUIRED})`)} Month number (1-12): `);
        const trimmed = String(raw ?? '').trim();
        if (!/^\d+$/.test(trimmed)) {
          this.io.say(c.yellow('  ⚠  enter a number 1-12'));
          continue;
        }
        const n = Number.parseInt(trimmed, 10);
        if (n < 1 || n > 12) {
          this.io.say(c.yellow('  ⚠  must be 1-12'));
          continue;
        }
        if (selected.has(n)) {
          this.io.say(c.yellow(`  ⚠  ${MONTH_NAMES[n - 1]} already selected`));
          continue;
        }
        selected.add(n);
        this.io.say(c.green(`  ✓ ${MONTH_NAMES[n - 1]}`));
      }
      const sorted = [...selected].sort((a, b) => a - b);
      this.io.say(c.bold('\nSelected travel months:'));
      sorted.forEach((n) => this.io.say(`  ${n}. ${MONTH_NAMES[n - 1]}`));
      const answer = (await this.io.ask('\nProceed with these months? [Y/n] ')).trim().toLowerCase();
      if (answer === 'n' || answer === 'no') {
        this.io.say(c.yellow('\nStarting over.\n'));
        continue;
      }
      return sorted;
    }
  }

  async getPriceThresholds() {
    while (true) {
      this.io.say(c.bold(c.cyan('\n— Price thresholds —')));
      this.io.say(c.dim('Alert below the first; flag as "very good deal" below the second.\n'));
      const alert = await this._promptPrice('Alert threshold (flights under this price): $');
      const veryGood = await this._promptPriceAtMost('Very good deal threshold: $', alert);
      this.io.say(c.green(`\n  ✓ Alert below $${alert}, very good deal below $${veryGood}`));
      const answer = (await this.io.ask('\nContinue? [Y/n] ')).trim().toLowerCase();
      if (answer === 'n' || answer === 'no') {
        this.io.say(c.yellow('\nLet’s try again.\n'));
        continue;
      }
      return { alert, veryGood };
    }
  }

  async _promptPrice(label) {
    while (true) {
      const raw = await this.io.ask(label);
      const result = validatePrice(raw);
      if (!result.ok) {
        this.io.say(c.yellow(`  ⚠  ${result.error}`));
        continue;
      }
      return result.value;
    }
  }

  async _promptPriceAtMost(label, ceiling) {
    while (true) {
      const value = await this._promptPrice(label);
      if (value > ceiling) {
        this.io.say(c.yellow(`  ⚠  very good ($${value}) must be ≤ alert ($${ceiling})`));
        continue;
      }
      return value;
    }
  }

  _renderMonthList(selected) {
    const cols = 4;
    for (let row = 0; row < 3; row++) {
      const cells = [];
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const checkbox = selected.has(i + 1) ? '[x]' : '[ ]';
        cells.push(`  ${checkbox} ${String(i + 1).padStart(2)}. ${MONTH_NAMES[i].padEnd(10)}`);
      }
      this.io.say(cells.join(''));
    }
    this.io.say('');
  }

  async _promptStayOption(slot, other) {
    while (true) {
      const raw = await this.io.ask(`Stay option ${slot} (number of days): `);
      const result = validateStayOption(raw, other === undefined ? {} : { other });
      if (!result.ok) {
        this.io.say(c.yellow(`  ⚠  ${result.error}`));
        continue;
      }
      return result.value;
    }
  }

  close() {
    if (this._ownsIO) this.io.close();
  }

  static async getDestinations() {
    return InputModule._runOnce('getDestinations');
  }

  static async getStayOptions() {
    return InputModule._runOnce('getStayOptions');
  }

  static async getDepartureAirports() {
    return InputModule._runOnce('getDepartureAirports');
  }

  static async getTravelMonths() {
    return InputModule._runOnce('getTravelMonths');
  }

  static async getPriceThresholds() {
    return InputModule._runOnce('getPriceThresholds');
  }

  static async _runOnce(method) {
    const im = new InputModule();
    try {
      return await im[method]();
    } finally {
      im.close();
    }
  }
}

async function runSetup() {
  const current = await ConfigManager.load();
  const im = new InputModule();
  try {
    const destinations = await im.getDestinations();
    const stayOptions = await im.getStayOptions();
    const departureAirports = await im.getDepartureAirports();
    const travelMonths = await im.getTravelMonths();
    const priceThresholds = await im.getPriceThresholds();
    return await ConfigManager.save({
      ...current,
      destinations,
      stayOptions,
      departureAirports,
      travelMonths,
      priceThresholds,
    });
  } finally {
    im.close();
  }
}

module.exports = {
  runSetup,
  InputModule,
  validateDestination,
  validateStayOption,
  MAX_DESTINATIONS,
  STAY_MIN,
  STAY_MAX,
  STAY_OPTION_COUNT,
  MAX_DEPARTURE_AIRPORTS,
  IATA_PATTERN,
  CITY_TO_AIRPORT,
  MONTHS_REQUIRED,
  MONTH_NAMES,
  validatePrice,
  PRICE_MIN,
};
