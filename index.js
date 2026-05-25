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
    case '--search': {
      const result = await runSearch();
      return result.results.length === 0 && result.errors.length > 0 ? 1 : 0;
    }
    case '--validate':
      return await runValidate();
    case '--display':
      return await runDisplay();
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

async function runValidate() {
  const config = await ConfigManager.load();
  const { ok, errors } = ConfigManager.validate(config);
  if (ok) {
    console.log('Config is valid.');
    return 0;
  }
  console.error('Config has errors:');
  for (const err of errors) console.error(`  - ${err}`);
  console.error('\nRun `node index.js --setup` to fix.');
  return 1;
}

async function runDisplay() {
  const config = await ConfigManager.load();
  console.log(ConfigManager.display(config));
  return 0;
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

  return new Promise(() => {});
}

function printHelp() {
  console.log(`travel-deal-finder

Usage:
  node index.js --setup      Configure departure airports, destinations, dates, and price thresholds
  node index.js --search     Run a one-shot price check and write a CSV report
  node index.js --validate   Check that the current config.json passes all rules
  node index.js --display    Pretty-print the current config
  node index.js --daemon     Start the scheduler in the foreground (PM2/systemd entry point)
  node index.js --help       Show this message
`);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
