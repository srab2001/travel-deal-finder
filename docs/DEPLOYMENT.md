# Deployment

`travel-deal-finder` is a single-user tool. "Deployment" means picking a
host to run the daemon. Three supported paths, in order of complexity.

## Option A — Local cron (zero infra)

For "runs on my laptop when it's awake":

```cron
# m  h  dom mon dow  command
  0  7  *   *   *    cd ~/github/travel-deal-finder && /usr/local/bin/node index.js --search >> daily.log 2>&1
```

Pros: free, private, no process manager.
Cons: misses days when laptop is asleep.

Tip: use absolute paths to both the project and the `node` binary — cron's
`PATH` is minimal.

## Option B — PM2 (recommended for a small VPS / Pi / always-on box)

PM2 daemonizes the in-process scheduler so it survives crashes and reboots.

### One-time host setup

```bash
# 1. Install Node (matching what we develop on)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2 globally
sudo npm install -g pm2

# 3. Clone and install deps
git clone https://github.com/srab2001/travel-deal-finder.git ~/travel-deal-finder
cd ~/travel-deal-finder
npm ci

# 4. Configure
cp .env.example .env
$EDITOR .env                # paste FLIGHT_API_KEY
node index.js --setup       # interactive: destinations, airports, etc.
```

### Start the daemon

```bash
cd ~/travel-deal-finder
pm2 start ecosystem.config.js
```

This is wired to run `node index.js --daemon`, which boots the
`Scheduler` and stays in the foreground until PM2 sends SIGTERM.

### Useful PM2 commands

```bash
pm2 list                              # show all apps
pm2 logs travel-deal-finder           # tail combined logs
pm2 logs travel-deal-finder --err     # just stderr
pm2 stop travel-deal-finder           # stop, keep entry in PM2
pm2 restart travel-deal-finder        # bounce
pm2 delete travel-deal-finder         # remove entry entirely
pm2 monit                             # live CPU/mem dashboard
```

### Persist across reboots

```bash
pm2 save                              # snapshot current process list
pm2 startup                           # prints a sudo command — run it
# After reboot: PM2 auto-starts everything from `pm2 save`
```

### What `ecosystem.config.js` does

```js
{
  name: 'travel-deal-finder',
  script: './index.js',
  args: '--daemon',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_memory_restart: '512M',     // PM2 bounces it if RSS > 512MB
  kill_timeout: 5000,             // 5s SIGTERM → SIGKILL grace window
  error_file: './logs/error.log',
  out_file: './logs/output.log',
  merge_logs: true,
}
```

Logs live in `logs/`:

| File | Source |
|---|---|
| `logs/output.log` | PM2 captures of stdout from `index.js --daemon` |
| `logs/error.log` | PM2 captures of stderr |
| `logs/scheduler.log` | Written by `Scheduler` itself, one line per run |

All three are gitignored.

## Option C — GitHub Actions (cloud cron, no host)

If you don't want to maintain a server, run the search on a schedule in
GitHub Actions. Drop this in `.github/workflows/daily-search.yml`:

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
          path: |
            results_*.csv
            best_prices.json
```

Pros: always-on, free for public repos, easy to share artifacts.
Cons: API key lives in GitHub Secrets, results don't persist across runs
unless you commit them or push to an external store.

## Secrets

| Where | How |
|---|---|
| Local cron / VPS | `.env` file, mode 600, never committed |
| PM2 | Same `.env` file; `dotenv` is loaded by Node directly in Phase 5+, today by your shell |
| GitHub Actions | Repo Settings → Secrets and variables → Actions |
| macOS dev box | `security add-generic-password` + a wrapper that reads it |

## Result retention

Daily CSVs accumulate. Either:

- prune older than 90 days:
  `find . -name 'results_*.csv' -mtime +90 -delete`
- or roll up via `calculatePriceTrends()` and discard the dailies once
  archived (Phase 5+).
