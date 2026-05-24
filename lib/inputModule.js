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

function createStdIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => rl.question(q),
    say: (s = '') => process.stdout.write(s + '\n'),
    close: () => rl.close(),
  };
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

  close() {
    if (this._ownsIO) this.io.close();
  }

  static async getDestinations() {
    const im = new InputModule();
    try {
      return await im.getDestinations();
    } finally {
      im.close();
    }
  }
}

async function runSetup() {
  const current = await loadConfig();
  const destinations = await InputModule.getDestinations();
  const next = await saveConfig({ ...current, destinations });
  return next;
}

module.exports = {
  runSetup,
  InputModule,
  validateDestination,
  MAX_DESTINATIONS,
};
