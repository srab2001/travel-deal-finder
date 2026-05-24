# travel-deal-finder

Daily flight price monitoring tool — find deals across destinations and airports.

> **Status:** Phase 0 scaffold. Core modules are stubs awaiting Phase 1 implementation.

## What it does

Given a list of origin airports and destination cities, `travel-deal-finder` polls
flight prices on a schedule, records the daily snapshot to CSV, and surfaces the
best deals it finds. It is designed to run locally (cron / GitHub Actions) and
keep your own historical price record without depending on a SaaS account.

## Project layout

```
travel-deal-finder/
├── .github/workflows/ci.yml    # CI: tests on every push
├── lib/
│   ├── configManager.js        # load/save user config
│   ├── inputModule.js          # interactive prompts for setup
│   ├── flightSearcher.js       # flight provider integration
│   ├── reportGenerator.js      # CSV / console reports
│   └── scheduler.js            # (Phase 2) cron/daily runs
├── tests/                      # node:test unit tests
├── docs/                       # ARCHITECTURE, API_INTEGRATION, DEPLOYMENT
├── index.js                    # CLI entry point
├── QUICKSTART.md               # 60-second getting-started
└── PROMPTS.md                  # implementation prompts archive
```

## Quick start

```bash
git clone https://github.com/srab2001/travel-deal-finder.git
cd travel-deal-finder
npm install
npm run setup     # interactive config
npm run search    # one-shot price check
```

See [QUICKSTART.md](QUICKSTART.md) for a walkthrough and
[docs/](docs/) for architecture and deployment.

## Requirements

- Node.js 16+
- A flight-pricing API key (see [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md))

## Contributing

Branch from `develop`, commit using
[Conventional Commits](https://www.conventionalcommits.org/), and open a PR
against `develop`. See [docs/WORKFLOW.md](docs/WORKFLOW.md).

## License

MIT — see [LICENSE](LICENSE).
