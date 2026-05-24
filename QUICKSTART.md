# QUICKSTART

Get from zero to your first price report in under a minute.

## 1. Install

```bash
git clone https://github.com/srab2001/travel-deal-finder.git
cd travel-deal-finder
npm install
```

## 2. Configure

```bash
cp .env.example .env   # (created in Phase 1)
# edit .env and paste your flight API key
npm run setup          # walks you through origins, destinations, cabin class, date windows
```

Setup writes `config.json` (gitignored) with your search preferences.

## 3. Run a one-shot search

```bash
npm run search
```

Output:
- `results_YYYY-MM-DD.csv` — full price snapshot
- Top 5 deals printed to the console

## 4. Schedule it (optional)

Cron — every morning at 7am:

```cron
0 7 * * *  cd ~/github/travel-deal-finder && /usr/local/bin/node index.js --search >> daily.log 2>&1
```

GitHub Actions — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the workflow template.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `command not found: node` | Install Node 16+ from nodejs.org |
| `Missing API key` | Confirm `.env` exists and the key is set |
| Empty CSV | API rate limit hit — wait 10 min, or check API_INTEGRATION.md |
| `EACCES` on cron | Use an absolute path to `node` in the crontab |
