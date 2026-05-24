# Architecture

How the pieces fit together as of v0.1.0.

## One-line summary

A six-module pipeline — **input → config → search → persist → schedule →
deploy** — wired together by a tiny CLI entry point. Everything is files
on disk; no external services beyond the flight API.

## Module map

```
                      ┌────────────────────────┐
                      │     index.js (CLI)     │
                      │ --setup / --search /   │
                      │ --daemon / --help      │
                      └───────────┬────────────┘
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
 ┌──────────────┐         ┌────────────────┐        ┌──────────────────┐
 │ inputModule  │         │ flightSearcher │        │ scheduler        │
 │ 5 prompts    │         │ Kiwi + mock,   │◀──────▶│ node-cron daily, │
 │ (interactive)│         │ cache + retry  │        │ logs every run   │
 └──────┬───────┘         └────────┬───────┘        └────────┬─────────┘
        │                          │                         │
        ▼                          ▼                         │
 ┌──────────────┐         ┌────────────────┐                 │
 │configManager │         │ persistence    │                 │
 │ load/save/   │         │ CSV/JSON, best │                 │
 │ validate/    │◀───────▶│ prices, trends │                 │
 │ display      │         └────────┬───────┘                 │
 └──────┬───────┘                  │                         │
        │                          ▼                         │
        ▼              ┌─────────────────────┐               ▼
   config.json         │ results_*.csv/json, │     logs/scheduler.log
                       │ best_prices.json    │     logs/output.log
                       └─────────────────────┘     logs/error.log
```

`reportGenerator` (not pictured) exports the shared CSV writer
(`toCsv`, `csvEscape`) consumed by both `persistence` and the legacy
`runSearch` path.

## Modules

### `index.js` — CLI entry

Four flags, one job each.

| Flag | Behavior |
|---|---|
| `--setup` | Calls `runSetup()` → walks the 5 input prompts → `ConfigManager.save()` |
| `--search` | Calls `runSearch()` → reads config → `FlightSearcher.searchAllCombinations` → `writeReport` + console deals |
| `--daemon` | Loads config → starts `Scheduler` against `runSearch` → installs SIGTERM/SIGINT → never resolves (PM2 entry) |
| `--help` | Prints usage and exits |

### `lib/inputModule.js` — interactive setup

`InputModule` class. IO is injectable (`new InputModule({ io })`) so tests
drive the prompts without stdin.

| Method | Constraints |
|---|---|
| `getDestinations()` | 1–10 unicode-aware city names |
| `getStayOptions()` | exactly 2 distinct integers in 1–365 |
| `getDepartureAirports()` | 1–5 IATA codes or city names → 39-city dictionary picker |
| `getTravelMonths()` | exactly 5 of 12, returned sorted |
| `getPriceThresholds()` | `{ alert, veryGood }`, both ≥ $50, `alert ≥ veryGood` |

Each prompts inline, validates, re-asks on error, shows a numbered
confirmation, and recurses on rejected confirm. `runSetup` chains all
five through `ConfigManager.save`.

### `lib/configManager.js` — config persistence + validation

`ConfigManager` class with five static methods:

- `load()` — read `./config.json`, merge with defaults, or return defaults if missing
- `save(config)` — write merged config
- `reset()` — `save(defaults())`
- `validate(config)` — `{ ok, errors[] }`; enforces every constraint from
  the spec
- `display(config)` — human-readable string

`config.json` is gitignored. The schema is described in
[BLUEPRINT.md](BLUEPRINT.md).

### `lib/flightSearcher.js` — provider + mock

`FlightSearcher` class with injectable side effects (`fetchImpl`,
`sleep`, `now`, `rng`, `logger`).

| Static | |
|---|---|
| `formatDate` | YYYY-MM-DD |
| `generateFlightURL` | Google Flights query URL |
| `getDateRangesForMonth(y, m, days)` | sliding windows that fit the month |

| Instance | |
|---|---|
| `scrapeGoogleFlights(...)` | Cache → rate-limit → Kiwi → mock fallback. 24h TTL, 2s gap, 3-try exponential backoff. |
| `searchAllCombinations(config, {onProgress, year})` | Cartesian product over `airports × destinations × stays × months × ranges`. Returns `{ results, errors }`. |
| `findBestDeals(results, limit=10)` | Sort ascending by price, slice N |
| `groupByDestination(results)` | Bucket by `destination` |

The Kiwi path lives behind `apiKey && provider === 'kiwi' && fetchImpl`.
Anything else → mock. Any Kiwi failure → mock + a log line. So the
pipeline works offline and in CI with no special handling.

### `lib/persistence.js` — disk I/O for results

Five exports plus a small CSV parser.

| Function | Output |
|---|---|
| `saveResultsToCSV(results, filename?, opts)` | `results_YYYY-MM-DD.csv` with the 12-column spec schema; computes `price_per_day` |
| `saveResultsToJSON(results, filename?, opts)` | `results_YYYY-MM-DD.json` with `{ savedAt, date, count, results }` envelope |
| `loadHistoricalResults(days=30, opts)` | Globs `results_*.csv` in `opts.dir`, filters by age, parses each, returns oldest→newest |
| `updateBestPrices(results, opts)` | `best_prices.json` keyed `JFK-Paris`; only overwrites on strictly lower price |
| `calculatePriceTrends(destination, days, opts)` | `{ min, max, avg, samples, trend: up\|down\|stable\|unknown }`; trend uses halved-window comparison with 5% deadband |

Everything takes `opts.dir` (or `outDir`) so tests use tmp dirs — no
chdir hacks. The CSV parser handles quoted fields, embedded commas, and
escaped double quotes.

### `lib/scheduler.js` — daily job runner

`Scheduler` class on top of `node-cron`. Five methods per spec:

| Method | |
|---|---|
| `constructor(config, opts?)` | Reads `scheduledTime` (HH:MM) and `timezone`. `opts` inject `cronImpl`, `logDir`, `now`, `fsImpl`. |
| `start(callback)` | Schedules daily. Wraps callback so errors are logged but never thrown out of the cron tick. |
| `stop(jobRef?)` | Stops the active task. |
| `getStatus()` | `{ running, cronExpression, timezone, lastRunAt, lastError, nextRunAt }` |
| `manualRun(callback)` | Fire immediately, log, rethrow on failure. |

`scheduledTimeToCron('HH:MM')` → `'M H * * *'` with `DEFAULT_CRON`
fallback on garbage input. All runs append a line to
`logs/scheduler.log`.

### `lib/reportGenerator.js` — shared CSV writer

Holdover from Phase 0; now serves as the shared CSV utility for both the
legacy `writeReport` path and the new `persistence` module.

| Export | |
|---|---|
| `toCsv(rows, header=HEADER)` | Generic CSV serializer; parameterized header |
| `csvEscape(value)` | Quote/escape rules for one cell |
| `writeReport(rows, opts)` | Convenience: writes `results_YYYY-MM-DD.csv` with the legacy 8-column header (kept for back-compat with `flightSearcher.runSearch`) |
| `HEADER` | The legacy 8-column header |

The 12-column "spec" header lives in `lib/persistence.js`. They differ
because `persistence` was specified later and adds `price_per_day` and
date_checked/stay_days columns.

## Data flow per `--search` run

1. `index.js` parses `--search`.
2. `ConfigManager.load()` reads `./config.json` (merged with defaults).
3. `FlightSearcher.runSearch()` builds combos =
   `departureAirports × destinations × stayOptions × travelMonths`, then
   for each month expands to all stay-length-windowed `[outDate,
   returnDate]` pairs.
4. For each combo, `scrapeGoogleFlights` either hits Kiwi or generates
   deterministic mock data; both return the same `{departure,
   destination, price, airline, duration, stops, url}` shape.
5. Results are normalized, written to `results_YYYY-MM-DD.csv` via the
   legacy 8-column writer, and the top 5 are printed.

## Data flow per `--daemon` run

1. `index.js` parses `--daemon`.
2. `ConfigManager.load()` reads config.
3. `new Scheduler(config).start(runSearch)` registers a daily cron tick.
4. Process stays alive on an unresolving promise; node-cron's internal
   timer keeps the event loop busy.
5. SIGTERM/SIGINT trigger `scheduler.stop()` and `process.exit(0)`.
6. Every run logs to `logs/scheduler.log` (start, complete-with-duration,
   error) regardless of `runSearch` outcome.

## Filesystem footprint

| Path | Gitignored | Owner | Lifecycle |
|---|---|---|---|
| `config.json` | yes | `ConfigManager` | Persists user prefs |
| `results_YYYY-MM-DD.csv` | yes | `persistence` + legacy writer | One per day; consider pruning >90d |
| `results_YYYY-MM-DD.json` | yes | `persistence` | Optional alongside CSV |
| `best_prices.json` | yes | `persistence` | Single file, monotonically lowest |
| `logs/scheduler.log` | yes | `Scheduler` | Append-only; rotate yourself |
| `logs/output.log` | yes | PM2 | Captures `index.js --daemon` stdout |
| `logs/error.log` | yes | PM2 | Captures `index.js --daemon` stderr |
| `.env` | yes | manual | `FLIGHT_API_KEY`, `FLIGHT_PROVIDER` |

## Dependency budget

| Package | Used for | Why |
|---|---|---|
| `node-cron` | Daily scheduling | Smallest mature cron lib; spec called for it |
| (none else at runtime) | | All other I/O is `node:` builtins |

Dev deps: none. Tests use `node:test` and `node:assert`.

## Non-goals (architecture)

- **Plugin system.** No dynamic provider/notifier loading. Add a new
  provider by editing `flightSearcher.js`.
- **External persistence.** No SQLite/Postgres/Redis. Plain files only.
- **Microservices / IPC.** Single process. PM2 supervises one instance.

## Test architecture

- `node:test` runner, no Jest/Vitest.
- Each test file runs serially within itself, in parallel across files.
- All I/O is injectable: `fetchImpl`, `sleep`, `now`, `rng`, `logger`,
  `cronImpl`, `fsImpl`. No tests touch the real network, real time, real
  cron, or the project's working directory.
- Filesystem tests use `fs.mkdtemp` and clean up; no `chdir` hacks except
  in `tests/config.test.js` which intentionally tests cwd-relative
  behavior of `ConfigManager` paths.
