# Lessons Learned — v0.1.0 Build-Out

Honest retrospective on building `travel-deal-finder` from scaffold to
v0.1.0 across 7 PRs in a single session. Written for the next person (or
future me) who picks this up.

## What went well

### 1. Injectable I/O paid for itself immediately

Every module that does I/O accepts an `opts` bag for substituting it:
`fetchImpl`, `sleep`, `now`, `rng`, `logger`, `cronImpl`, `fsImpl`. The
upfront cost was ~5 lines per module; the payoff is:

- 91 tests run in <100ms — no real timers, no network, no clock-dependent
  flake.
- The Kiwi fallback path is testable without an API key (`fetchImpl`
  returns a stub response).
- The scheduler tests work without scheduling real cron jobs.

**Takeaway:** when a module's behavior is "do this side effect on a
schedule," accept the schedule and the side effect as constructor args.
Don't lazy-import `Date.now` or call `setTimeout` directly.

### 2. Phase-level PRs over per-prompt PRs

The original plan was one PR per prompt (12 PRs). Prompt 6 said
"combine with other input methods before merging," which forced a
rethink. Switching to phase-level PRs (6 instead of 12) was an obvious
win:

- Reviewer sees "the whole input system" in one PR, not five.
- Inter-prompt rebases vanish (each phase's prompts touch overlapping
  code).
- The PR description gets to explain how the prompts fit together.

**Takeaway:** the right PR size is "one coherent feature," not "one
spec line." When prompts share a file, combine.

### 3. Mock-first, real-API-second

`FlightSearcher` always returns a result. If `FLIGHT_API_KEY` is unset
or Kiwi 500s or the network's down, it generates deterministic mock data
hashed from `(departure, destination, outDate)`. This means:

- New contributors can run the whole pipeline in <5 minutes with no
  signups.
- CI exercises the full flow without secrets.
- A bad API key never breaks a production run — it just falls back.
- The mock prices are stable across runs (hash-seeded), so the "top
  deals" output is reproducible for screenshots and docs.

**Takeaway:** for any external dependency, ship a believable fallback.
"It worked locally" should never depend on credentials.

### 4. CI on Node 18 + 20 matrix from day one

Phase 0 set up the matrix before there was anything to test. By PR #2
the matrix was already catching nothing — and that's the point. Adding
it later is annoying; adding it first is free.

### 5. Deterministic mock data made the smoke test trivial

Final smoke test was: write a config, run `--search`, see real-looking
output. The mock generator produced varied airlines and durations
because the SHA-1 of the route bytes is varied. Zero special test
infrastructure.

## Judgment calls (deviations from the spec)

Both were called out in commit messages and the [CHANGELOG](../CHANGELOG.md).

### "Use csv-writer library" (Prompt 10) → in-tree writer

The spec said use `csv-writer`. We already had a working CSV writer in
`reportGenerator.js`. Adding the dep for an identical feature felt
gratuitous; instead, exported `csvEscape` from the existing module and
parameterized `toCsv(rows, header)` so `persistence` could supply its
own 12-column header.

**If this turns out to be wrong:** swap to `csv-writer` is a 20-line
change — `saveResultsToCSV` and `loadHistoricalResults` are the only
callers and both go through a single header constant.

### "Script: index.js" + scheduler entry (Prompt 12) → `--daemon` flag

The PM2 spec implied either two entry scripts or an awkward
double-purpose `index.js`. Chose: keep one CLI, add `--daemon` mode,
have PM2 pass `args: '--daemon'`. Cleaner than two scripts; the rest
of the spec (memory limits, restart policy, logs) is verbatim.

## What I'd do differently next time

### 1. Decide on the schema once

The `origins` → `departureAirports` rename in Phase 3a (Prompt 7) was
forced by the new spec. Three modules and a test file had to change to
follow. If Prompt 7 had landed first (or Prompt 2 had used the eventual
field name), the rename PR could have been skipped.

**Action for v0.2:** lock the `config.json` schema in a single source
(`lib/configManager.js`'s `DEFAULT_CONFIG`) and treat changes to it as
breaking-change PRs.

### 2. Don't have two CSV headers

`reportGenerator.HEADER` (8 columns) and `persistence.CSV_HEADER`
(12 columns) both exist because they were specified at different times.
The legacy `runSearch` path still writes the 8-column version; the new
`saveResultsToCSV` writes the 12-column version. A future PR should
unify on the 12-column header.

### 3. Build `--validate` and `--display` CLI flags upfront

`ConfigManager.validate` and `ConfigManager.display` exist as public
methods but aren't surfaced anywhere in the CLI. Should have wired
`--validate` and `--config` flags during Phase 3a — it would have made
the smoke test trivial (no need to write an inline `node -e`).

### 4. Pick a release tagging discipline early

We landed 7 PRs without tagging anything. The first tag is going to be
v0.1.0 covering everything; future PRs should release incrementally so
the changelog stays meaningful. Conventional Commits + semantic-release
would automate this — defer to v0.2 unless the project grows.

### 5. Smoke test earlier and more often

The end-to-end smoke test ran exactly once, at the end. Worked first
try — but if it hadn't, debugging would have spanned 7 PRs of code.
A `--search` against a tiny test config should be a CI step, not
something to wire up at release time.

## Specific surprises

### `node --test tests/` doesn't auto-discover

Phase 0 used `node --test tests/` and it errored:
`Cannot find module 'tests'`. Node's `--test` wants explicit paths or a
glob, not a directory. Fix: `node --test tests/*.test.js`. Caught in the
first test run; minor, but worth knowing.

### node-cron major version differences

`node-cron@4` (current) and `node-cron@3` have different APIs for
`validate()` and the `schedule()` options object. Our fakeCron stub
papers over this in tests; production code uses the v4 API. If we ever
need to support v3, the stub needs to switch.

### IATA validation surprised me

The spec said "3-4 characters" but real IATA codes are exactly 3
letters; 4-letter codes are ICAO. We accept 3-4 to follow the spec
literally and uppercase whatever the user typed. No bug surfaced
because no IATA-4 codes exist in the dictionary; if someone enters one
manually, we accept it. Document this in `API_INTEGRATION.md` if it
ever becomes a problem.

### `_estimateNextRun` doesn't handle DST

`Scheduler.getStatus().nextRunAt` is a naive "next occurrence of
HH:MM today, else tomorrow" — it ignores `timezone` for the
calculation. node-cron itself fires at the right wall-clock time
respecting the timezone; only the *estimate* shown to humans drifts by
an hour twice a year. Acceptable for v0.1; revisit if anyone complains.

## Process notes

### Asking before doing saved time twice

- Asked about flight API choice (Kiwi vs Amadeus vs Skyscanner) before
  starting Prompt 9 — would have wasted hours implementing the wrong one.
- Asked about branch strategy when Prompt 6's "combine before merging"
  contradicted Prompt 2's "literal 4 branches" — locking that in saved
  3 wasted PRs.

**Pattern:** when a spec has a fork, ask. The 30 seconds to read a
question is cheaper than 30 minutes to redo work.

### Don't bother asking when the spec is unambiguous

The PR cadence (commit → push → CI → squash-merge → branch off updated
develop → repeat) was set once and then run silently for 6 PRs. No
question needed each time.

**Pattern:** confirm the workflow once at the start of a multi-PR
session. After that, just execute.

### Auto-merging after CI is the right default for a solo project

PR review by the author of every change is theater. CI on Node 18 + 20
caught what it was going to catch; nothing else would have surfaced via
review. For a shared repo this would be different.

## What this codebase still needs

Gap table as of v0.1.1 (the three "should fix soon" items closed in
v0.1.1: validation gate, `--validate`/`--display`, branch protection):

| Gap | Severity | Notes |
|---|---|---|
| Two CSV headers | low | Cosmetic until someone reads both files |
| `_estimateNextRun` ignores TZ for the estimate | low | Cron firing is correct, only the status string is off |
| No notifications | medium | The whole point of `priceThresholds.veryGood` is unrealized until v0.2 |
| No daily CSV rollup | medium | Disk will grow ~1MB/month at typical use; pruning script in docs but not automated |
| No tests for `index.js` argparse | low | Each path is small; integration test would catch regressions |
| No schema versioning | low | Future `config.json` changes will need manual upgrades |

Notifications is the biggest remaining gap and the headline v0.2 work.
