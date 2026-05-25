# User Guide

Everything you need to use `travel-deal-finder` day-to-day. If you just
want the 60-second install, see [QUICKSTART.md](../QUICKSTART.md). For
deploying to a server, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Install

```bash
git clone https://github.com/srab2001/travel-deal-finder.git
cd travel-deal-finder
npm ci
```

Requirements: Node 18+. macOS, Linux, or WSL.

## 2. Get a flight API key (optional)

The tool works without one — it'll generate deterministic mock data so
you can exercise the whole pipeline. For real prices:

1. Sign up at https://tequila.kiwi.com (free tier, no credit card).
2. Create a "Solution" and copy the `apikey`.
3. `cp .env.example .env`, then paste:

   ```dotenv
   FLIGHT_PROVIDER=kiwi
   FLIGHT_API_KEY=tq_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

`.env` is gitignored. See [API_INTEGRATION.md](API_INTEGRATION.md) for
provider details, rate limits, and how to swap to another provider later.

## 3. Configure

```bash
node index.js --setup
```

Walks you through five prompts. Each one validates inputs and lets you
restart that section if you mistype.

### 3.1 Destinations

Up to 10 cities. Plain names ("Paris", "Tokyo"), unicode supported
("San José", "Côte d'Ivoire"). Empty line to finish early.

```
(1/10) Destination: Paris
  ✓ added "Paris"
(2/10) Destination: Tokyo
  ✓ added "Tokyo"
(3/10) Destination: [empty]

Destinations to search:
  1. Paris
  2. Tokyo

Proceed with these destinations? [Y/n]
```

### 3.2 Stay options

Exactly two distinct stay lengths in days (1–365). The searcher will
look for **both** lengths for each destination, so picking `4` and `10`
means it'll surface long weekends AND ~ 1.5-week trips.

```
Stay option 1 (number of days): 4
Stay option 2 (number of days): 10

  ✓ Stay options: 1. 4 days, 2. 10 days

Continue? [Y/n]
```

### 3.3 Departure airports

Up to 5 airports. Two ways to enter:

- **IATA code** — `JFK`, `LAX`, `SFO`. Case-insensitive, normalized to
  uppercase.
- **City name** — `new york`, `london`, `tokyo`. If the city has multiple
  airports, you'll get a numbered picker.

```
(1/5) Airport or city: new york
  new york has 3 airports:
    1. JFK
    2. LGA
    3. EWR
  Pick 1-3 (or blank to skip): 1
  ✓ added JFK
(2/5) Airport or city: sfo
  ✓ added SFO
(3/5) Airport or city: [empty]
```

The dictionary covers 39 major cities globally. Unknown city → re-prompt
with a hint to use IATA codes.

### 3.4 Travel months

Pick exactly 5 of 12. The searcher will look at every relevant date
range in those months. You can't over-select (it stops asking at 5).

```
— Travel months —
Pick exactly 5 months you're willing to travel.

  [ ]  1. January     [ ]  2. February    [ ]  3. March      [ ]  4. April
  [ ]  5. May         [ ]  6. June        [ ]  7. July       [ ]  8. August
  [ ]  9. September   [ ] 10. October     [ ] 11. November   [ ] 12. December

(1/5) Month number (1-12): 6
  ✓ June
(2/5) Month number (1-12): 7
  ✓ July
...
```

### 3.5 Price thresholds

Two dollar amounts, both ≥ $50, with `alert ≥ veryGood`.

- **alert** — what counts as "watch this" (e.g. $500). Anything below
  shows up in the top-deals output.
- **veryGood** — what counts as exceptional (e.g. $400). These get
  flagged separately in the future notifier (Phase 5).

```
Alert threshold (flights under this price): $500
Very good deal threshold: $400

  ✓ Alert below $500, very good deal below $400

Continue? [Y/n]
```

Setup writes `config.json` (gitignored) at the project root.

## 4. Run a one-shot search

```bash
node index.js --search
```

You'll see:

```
Searching... | 48/48
Searched 48 combinations (0 errors).

Top deals:
  1. $212 United — JFK→Paris 2026-06-26 (2h 30m, 2 stops)
  2. $216 American — JFK→Paris 2026-06-16 (13h 44m, 1 stops)
  3. $234 JetBlue — JFK→Paris 2026-06-08 (4h 49m, 0 stops)
  4. $248 Spirit — JFK→Paris 2026-06-22 (13h 52m, 0 stops)
  5. $264 Delta — JFK→Paris 2026-06-12 (8h 02m, 1 stops)
```

And on disk: `results_YYYY-MM-DD.csv` (one row per
airport×destination×date-range combo).

### How many calls is that?

For a typical configuration (3 airports × 5 destinations × 2 stays ×
5 months × ~25 date windows), that's ~3,750 calls. With the default 2s
rate limit between distinct calls, ~125 minutes (well within Kiwi's free
tier daily limit).

To tune:

- Narrow `travelMonths`, `destinations`, or `departureAirports`.
- Reduce `stayOptions` to one length (currently can't — two are required;
  this is a v0.2 candidate).
- Cache means re-running the same day costs nothing.

## 5. Schedule it (daily)

Three options.

### 5a. Local cron (laptop)

```cron
0 7 * * *  cd ~/github/travel-deal-finder && /usr/local/bin/node index.js --search >> daily.log 2>&1
```

Use absolute paths to `node` and the project — cron's `PATH` is empty.

### 5b. Built-in scheduler

```bash
node index.js --daemon
```

Loads config, starts the in-process daily scheduler (configured via
`scheduledTime` and `timezone` in `config.json`), and stays in the
foreground. Ctrl-C or SIGTERM stops it cleanly.

Output:

```
Daemon started. Next run: 2026-05-25T12:00:00.000Z (America/New_York).
Logs: logs/scheduler.log. SIGTERM/SIGINT for graceful shutdown.
```

Use with `nohup`/`tmux`/`screen` if you want to detach the terminal — or
use PM2 (next).

### 5c. PM2 (recommended for VPS/Pi)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup    # survive reboots
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full host setup walkthrough,
plus a GitHub Actions option if you don't want a server at all.

## 6. Read the results

### Daily CSV — `results_YYYY-MM-DD.csv`

12 columns per the persistence spec:

```
date_checked, departure, destination, outbound_date, return_date,
stay_days, price_usd, price_per_day, airline, stops, duration, url
```

Open in any spreadsheet, or query with `awk`/`csvkit`/`q`.

### Best prices — `best_prices.json`

A single rolling record of the lowest price ever seen per route:

```json
{
  "JFK-Paris": {
    "price": 245,
    "airline": "United",
    "date": "2026-06-15",
    "departDate": "2026-08-12",
    "returnDate": "2026-08-22"
  },
  "JFK-Tokyo": { ... }
}
```

Programmatic access:

```js
const { updateBestPrices, calculatePriceTrends } = require('./lib/persistence');

const best = JSON.parse(await fs.readFile('best_prices.json', 'utf8'));
console.log(best['JFK-Paris']);

const trend = await calculatePriceTrends('Paris', 30);
// { destination: 'Paris', samples: 12, min: 245, max: 612, avg: 384, trend: 'down' }
```

## 7. Reconfigure

Just re-run setup — it overwrites the relevant sections:

```bash
node index.js --setup
```

Or edit `config.json` directly, then verify the shape:

```bash
node index.js --validate       # exit 0 on success, 1 with errors listed
node index.js --display        # pretty-print the merged config
```

`--validate` is also a handy pre-flight in a cron entry — if your config
file gets corrupted, the next `--search` will exit non-zero rather than
silently producing nothing.

## 8. Common questions

**"Can I search one-way?"**
Not yet. Round-trips only. v1.0 target.

**"Can I save multiple configs (work vs personal)?"**
Not directly — but `config.json` is a plain file, so symlink or rename
between runs.

**"Does it support business class?"**
Cabin class was in the Phase 0 default config but got removed in the
3a refactor because no UI surfaces it yet. Bring back when needed.

**"Will this get me banned by Kiwi?"**
Unlikely on the free tier with the default 2s rate limit, especially
since the 24h cache means repeated daily runs against the same routes
don't actually re-query. If you scale beyond a few thousand calls per
day, read Kiwi's T&Cs.

**"Where do I report bugs?"**
GitHub Issues on https://github.com/srab2001/travel-deal-finder.

## 9. What's next

- **Trend tooling.** v0.2 will add `--trends DEST` and a small ASCII
  chart.
- **Notifications.** v0.2 will email/Slack you when a result drops below
  `priceThresholds.veryGood`.
- **Rollup.** v0.2 will fold old daily CSVs into monthly archives so
  the directory doesn't grow forever.

Watch [BLUEPRINT.md](BLUEPRINT.md) for the roadmap.
