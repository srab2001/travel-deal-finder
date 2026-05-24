# PROMPTS

Archive of the prompts used to scaffold and extend this project, kept so future
agents (Claude or otherwise) can pick up where a previous session left off.

## Phase 0 — Project bootstrap

- **0A** GitHub repository setup → see [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md)
- **0B** Clone repository locally → see [docs/CLONE_GUIDE.md](docs/CLONE_GUIDE.md)
- **0C** GitHub workflow integration → see [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Phase 1 — Core implementation (next)

Stub modules in `lib/` are intentionally empty so each can be implemented in
isolation. Suggested order:

1. **`configManager.js`** — JSON read/write, schema validation, default values.
2. **`inputModule.js`** — interactive prompts (use `node:readline/promises`,
   no extra deps).
3. **`flightSearcher.js`** — provider client + retry/backoff. Decide on
   provider (Kiwi, Amadeus, Skyscanner partner) first; see
   [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md).
4. **`reportGenerator.js`** — CSV writer + top-N console formatter.
5. **`index.js`** — wire the four modules behind `--setup` / `--search` flags.

Each step gets a matching test file in `tests/`.

## Phase 2 — Scheduling & notifications

- `lib/scheduler.js` — cron-style trigger (or thin wrapper over GitHub Actions).
- Email / Slack / push alerts when a price drops below a configurable threshold.

## Convention for adding a new prompt

When you ask an agent to extend the project, drop the prompt here under a new
heading and link to the resulting code/docs. That way the PROMPTS log mirrors
the commit history and is replayable.
