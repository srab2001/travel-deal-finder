# GitHub Setup (Prompt 0A)

This walks you through creating the `travel-deal-finder` repo on github.com.
The local scaffold already exists — you just need to put it on GitHub and turn
on the right protections.

## 1. Create the repository

On https://github.com/new:

| Field | Value |
|---|---|
| Owner | `srab2001` |
| Repository name | `travel-deal-finder` |
| Description | `Daily flight price monitoring tool - find deals across destinations and airports` |
| Visibility | **Public** |
| Initialize with README | **Unchecked** (we already have one locally) |
| Add .gitignore | **None** (ours is committed) |
| License | **None** (ours is committed) |

> Why unchecked? Initializing on GitHub creates a divergent first commit. We
> push our local history instead.

## 2. Push the local repo

From `~/github/travel-deal-finder`:

```bash
git remote add origin https://github.com/srab2001/travel-deal-finder.git
git branch -M main
git push -u origin main
```

(SSH alternative: `git@github.com:srab2001/travel-deal-finder.git`.)

## 3. Branch protection on `main`

Settings → Branches → Add branch ruleset:

- Branch name pattern: `main`
- Restrict deletions: **on**
- Require a pull request before merging: **on**
  - Required approvals: 1 (or 0 for solo dev — still get the PR template)
- Require status checks to pass: **on**
  - Add `test` (will appear after CI runs once)
- Block force pushes: **on**

## 4. Enable Dependabot

Settings → Code security and analysis:

- Dependabot alerts: **enable**
- Dependabot security updates: **enable**
- Dependabot version updates: **enable**, then commit `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

## 5. Repository niceties

- Settings → General → **Allow squash merging only** (keeps history linear).
- Settings → General → **Automatically delete head branches**.
- Add topics: `flights`, `travel`, `cli`, `price-monitoring`, `nodejs`.

## What's already committed for you

```
.github/workflows/ci.yml      # Phase 0 CI
.gitignore                    # node_modules, .env, results_*.csv, etc.
LICENSE                       # MIT
README.md, QUICKSTART.md
PROMPTS.md
package.json
index.js
lib/*.js
tests/*.js
docs/*.md
```

You should not need to add or rename anything on first push.
