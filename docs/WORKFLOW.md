# GitHub Workflow (Prompt 0C)

Day-to-day branching, committing, reviewing, and releasing.

## Branch strategy

| Branch | Purpose | Protected? |
|---|---|---|
| `main` | Production-ready, tagged for releases | yes |
| `develop` | Integration branch — features land here first | yes (lighter) |
| `feature/*` | New features (e.g. `feature/email-alerts`) | no |
| `bugfix/*` | Bug fixes (e.g. `bugfix/csv-comma-escape`) | no |
| `hotfix/*` | Emergency fixes branched from `main` | no |

## Day-to-day workflow

```bash
# 1. Start fresh
git checkout develop
git pull origin develop

# 2. Branch
git checkout -b feature/email-alerts

# 3. Work, commit often
git add lib/notifier.js tests/notifier.test.js
git commit -m "feat: add SMTP email notifier"

# 4. Push and open a PR
git push -u origin feature/email-alerts
# Open PR against `develop` on github.com

# 5. After review + green CI, squash-merge to develop
# 6. Periodically promote develop → main with a tagged release
```

## Commit message convention

[Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When |
|---|---|
| `feat:` | New user-visible capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Tests only |
| `refactor:` | Internal rework, no behavior change |
| `style:` | Formatting / whitespace only |
| `chore:` | Tooling, deps, config |
| `perf:` | Performance improvement |

Examples:

- `feat: add Slack webhook notifier`
- `fix: handle destination names with commas in CSV output`
- `docs: document --offline flag in QUICKSTART`
- `chore: bump node target to 20 in CI`

Breaking change? Add `!` and a `BREAKING CHANGE:` footer:

```
feat!: switch config format to YAML

BREAKING CHANGE: config.json is no longer read; migrate to config.yaml.
```

## PR template (suggested)

```markdown
## What
Brief description of the change.

## Why
Motivation — what problem this solves or what capability it adds.

## How tested
- `npm test` ✅
- Manual: ran `node index.js --search` against ... (or N/A)

## Checklist
- [ ] Tests added or updated
- [ ] Docs updated (README / QUICKSTART / docs/)
- [ ] No console.log / debug prints left
- [ ] No API keys or secrets in diff
- [ ] CHANGELOG.md updated (for user-facing changes)
```

Drop this in `.github/PULL_REQUEST_TEMPLATE.md` when you're ready.

## Code review checklist

- [ ] Does the change do what the PR title says, and nothing more?
- [ ] Failure modes handled (network, missing config, bad input)?
- [ ] No secrets, no `console.log` debug residue, no commented-out code?
- [ ] Tests cover the happy path **and** at least one edge case?
- [ ] Public API change? Docs + CHANGELOG updated.

## Release process

```bash
git checkout main
git pull
git merge --no-ff develop -m "release: v0.2.0"
git tag -a v0.2.0 -m "v0.2.0 — email notifier"
git push origin main --tags
```

Then on github.com: Releases → Draft a new release → pick the tag → paste the
changelog section.

## CI

`.github/workflows/ci.yml` runs `npm test` on every push and PR. PRs must be
green before merging into `develop` or `main`.

## Collaboration

- **Issues** for bugs and feature requests. Label `bug`, `enhancement`,
  `good first issue`, `help wanted`.
- **Discussions** for open-ended questions.
- **External contributors** fork → branch → PR.
