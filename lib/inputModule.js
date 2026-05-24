const readline = require('node:readline/promises');
const { loadConfig, saveConfig } = require('./configManager');

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

function createStdIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => rl.question(q),
    say: (s = '') => process.stdout.write(s + '\n'),
    close: () => rl.close(),
  };
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
  const current = await loadConfig();
  const im = new InputModule();
  try {
    const destinations = await im.getDestinations();
    const stayOptions = await im.getStayOptions();
    return await saveConfig({ ...current, destinations, stayOptions });
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
};
