# Deployment

`travel-deal-finder` is a single-user CLI. "Deployment" here means picking a
host to run it on a schedule.

## Option A — Local cron (zero infra)

```cron
# m  h  dom mon dow  command
  0  7  *   *   *    cd ~/github/travel-deal-finder && /usr/local/bin/node index.js --search >> daily.log 2>&1
```

Pros: free, private, runs while your machine is on.
Cons: misses days when laptop is asleep.

Tip: use absolute paths to both the project and the `node` binary — cron's
`PATH` is minimal.

## Option B — GitHub Actions (cloud cron, free for public repos)

`.github/workflows/daily-search.yml` (create when you reach Phase 2):

```yaml
name: Daily flight search
on:
  schedule:
    - cron: '0 14 * * *'   # 14:00 UTC = 07:00 PT
  workflow_dispatch:

jobs:
  search:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node index.js --search
        env:
          FLIGHT_API_KEY: ${{ secrets.FLIGHT_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: results-${{ github.run_id }}
          path: results_*.csv
```

Pros: always-on, free storage of CSV artifacts, easy to share.
Cons: API key lives in GitHub Secrets — fine for personal projects, audit if
you ever go multi-tenant.

## Option C — Lightweight VPS / Raspberry Pi

Same as Option A but on a host that's always on. Use `systemd` timers instead
of cron if you want better logging:

```ini
# /etc/systemd/system/tdf.service
[Service]
Type=oneshot
WorkingDirectory=/home/pi/travel-deal-finder
ExecStart=/usr/bin/node index.js --search
EnvironmentFile=/home/pi/travel-deal-finder/.env
```

```ini
# /etc/systemd/system/tdf.timer
[Timer]
OnCalendar=*-*-* 07:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

## Secrets

| Where | How |
|---|---|
| Local cron / VPS | `.env` file, mode 600, never committed |
| GitHub Actions | Repo Settings → Secrets and variables → Actions |
| Personal machine | macOS Keychain via `security add-generic-password`, then read in a wrapper script |

## Result retention

Daily CSVs accumulate. Either:

- prune older than 90 days with a cron line: `find . -name 'results_*.csv' -mtime +90 -delete`, or
- archive monthly into a single `history_YYYY-MM.csv` (Phase 2 task for `lib/historyStore.js`).
