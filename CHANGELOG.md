# Changelog

All notable changes to `travel-deal-finder`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1a] — 2026-05-24 — pre-release

Performance pass on `FlightSearcher`. No API or schema changes. Marked as
a pre-release because it changes timing semantics that downstream code
might (theoretically) depend on.

### Changed

- **Mock mode no longer pays the rate limit.** Previously `--search` with
  no API key still slept 2s between every combo, making a typical search
  take an hour. Now mock mode is pure CPU.
- **Parallel workers in `searchAllCombinations`.** New `concurrency`
  option, defaults to 4 in live mode (well under any provider's
  cap-per-second) and unlimited in mock mode. Workers pull from a single
  queue so progress is monotonic.
- **Rate limit is now atomic across workers.** Replaced `lastRequestAt`
  with `nextSlotAt` so concurrent calls each reserve their own slot
  instead of all racing for the same one. Effective rate stays at
  `1/rateLimitMs` per second regardless of `concurrency`.

### Measured impact

- 2,214-combo mock search (3 airports × 3 destinations × 2 stays ×
  5 months): **0.101s** end-to-end (was ~74 minutes pre-fix)
- Live mode with concurrency=4, rateLimitMs=2000: ~4× faster than v0.1.1
  on the same workload by overlapping network latency

### Tests

- 95 passing (3 new): mock skips rate limit; live mode still enforces
  it; explicit `concurrency=N` caps in-flight calls at N

## [0.1.1] — 2026-05-24

Closes the three "should fix soon" gaps called out in v0.1.0's
[LESSONS_LEARNED](docs/LESSONS_LEARNED.md). No new features, no schema
changes — pure quality patch.

### Added

- **`--validate` CLI flag** — runs `ConfigManager.validate()` against the
  current `config.json`. Prints `Config is valid.` and exits 0 on success;
  prints the error list and exits 1 on failure. Useful in cron pre-hooks
  and CI.
- **`--display` CLI flag** — pretty-prints the current config via
  `ConfigManager.display()`. Exit 0.

### Changed

- **`runSearch` now gates on `ConfigManager.validate()`** — a broken
  config no longer silently produces empty results. Errors are logged
  via the injectable `logger` and returned in the `errors` field.
- **`node index.js --search` exits 1** when validation kills the run
  (results empty AND errors present). Previously always exited 0.
- **Branch protection enabled on `main`** — squash merge only, require PR,
  require CI to pass, no force pushes.

### Tests

- 92 passing (one new case for `runSearch` validation gate)

## [0.1.0] — 2026-05-24

Initial release. End-to-end pipeline: configure → search → persist →
schedule → deploy.

### Added

- **Interactive setup (`lib/inputModule.js`)** — `InputModule` class with five
  static methods, each with progress indicator, validation re-prompts,
  numbered confirmation, and restart-on-reject:
  - `getDestinations()` — up to 10 unicode-aware city names
  - `getStayOptions()` — exactly 2 distinct stay lengths in days (1–365)
  - `getDepartureAirports()` — up to 5 IATA codes or city names against
    a 39-city dictionary; multi-airport cities prompt to pick
  - `getTravelMonths()` — exactly 5 of 12, returned sorted
  - `getPriceThresholds()` — `{ alert, veryGood }` with `alert ≥ veryGood ≥ $50`
- **Configuration (`lib/configManager.js`)** — `ConfigManager` class:
  `load`, `save`, `validate`, `reset`, `display`. JSON file at
  `./config.json` (gitignored). Validation covers all five input shapes.
- **Flight search (`lib/flightSearcher.js`)** — `FlightSearcher` class with
  `Kiwi.com (Tequila)` integration and deterministic mock fallback:
  - Static: `formatDate`, `generateFlightURL`, `getDateRangesForMonth`
  - Instance: `scrapeGoogleFlights` (24h cache + 2s rate limit + 3-attempt
    exponential backoff), `searchAllCombinations` (cartesian product with
    progress callback), `findBestDeals`, `groupByDestination`
  - Env-driven: `FLIGHT_API_KEY`, `FLIGHT_PROVIDER`; mock if unset
- **Persistence (`lib/persistence.js`)** — `saveResultsToCSV` (12-column
  per-spec schema with computed `price_per_day`), `saveResultsToJSON`
  (envelope with `savedAt` + `count`), `loadHistoricalResults` (globs
  `results_YYYY-MM-DD.csv`, parses with embedded-comma-safe parser, sorted
  oldest→newest), `updateBestPrices` (`best_prices.json` keyed
  `JFK-Paris`, lowest-wins), `calculatePriceTrends` (min/max/avg + trend
  via halved-window comparison with 5% deadband)
- **Scheduler (`lib/scheduler.js`)** — `Scheduler` class on top of
  `node-cron`: `start`, `stop`, `getStatus`, `manualRun`. Errors caught
  and logged, never propagated. Runs log to `logs/scheduler.log`.
- **CLI (`index.js`)** — `--setup`, `--search`, `--daemon`, `--help`
- **PM2 deployment (`ecosystem.config.js`)** — fork mode, autorestart,
  512MB memory cap, 5s grace shutdown, split error/output logs
- **Docs** — `README`, `QUICKSTART`, `PROMPTS`, `BLUEPRINT`,
  `ARCHITECTURE`, `API_INTEGRATION`, `USER_GUIDE`, `SCHEDULING`,
  `DEPLOYMENT`, `LESSONS_LEARNED`, `GITHUB_SETUP`, `CLONE_GUIDE`,
  `WORKFLOW`
- **CI** — GitHub Actions running `npm test` on Node 18 + 20 for every
  push and PR

### Schema

`config.json`:

```json
{
  "destinations":       ["Paris", "Tokyo"],
  "departureAirports":  ["JFK", "LAX"],
  "stayOptions":        [4, 10],
  "travelMonths":       [3, 6, 7, 9, 12],
  "priceThresholds":    { "alert": 500, "veryGood": 400 },
  "scheduledTime":      "08:00",
  "timezone":           "America/New_York",
  "lastRunTime":        null,
  "isScheduled":        false
}
```

### Tests

- 91 passing on Node 18 and Node 20
- Coverage by module: input 31, config 16, search 17, persistence 13,
  scheduler 12, report 2
- All I/O is injectable (`fetchImpl`, `sleep`, `now`, `rng`,
  `cronImpl`, `fsImpl`) — no network, no real timers, no clock sensitivity

### Deviations from spec

| Spec | Built | Why |
|---|---|---|
| `csv-writer` library (prompt 10) | In-tree writer via `reportGenerator.toCsv` + exported `csvEscape` | Same functionality, no new dep |
| Separate PM2 entry script (prompt 12) | `index.js --daemon` mode | One CLI entry instead of two; PM2 config passes `args: '--daemon'` |

### PR trail

| # | Title | SHA |
|---|---|---|
| [1](https://github.com/srab2001/travel-deal-finder/pull/1) | feat: add interactive destination input | 5c4a6eb |
| [2](https://github.com/srab2001/travel-deal-finder/pull/2) | feat: interactive setup inputs (Phase 2 prompts 3–6) | d27f9aa |
| [3](https://github.com/srab2001/travel-deal-finder/pull/3) | feat: ConfigManager class + schema rename | 7e845c3 |
| [4](https://github.com/srab2001/travel-deal-finder/pull/4) | feat: FlightSearcher with mock + Kiwi.com API | 741d923 |
| [5](https://github.com/srab2001/travel-deal-finder/pull/5) | feat: results persistence (CSV/JSON, history, best prices, trends) | f327ed5 |
| [6](https://github.com/srab2001/travel-deal-finder/pull/6) | feat: daily job scheduler (node-cron) | 2c73e22 |
| [7](https://github.com/srab2001/travel-deal-finder/pull/7) | feat: PM2 production configuration | 65ec7b4 |
