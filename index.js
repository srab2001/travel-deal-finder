#!/usr/bin/env node
const { runSetup } = require('./lib/inputModule');
const { runSearch } = require('./lib/flightSearcher');

async function main(argv) {
  const cmd = argv.find((a) => a.startsWith('--'));
  switch (cmd) {
    case '--setup':
      await runSetup();
      return 0;
    case '--search':
      await runSearch();
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

function printHelp() {
  console.log(`travel-deal-finder

Usage:
  node index.js --setup     Configure origins, destinations, and date windows
  node index.js --search    Run a one-shot price check and write a CSV report
  node index.js --help      Show this message
`);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
