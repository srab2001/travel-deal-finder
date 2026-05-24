const fs = require('node:fs/promises');
const path = require('node:path');
const cron = require('node-cron');

const LOG_DIR = 'logs';
const LOG_FILE = 'scheduler.log';
const DEFAULT_CRON = '0 8 * * *';

function scheduledTimeToCron(timeHHMM) {
  if (typeof timeHHMM !== 'string') return DEFAULT_CRON;
  const m = timeHHMM.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT_CRON;
  const hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return DEFAULT_CRON;
  return `${minute} ${hour} * * *`;
}

class Scheduler {
  constructor(config = {}, {
    cronImpl = cron,
    logDir = LOG_DIR,
    now = () => new Date(),
    fsImpl = fs,
  } = {}) {
    this.config = config;
    this.cronImpl = cronImpl;
    this.logDir = logDir;
    this.now = now;
    this.fs = fsImpl;
    this.task = null;
    this.cronExpr = scheduledTimeToCron(config.scheduledTime || '08:00');
    this.timezone = config.timezone || 'America/New_York';
    this.lastRunAt = null;
    this.lastError = null;
  }

  async start(callback) {
    if (this.task) throw new Error('scheduler already started; call stop() first');
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (typeof this.cronImpl.validate === 'function' && !this.cronImpl.validate(this.cronExpr)) {
      throw new Error(`invalid cron expression: ${this.cronExpr}`);
    }
    const wrapped = async () => {
      const start = this.now();
      await this._log(`${start.toISOString()} job started`);
      try {
        await callback();
        const end = this.now();
        this.lastRunAt = end;
        this.lastError = null;
        await this._log(`${end.toISOString()} job completed in ${end - start}ms`);
      } catch (err) {
        this.lastError = err.message;
        await this._log(`${this.now().toISOString()} job error: ${err.message}`);
      }
    };
    this.task = this.cronImpl.schedule(this.cronExpr, wrapped, {
      timezone: this.timezone,
      scheduled: true,
    });
    await this._log(`${this.now().toISOString()} scheduler started cron='${this.cronExpr}' tz='${this.timezone}'`);
    return this.task;
  }

  stop(jobRef = this.task) {
    if (!jobRef) return false;
    if (typeof jobRef.stop === 'function') jobRef.stop();
    if (jobRef === this.task) this.task = null;
    return true;
  }

  getStatus() {
    return {
      running: this.task != null,
      cronExpression: this.cronExpr,
      timezone: this.timezone,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      lastError: this.lastError,
      nextRunAt: this._estimateNextRun(),
    };
  }

  async manualRun(callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const start = this.now();
    await this._log(`${start.toISOString()} manual run started`);
    try {
      const result = await callback();
      const end = this.now();
      this.lastRunAt = end;
      this.lastError = null;
      await this._log(`${end.toISOString()} manual run completed`);
      return result;
    } catch (err) {
      this.lastError = err.message;
      await this._log(`${this.now().toISOString()} manual run error: ${err.message}`);
      throw err;
    }
  }

  _estimateNextRun() {
    const parts = this.cronExpr.split(' ');
    if (parts.length !== 5) return null;
    const minute = Number.parseInt(parts[0], 10);
    const hour = Number.parseInt(parts[1], 10);
    if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
    const now = this.now();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  async _log(line) {
    await this.fs.mkdir(this.logDir, { recursive: true });
    await this.fs.appendFile(path.join(this.logDir, LOG_FILE), line + '\n');
  }
}

module.exports = { Scheduler, scheduledTimeToCron, DEFAULT_CRON, LOG_DIR, LOG_FILE };
