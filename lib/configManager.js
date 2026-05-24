const fs = require('node:fs/promises');
const path = require('node:path');

function configPath() {
  return path.resolve(process.cwd(), 'config.json');
}

const DEFAULT_CONFIG = Object.freeze({
  destinations: [],
  departureAirports: [],
  stayOptions: [],
  travelMonths: [],
  priceThresholds: { alert: 0, veryGood: 0 },
  scheduledTime: '08:00',
  timezone: 'America/New_York',
  lastRunTime: null,
  isScheduled: false,
});

const STAY_DAYS_MIN = 1;
const STAY_DAYS_MAX = 365;
const MONTH_MIN = 1;
const MONTH_MAX = 12;
const PRICE_FLOOR = 50;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class ConfigManager {
  static defaults() {
    return clone(DEFAULT_CONFIG);
  }

  static async load() {
    try {
      const raw = await fs.readFile(configPath(), 'utf8');
      return { ...ConfigManager.defaults(), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code === 'ENOENT') return ConfigManager.defaults();
      throw err;
    }
  }

  static async save(config) {
    const merged = { ...ConfigManager.defaults(), ...config };
    await fs.writeFile(configPath(), JSON.stringify(merged, null, 2) + '\n');
    return merged;
  }

  static async reset() {
    return ConfigManager.save(ConfigManager.defaults());
  }

  static validate(config) {
    const errors = [];
    const c = config ?? {};

    if (!Array.isArray(c.destinations) || c.destinations.length < 1 || c.destinations.length > 10) {
      errors.push('destinations: must have 1-10 items');
    }

    if (!Array.isArray(c.departureAirports) || c.departureAirports.length < 1 || c.departureAirports.length > 5) {
      errors.push('departureAirports: must have 1-5 items');
    }

    if (
      !Array.isArray(c.stayOptions) ||
      c.stayOptions.length !== 2 ||
      c.stayOptions.some((n) => !Number.isInteger(n) || n < STAY_DAYS_MIN || n > STAY_DAYS_MAX)
    ) {
      errors.push(`stayOptions: must have exactly 2 integers in ${STAY_DAYS_MIN}-${STAY_DAYS_MAX}`);
    } else if (c.stayOptions[0] === c.stayOptions[1]) {
      errors.push('stayOptions: the two values must differ');
    }

    if (
      !Array.isArray(c.travelMonths) ||
      c.travelMonths.length !== 5 ||
      new Set(c.travelMonths).size !== 5 ||
      c.travelMonths.some((n) => !Number.isInteger(n) || n < MONTH_MIN || n > MONTH_MAX)
    ) {
      errors.push(`travelMonths: must have exactly 5 unique integers in ${MONTH_MIN}-${MONTH_MAX}`);
    }

    const pt = c.priceThresholds;
    if (
      !pt ||
      typeof pt.alert !== 'number' ||
      typeof pt.veryGood !== 'number' ||
      pt.alert < PRICE_FLOOR ||
      pt.veryGood < PRICE_FLOOR ||
      pt.veryGood > pt.alert
    ) {
      errors.push(`priceThresholds: { alert ≥ veryGood ≥ ${PRICE_FLOOR} } required`);
    }

    return { ok: errors.length === 0, errors };
  }

  static display(config) {
    const c = config ?? {};
    const pt = c.priceThresholds || {};
    const lines = [
      'Travel Deal Finder — current config',
      '',
      `  destinations:        ${(c.destinations || []).join(', ') || '(none)'}`,
      `  departureAirports:   ${(c.departureAirports || []).join(', ') || '(none)'}`,
      `  stayOptions (days):  ${(c.stayOptions || []).join(', ') || '(none)'}`,
      `  travelMonths:        ${(c.travelMonths || []).join(', ') || '(none)'}`,
      `  priceThresholds:     alert < $${pt.alert ?? '?'}, veryGood < $${pt.veryGood ?? '?'}`,
      `  scheduledTime:       ${c.scheduledTime ?? '08:00'}`,
      `  timezone:            ${c.timezone ?? 'America/New_York'}`,
      `  lastRunTime:         ${c.lastRunTime ?? '(never)'}`,
      `  isScheduled:         ${c.isScheduled ?? false}`,
    ];
    return lines.join('\n');
  }
}

module.exports = { ConfigManager, DEFAULT_CONFIG };
