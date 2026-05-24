# Blueprint

The product, scope, and where it's going.

## One-liner

`travel-deal-finder` runs a daily price check across the airports and
destinations you care about, records every result, and tells you when a
deal drops below your threshold.

## What it is

A self-hosted, single-user CLI tool. You configure it once, schedule it
once (cron, PM2, or GitHub Actions), and walk away. Daily it queries a
flight pricing API, persists the snapshot to disk, and surfaces the best
deals it found.

## What it isn't

- **Not a SaaS.** Your config and history live on your machine. No accounts.
- **Not a booking tool.** It surfaces prices; you book on the airline site.
- **Not real-time.** Daily granularity is enough for trip planning and
  keeps API quota usage modest.
- **Not multi-tenant.** Single user, single config file.

## Why it exists

Existing tools (Google Flights price alerts, Hopper, Kayak alerts) all
require giving them your search forever, and they decide what counts as a
"good deal." This tool inverts that: you own the data, you set the
thresholds, you keep the history. Trends across months of price snapshots
are more useful than any single alert.

## Target user

- Comfortable in a terminal.
- Wants to monitor 1–5 origin airports against 1–10 destinations.
- Searches a couple of stay lengths across a few months of travel
  flexibility.
- Has a Node 18+ host (laptop, VPS, Pi) that's mostly always on, or a
  GitHub account for the Actions option.

## Architecture in one paragraph

A pipeline of six small modules — `inputModule` collects user prefs,
`configManager` owns persistence + validation, `flightSearcher` queries
the provider (Kiwi today, mock fallback), `reportGenerator` and
`persistence` write CSVs/JSON and roll up best prices and trends, and
`scheduler` runs it daily via node-cron. The CLI (`index.js`) wires them
together via three flags: `--setup`, `--search`, `--daemon`. See
[ARCHITECTURE.md](ARCHITECTURE.md) for module-by-module detail.

## Roadmap

### Shipped — v0.1.0 (2026-05-24)

- Interactive setup, validation, daily search, CSV/JSON output, best-price
  tracking, trend analysis, daily scheduler, PM2 deployment, Kiwi.com API.

### Near-term — v0.2.x

- **Notifications (Phase 5).** Email or Slack webhook fires when a result
  drops below `priceThresholds.alert` or `veryGood`. Adds `lib/notifier.js`.
- **`--validate` CLI flag.** Run `ConfigManager.validate` against the
  current config and exit with status. Useful in CI / pre-cron hook.
- **Result rollup.** A `--rollup` flag (or automatic monthly job) folds
  N daily CSVs into one `history_YYYY-MM.csv` and prunes the dailies.

### Mid-term — v0.3.x

- **Multiple providers.** Plug in Amadeus and/or Duffel behind the same
  `FlightSearcher._queryXxx()` interface. `FLIGHT_PROVIDER` env switches.
- **`config.json` migrations.** Schema versioning + automatic upgrade so
  future schema changes don't require manual fixups.
- **Better trend output.** Per-route min/max/avg charts (ASCII or a small
  HTML report), week-over-week deltas.

### Speculative — v1.0+

- **One-way trip support.** Drop the `returnDate` requirement everywhere.
- **Multi-passenger pricing.** Currently single adult; add adult/child
  counts to config.
- **Cabin class.** Was in Phase 0 default config, removed in Phase 3a; bring
  back when there's an actual UI to set it.
- **A `--web` mode.** Tiny localhost dashboard rendering best prices,
  trends, and the daily diff. Read-only, no auth.

## Non-goals (will not build)

- **Booking integration.** Out of scope; airlines/agents own that
  workflow.
- **Loyalty/miles optimization.** Different problem with different data.
- **Cross-user comparison or social sharing.** Single-user by design.
- **Mobile app.** A self-hosted CLI doesn't need one.

## Constraints

- **Single Node.js process.** No external DB, no message queue, no Redis.
  Everything is files + node-cron. Keeps deployment to "scp + pm2 start."
- **Minimal deps.** One runtime dep (`node-cron`); the rest is built-in.
  Adding a dep requires a real reason.
- **API quota awareness.** A naive run is `airports × destinations ×
  stays × months × ~25 windows` calls. Cache aggressively (24h default),
  rate-limit by default, and document tuning in
  [API_INTEGRATION.md](API_INTEGRATION.md).

## Success criteria

You can:

1. `git clone`, `npm ci`, `node index.js --setup` in <5 minutes.
2. See real prices for your routes via `--search` in <10 minutes
   (assuming you got a Kiwi key).
3. Leave it running via PM2 and forget about it for a month, then look at
   `best_prices.json` and `calculatePriceTrends()` output to inform a
   booking decision.

If any of those breaks, that's a v0.1.x bug, not a v0.2 feature.
