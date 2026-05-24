const { ConfigManager } = require('./configManager');
const { writeReport } = require('./reportGenerator');

async function runSearch() {
  const config = await ConfigManager.load();
  if (config.departureAirports.length === 0 || config.destinations.length === 0) {
    console.error('No departure airports or destinations configured. Run `npm run setup` first.');
    return { rows: [] };
  }
  console.log('Flight provider integration is a Phase 1 task.');
  const rows = [];
  await writeReport(rows);
  return { rows };
}

module.exports = { runSearch };
