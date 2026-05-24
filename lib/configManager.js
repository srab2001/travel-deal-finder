const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

const DEFAULT_CONFIG = {
  origins: [],
  destinations: [],
  cabinClass: 'economy',
  searchWindowDays: 90,
  maxStops: 1,
  currency: 'USD',
};

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw err;
  }
}

async function saveConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

module.exports = { loadConfig, saveConfig, DEFAULT_CONFIG, CONFIG_PATH };
