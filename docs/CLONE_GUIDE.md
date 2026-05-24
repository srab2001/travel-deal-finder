# Clone Guide (Prompt 0B)

How to get `travel-deal-finder` onto a new machine after it exists on GitHub.

## 1. Prerequisites

```bash
git --version    # any modern git is fine
node --version   # need >= 16
npm --version
```

If anything's missing:

- Git → https://git-scm.com or `xcode-select --install` on macOS
- Node + npm → https://nodejs.org (LTS) or `brew install node`

## 2. Clone

**HTTPS** (no SSH key needed):

```bash
mkdir -p ~/github && cd ~/github
git clone https://github.com/srab2001/travel-deal-finder.git
cd travel-deal-finder
```

**SSH** (after `ssh-keygen` + adding the public key to GitHub):

```bash
mkdir -p ~/github && cd ~/github
git clone git@github.com:srab2001/travel-deal-finder.git
cd travel-deal-finder
```

## 3. Install dependencies

```bash
npm install
```

The Phase 0 scaffold has no runtime dependencies, so this is a no-op until
Phase 1 adds the provider client.

## 4. First-time git identity (if needed)

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 5. Sanity checks

```bash
git remote -v                 # should show origin → srab2001/travel-deal-finder
git branch -a                 # main + any remote branches
git log --oneline -5
npm test                      # node:test runner, should pass
node index.js --help          # prints CLI usage
```

## 6. Start a feature branch

The project uses a `develop` integration branch (see WORKFLOW.md):

```bash
git checkout -b develop origin/develop 2>/dev/null || git checkout -b develop
git push -u origin develop     # only needed once, by whoever creates it
git checkout -b feature/your-thing
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Permission denied (publickey)` | Use HTTPS, or add your SSH key in GitHub → Settings → SSH keys |
| `npm install` errors | `rm -rf node_modules package-lock.json && npm install` |
| `git clone` hangs | Check network; if behind a proxy, set `git config --global http.proxy ...` |
| `node: command not found` after install | Restart shell, or check that `node` is on `$PATH` |
| Wrong node version | Use `nvm install 20 && nvm use 20` |
