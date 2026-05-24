# Scheduling

`Scheduler` (`lib/scheduler.js`) is an in-process daily runner backed by
[node-cron](https://www.npmjs.com/package/node-cron). It's the option for
running the searcher on your own laptop or a small VPS without bringing in
PM2/systemd. For production hosts, prefer [DEPLOYMENT.md](DEPLOYMENT.md).

## Quick start

```js
const { Scheduler } = require('./lib/scheduler');
const { ConfigManager } = require('./lib/configManager');
const { runSearch } = require('./lib/flightSearcher');

const config = await ConfigManager.load();
const scheduler = new Scheduler(config);

await scheduler.start(async () => {
  await runSearch();
});

// later, e.g. on SIGTERM
scheduler.stop();
```

That's it. The job fires daily at `config.scheduledTime` in
`config.timezone`. Every run is logged to `logs/scheduler.log`.

## Config inputs

| Field | Default | Notes |
|---|---|---|
| `scheduledTime` | `"08:00"` | `HH:MM` 24-hour. Anything garbage falls back to 08:00. |
| `timezone` | `"America/New_York"` | IANA name. Passed through to node-cron. |

## API

| Method | Returns | Description |
|---|---|---|
| `new Scheduler(config, opts?)` | — | `opts` lets you inject `cronImpl`, `logDir`, `now`, `fsImpl` for tests. |
| `start(callback)` | the cron `task` | Schedules the daily run. Errors thrown by `callback` are caught and logged, never propagated. |
| `stop(jobRef?)` | `boolean` | Stops the active job. No-op if nothing is running. |
| `getStatus()` | `{ running, cronExpression, timezone, lastRunAt, lastError, nextRunAt }` | Snapshot. `nextRunAt` is a simple "next occurrence of `HH:MM`" estimate. |
| `manualRun(callback)` | whatever `callback` returns | Run immediately, log it, and rethrow on failure. |

## Logs

Lines are written to `logs/scheduler.log` (gitignored). Format:

```
2026-05-24T15:00:00.000Z scheduler started cron='0 8 * * *' tz='America/New_York'
2026-05-25T12:00:00.000Z job started
2026-05-25T12:01:47.000Z job completed in 107000ms
2026-05-26T12:00:00.000Z job started
2026-05-26T12:00:00.500Z job error: Kiwi HTTP 500
```

Tail it: `tail -f logs/scheduler.log`.

## Cron expression details

`scheduledTime: "HH:MM"` is converted to `M H * * *` via
`scheduledTimeToCron()`. If you ever need a more complex schedule, you can
pass the cron string directly:

```js
const scheduler = new Scheduler(config);
scheduler.cronExpr = '0 8,20 * * 1-5'; // 8am and 8pm Mon-Fri
await scheduler.start(...);
```

This is intentionally not exposed via config — until there's a real
requirement, daily-at-HH:MM is the only shape we support officially.

## Caveats

- The scheduler runs **in-process**. If the Node process dies, so does the
  schedule. Use PM2 / systemd / GitHub Actions for crash-restart.
- `nextRunAt` is naive — it doesn't account for DST transitions. node-cron
  handles the actual firing correctly; the estimate is just for `getStatus()`.
- Log file is append-only. Rotate it yourself if you care
  (`logrotate /path/to/logs/scheduler.log` etc).
