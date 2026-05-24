# Architecture

## One-line summary

A four-stage pipeline — **config → input → search → report** — orchestrated by a
thin CLI entry point, with an external scheduler (cron or GitHub Actions)
re-invoking the binary on a daily cadence.

## Module map

```
                          ┌──────────────────┐
        crontab / GH     │   index.js (CLI) │
        Actions ────────▶│  --setup/--search│
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                     ▼
       ┌──────────────┐   ┌────────────────┐    ┌──────────────────┐
       │ configManager│   │ flightSearcher │    │ reportGenerator  │
       │  JSON I/O    │   │ provider client│    │ CSV + top-N      │
       └──────┬───────┘   └────────┬───────┘    └────────┬─────────┘
              │                    │                     │
              ▼                    ▼                     ▼
        config.json          provider API           results_*.csv
                                                    + console deals
```

`inputModule.js` is only invoked under `--setup`; it writes through
`configManager`. Everything else reads, never asks.

## Design choices

| Choice | Rationale |
|---|---|
| CommonJS, no transpile | Node 16+ supports everything we need; faster boot for cron. |
| `node:test` runner | Zero deps for the test suite; matches `npm test` out of the box. |
| Single `config.json` (gitignored) | Trivial to back up; lives next to `index.js`; no DB. |
| CSV per-day output | Greppable, joinable, Excel-friendly; no schema migration. |
| Provider behind an interface | Lets us swap Kiwi → Amadeus → Skyscanner without touching the rest. |
| Scheduling left external | One less thing to babysit. Cron and GitHub Actions are reliable. |

## Data flow per run

1. `index.js` parses `--setup` or `--search`.
2. `configManager.loadConfig()` returns the merged config (defaults + user file).
3. `flightSearcher.runSearch(config)` fans out queries to the provider, with
   per-route retry + backoff.
4. Results normalize to `{date, origin, destination, departDate, returnDate, price, currency, carrier}`.
5. `reportGenerator.writeReport(rows)` produces `results_YYYY-MM-DD.csv` and
   prints the top-N to stdout.

## Extension points (Phase 2+)

- **`lib/scheduler.js`** — in-process scheduler for users who don't want cron.
- **`lib/notifier.js`** *(future)* — email / Slack / push when a price drops
  below a per-route threshold stored in config.
- **`lib/historyStore.js`** *(future)* — fold daily CSVs into a long-running
  time series for trend detection.

## Non-goals

- Booking. We surface prices; humans book.
- Multi-user / SaaS. Single-user local tool.
- Real-time pricing. Daily granularity is enough for trip planning.
