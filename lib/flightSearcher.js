const { loadConfig } = require('./configManager');
const { writeReport } = require('./reportGenerator');

async function runSearch() {
  const config = await loadConfig();
  if (config.origins.length === 0 || config.destinations.length === 0) {
    console.error('No origins or destinations configured. Run `npm run setup` first.');
    return { rows: [] };
  }
  console.log('Flight provider integration is a Phase 1 task.');
  const rows = [];
  await writeReport(rows);
  return { rows };
}

module.exports = { runSearch };
