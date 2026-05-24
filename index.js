#!/usr/bin/env node
const { runSetup } = require('./lib/inputModule');
const { runSearch } = require('./lib/flightSearcher');
const { ConfigManager } = require('./lib/configManager');
const { Scheduler } = require('./lib/scheduler');

async function main(argv) {
  const cmd = argv.find((a) => a.startsWith('--'));
  switch (cmd) {
    case '--setup':
      await runSetup();
      return 0;
    case '--search':
      await runSearch();
      return 0;
    case '--daemon':
      await runDaemon();
      return 0;
    case undefined:
    case '--help':
      printHelp();
      return 0;
    default:
      console.error(`Unknown flag: ${cmd}`);
      printHelp();
      return 1;
  }
}

async function runDaemon() {
  const config = await ConfigManager.load();
  const scheduler = new Scheduler(config);
  await scheduler.start(runSearch);
  const status = scheduler.getStatus();
  console.log(`Daemon started. Next run: ${status.nextRunAt} (${status.timezone}).`);
  console.log('Logs: logs/scheduler.log. SIGTERM/SIGINT for graceful shutdown.');

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}, stopping scheduler...`);
    scheduler.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the event loop alive while node-cron holds its own timer.
  // Returns a promise that never resolves, so main() doesn't exit.
  return new Promise(() => {});
}

function printHelp() {
  console.log(`travel-deal-finder

Usage:
  node index.js --setup     Configure departure airports, destinations, dates, and price thresholds
  node index.js --search    Run a one-shot price check and write a CSV report
  node index.js --daemon    Start the scheduler in the foreground (PM2/systemd entry point)
  node index.js --help      Show this message
`);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
