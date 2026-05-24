const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('configManager exports DEFAULT_CONFIG with expected shape', () => {
  const { DEFAULT_CONFIG } = require('../lib/configManager');
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), [
    'cabinClass',
    'currency',
    'destinations',
    'maxStops',
    'origins',
    'searchWindowDays',
  ]);
});

test('saveConfig + loadConfig round-trips merged defaults', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdf-'));
  const original = process.cwd();
  process.chdir(tmp);
  try {
    delete require.cache[require.resolve('../lib/configManager')];
    const { saveConfig, loadConfig } = require('../lib/configManager');
    await saveConfig({ origins: ['SFO'], destinations: ['NRT'] });
    const loaded = await loadConfig();
    assert.deepEqual(loaded.origins, ['SFO']);
    assert.deepEqual(loaded.destinations, ['NRT']);
    assert.equal(loaded.cabinClass, 'economy');
  } finally {
    process.chdir(original);
    delete require.cache[require.resolve('../lib/configManager')];
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
