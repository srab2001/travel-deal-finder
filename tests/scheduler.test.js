const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  Scheduler,
  scheduledTimeToCron,
  DEFAULT_CRON,
  LOG_FILE,
} = require('../lib/scheduler');

function fakeCron() {
  const scheduled = [];
  return {
    scheduled,
    validate: (_expr) => true,
    schedule(expr, fn, opts) {
      const job = { expr, fn, opts, stopped: false, stop() { this.stopped = true; } };
      scheduled.push(job);
      return job;
    },
  };
}

async function withTmpLogDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdf-sched-'));
  try {
    await fn(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

test('scheduledTimeToCron converts HH:MM to minute hour * * *', () => {
  assert.equal(scheduledTimeToCron('08:00'), '0 8 * * *');
  assert.equal(scheduledTimeToCron('14:30'), '30 14 * * *');
  assert.equal(scheduledTimeToCron('0:05'), '5 0 * * *');
});

test('scheduledTimeToCron falls back to DEFAULT_CRON on garbage input', () => {
  for (const bad of ['8am', '25:00', '08:60', '', null, undefined, 'foo']) {
    assert.equal(scheduledTimeToCron(bad), DEFAULT_CRON);
  }
});

test('Scheduler.start registers a job and writes a log line', async () => {
  await withTmpLogDir(async (tmp) => {
    const cronImpl = fakeCron();
    const s = new Scheduler({ scheduledTime: '08:00', timezone: 'UTC' }, { cronImpl, logDir: tmp });
    const job = await s.start(() => {});
    assert.equal(cronImpl.scheduled.length, 1);
    assert.equal(cronImpl.scheduled[0].expr, '0 8 * * *');
    assert.equal(cronImpl.scheduled[0].opts.timezone, 'UTC');
    assert.equal(s.task, job);
    const log = await fs.readFile(path.join(tmp, LOG_FILE), 'utf8');
    assert.match(log, /scheduler started/);
  });
});

test('Scheduler.start refuses double-start', async () => {
  await withTmpLogDir(async (tmp) => {
    const s = new Scheduler({}, { cronImpl: fakeCron(), logDir: tmp });
    await s.start(() => {});
    await assert.rejects(() => s.start(() => {}), /already started/);
  });
});

test('the wrapped job logs start + completion and updates lastRunAt', async () => {
  await withTmpLogDir(async (tmp) => {
    const cronImpl = fakeCron();
    let ticker = new Date('2026-06-01T08:00:00Z').getTime();
    const now = () => new Date(ticker);
    const s = new Scheduler({}, { cronImpl, logDir: tmp, now });
    let ran = 0;
    await s.start(async () => { ticker += 50; ran++; });
    await cronImpl.scheduled[0].fn();
    assert.equal(ran, 1);
    const log = await fs.readFile(path.join(tmp, LOG_FILE), 'utf8');
    assert.match(log, /job started/);
    assert.match(log, /job completed in 50ms/);
    assert.equal(s.lastError, null);
    assert.ok(s.lastRunAt instanceof Date);
  });
});

test('the wrapped job records errors and does not throw out of the cron', async () => {
  await withTmpLogDir(async (tmp) => {
    const cronImpl = fakeCron();
    const s = new Scheduler({}, { cronImpl, logDir: tmp });
    await s.start(async () => { throw new Error('boom'); });
    await cronImpl.scheduled[0].fn();
    const log = await fs.readFile(path.join(tmp, LOG_FILE), 'utf8');
    assert.match(log, /job error: boom/);
    assert.equal(s.lastError, 'boom');
  });
});

test('Scheduler.stop calls .stop on the job and clears task', async () => {
  await withTmpLogDir(async (tmp) => {
    const cronImpl = fakeCron();
    const s = new Scheduler({}, { cronImpl, logDir: tmp });
    const job = await s.start(() => {});
    assert.equal(s.stop(), true);
    assert.equal(job.stopped, true);
    assert.equal(s.task, null);
  });
});

test('Scheduler.stop is a no-op when nothing scheduled', () => {
  const s = new Scheduler({}, { cronImpl: fakeCron() });
  assert.equal(s.stop(), false);
});

test('Scheduler.getStatus reports cron, tz, and next-run estimate', async () => {
  await withTmpLogDir(async (tmp) => {
    const cronImpl = fakeCron();
    const now = () => new Date('2026-06-01T07:00:00Z');
    const s = new Scheduler({ scheduledTime: '08:00', timezone: 'UTC' }, { cronImpl, logDir: tmp, now });
    assert.equal(s.getStatus().running, false);
    await s.start(() => {});
    const status = s.getStatus();
    assert.equal(status.running, true);
    assert.equal(status.cronExpression, '0 8 * * *');
    assert.equal(status.timezone, 'UTC');
    assert.ok(status.nextRunAt);
    assert.equal(s.getStatus().lastRunAt, null);
  });
});

test('Scheduler.manualRun executes immediately and logs', async () => {
  await withTmpLogDir(async (tmp) => {
    const s = new Scheduler({}, { cronImpl: fakeCron(), logDir: tmp });
    const result = await s.manualRun(async () => 'ok');
    assert.equal(result, 'ok');
    const log = await fs.readFile(path.join(tmp, LOG_FILE), 'utf8');
    assert.match(log, /manual run started/);
    assert.match(log, /manual run completed/);
  });
});

test('Scheduler.manualRun rethrows errors but still logs them', async () => {
  await withTmpLogDir(async (tmp) => {
    const s = new Scheduler({}, { cronImpl: fakeCron(), logDir: tmp });
    await assert.rejects(() => s.manualRun(async () => { throw new Error('nope'); }), /nope/);
    const log = await fs.readFile(path.join(tmp, LOG_FILE), 'utf8');
    assert.match(log, /manual run error: nope/);
    assert.equal(s.lastError, 'nope');
  });
});

test('Scheduler.start rejects non-function callbacks', async () => {
  const s = new Scheduler({}, { cronImpl: fakeCron() });
  await assert.rejects(() => s.start(null), /TypeError|callback/);
});
