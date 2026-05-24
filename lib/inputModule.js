const { loadConfig, saveConfig } = require('./configManager');

async function runSetup() {
  const current = await loadConfig();
  console.log('Interactive setup is a Phase 1 task.');
  console.log('Current config:');
  console.log(JSON.stringify(current, null, 2));
  await saveConfig(current);
  return current;
}

module.exports = { runSetup };
