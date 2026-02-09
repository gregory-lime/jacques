# Distribution & Publishing Guide

How to release Jacques to users. Covers all viable distribution channels, cross-platform considerations, and a phased rollout strategy.

## Target Audience

- Claude Code power users
- Vibe coders and aspiring vibe coders
- Platforms: macOS and Windows (Linux as bonus)

## Current Project Structure

Jacques is a Node.js monorepo with 4 workspaces:

| Package | Role | Has `bin`? |
|---|---|---|
| `@jacques/core` | Shared business logic | No |
| `@jacques/server` | Server + HTTP API + GUI hosting | `jacques-mcp` |
| `@jacques/cli` | Terminal TUI (Ink/React) | `jacques` |
| `@jacques/gui` | Web GUI (Vite/React, builds to static) | No |

The GUI builds to static files served by the server at `http://localhost:4243`.

---

## Distribution Channels

### 1. npm / npx (Primary)

**Best fit**: Claude Code users already have Node.js installed.

```bash
# Global install
npm install -g jacques

# Zero-install trial
npx jacques
```

**What's needed to publish:**
- Remove `"private": true` from root `package.json`
- Resolve workspace `file:` references — either:
  - Publish all 4 packages separately (`@jacques/core`, `@jacques/server`, `@jacques/cli`, `@jacques/gui`)
  - Or flatten into a single `jacques` package (simpler for users)
- Add a `prepublishOnly` script that builds TS and the GUI
- Ensure `npm run setup` and `npm run configure` work from a global install path (not just the repo checkout)
- Bundle Python/Bash hooks in the package and handle their installation

**Cost**: Free (npmjs.com account)

**Platforms**: macOS, Windows, Linux — anywhere Node.js runs

---

### 2. Homebrew Tap (macOS)

```bash
brew tap <user>/jacques && brew install jacques
```

A "tap" is a GitHub repo (e.g., `<user>/homebrew-jacques`) containing a Ruby formula that describes how to install Jacques.

**What's needed:**
- Create a GitHub repo `homebrew-jacques`
- Write a formula that declares `node` and `python3` as dependencies
- Formula downloads the tarball, runs `npm install --production && npm run build:all`
- Users get automatic updates via `brew upgrade`

**Cost**: Free

**Platforms**: macOS only (Linux via Linuxbrew, but niche)

**Note**: Getting into `homebrew-core` (the main registry) requires project notability and many users. A personal tap has zero barrier.

---

### 3. One-Liner Install Script

```bash
curl -fsSL https://jacques.dev/install.sh | sh
```

Common pattern for dev tools (Rust, Bun, Deno all use this).

**What's needed:**
- Write an install script that detects OS, checks/installs Node.js, downloads Jacques, runs setup
- Host the script (GitHub Pages, raw GitHub URL, or custom domain)
- Windows support via Git Bash or WSL

**Cost**: Free

**Platforms**: macOS, Linux natively; Windows via WSL or Git Bash

---

### 4. GitHub Releases with Standalone Binaries

Ship a single executable per platform — **no Node.js required**.

```
jacques-macos-arm64
jacques-macos-x64
jacques-win-x64.exe
jacques-linux-x64
```

**Tools to build standalone binaries:**
- Node.js SEA (Single Executable Applications) — built into Node 20+
- `pkg` by Vercel — mature, widely used
- `bun build --compile` — if migrating to Bun runtime

**What's needed:**
- CI pipeline (GitHub Actions) that builds binaries for each platform on each release
- Bundle the built GUI static files and hooks inside the binary
- Test on each platform

**Cost**: Free (GitHub Releases, GitHub Actions free for public repos)

**Platforms**: macOS, Windows, Linux — **no runtime dependencies**

---

### 5. Windows Package Managers

#### Scoop
```powershell
scoop bucket add jacques https://github.com/<user>/scoop-jacques
scoop install jacques
```

- Community package manager, popular with developers
- Just a JSON manifest in a GitHub repo
- Easy to set up and maintain

#### Winget
```powershell
winget install jacques
```

- Microsoft's official package manager (built into Windows 11)
- Submit to the [winget-pkgs](https://github.com/microsoft/winget-pkgs) community repo
- Has a review/approval process

#### Chocolatey
```powershell
choco install jacques
```

- Older Windows package manager, still widely used
- Free for open-source packages

**Cost**: All free

---

### 6. Claude Code MCP Integration

Jacques already has an MCP server (`jacques-mcp`). Since the target audience uses Claude Code, this is the most natural integration point.

**Current state:**
- Users can add Jacques MCP to their Claude Code config manually
- `@jacques/server` already exports `jacques-mcp` as a bin entry

**Future opportunity:**
- When Anthropic launches an MCP registry/marketplace, Jacques could be discoverable directly inside Claude Code
- This is likely the highest-leverage channel for this specific audience

**Cost**: Free

---

### 7. Desktop App (Tauri)

Wrap the existing web GUI as a native desktop app.

```
Jacques.dmg    (macOS)
Jacques.exe    (Windows installer)
```

**Why Tauri over Electron:**
- ~5MB vs ~100MB bundle size
- Lower memory footprint
- Still uses the web GUI (same React code)

**What's needed:**
- Tauri wrapper around the existing GUI
- Bundle the server as a sidecar process
- Code signing:
  - macOS: Apple Developer certificate ($99/year) to avoid "unidentified developer" warning
  - Windows: Code signing certificate ($200-400/year) to avoid SmartScreen warning (optional — unsigned works, just shows a warning)
- Auto-update mechanism (Tauri has this built in)

**Cost**: Free to build; $99/year for macOS signing (optional)

**Platforms**: macOS, Windows, Linux

---

## Costs Summary

| Channel | Cost | macOS | Windows | Requires Node.js? |
|---|---|---|---|---|
| npm / npx | Free | Yes | Yes | Yes |
| Homebrew tap | Free | Yes | No | Declared as dep |
| Install script | Free | Yes | Via WSL | Script installs it |
| GitHub Releases (binary) | Free | Yes | Yes | **No** |
| Scoop | Free | No | Yes | Declared as dep |
| Winget | Free | No | Yes | Declared as dep |
| Chocolatey | Free | No | Yes | Declared as dep |
| Tauri desktop app | $99/yr (macOS signing) | Yes | Yes | **No** |

---

## Recommended Rollout

### Phase 1 — Quick Wins
**Goal**: Cover the core audience (Claude Code users who have Node.js).

- [ ] Publish to **npm** with `npx` support
- [ ] Document MCP setup prominently in README
- [ ] Create GitHub Releases (source tarball + install instructions)

### Phase 2 — Broader Reach
**Goal**: Reduce friction for less-technical users and Windows users.

- [ ] **Install script** (curl one-liner)
- [ ] **GitHub Releases with standalone binaries** (no Node.js required)
- [ ] **Scoop** formula for Windows
- [ ] **Homebrew tap** for macOS

### Phase 3 — Polish
**Goal**: First-class experience if the project gains traction.

- [ ] **Tauri desktop app** (native GUI with auto-updates)
- [ ] **Winget** submission
- [ ] MCP registry listing (when Anthropic launches one)

---

## Per-Release Cost

### With CI Automation (GitHub Actions)

Once a CI pipeline is set up, every release — quick fix or major version — is:

```bash
git tag v0.1.0 && git push --tags
```

CI handles the rest: test, build, publish, update package manifests.

**Per-channel effort with CI:**

| Channel | What you do | Time | Fully automated? |
|---|---|---|---|
| npm | Push a git tag | ~1 min | Yes |
| Homebrew tap | Push a git tag (bot updates formula) | ~1 min | Yes |
| Install script | Nothing (always points to latest) | 0 | N/A |
| GitHub Releases + binaries | Push a git tag (CI builds + uploads) | ~1 min | Yes |
| Scoop | Push a git tag (bot updates manifest) | ~1 min | Yes |
| Winget | Submit PR to microsoft/winget-pkgs | ~5 min + review wait | Partial (bot exists) |
| Chocolatey | Push a git tag | ~1 min | Yes |
| Tauri desktop app | Push a git tag (CI builds + signs) | ~1 min | Yes (complex CI setup) |

**Setting up this CI pipeline is a one-time cost of a few hours.** After that, every release is just a git tag.

### Without CI (Manual)

| Channel | What you do | Time |
|---|---|---|
| npm | `npm run build:all && npm publish` | ~3 min |
| Homebrew tap | Edit formula: bump version + SHA hash, push | ~5 min |
| Install script | Nothing | 0 |
| GitHub Releases + binaries | Build on each platform, upload to GitHub | ~30 min |
| Scoop | Edit JSON manifest: bump version + hash | ~5 min |
| Winget | Submit PR with updated manifest | ~10 min |
| Tauri desktop app | Build + sign on each platform, upload | ~45 min |

### Ongoing Maintenance Costs

These aren't per-release — they're ongoing concerns:

| Concern | Frequency | Effort | Cost |
|---|---|---|---|
| Cross-platform bugs | Occasional | Medium — "works on Mac" breaks on Windows | Time |
| Node.js version bumps | ~Yearly | Low — update `engines`, test | Time |
| Dependency security patches | Monthly-ish | Low — `npm audit fix`, republish | Time |
| macOS signing cert renewal | Yearly | 10 min | $99 (Tauri only) |
| Breaking changes in Claude Code | Unpredictable | Medium — JSONL format, hook API changes | Time |
| User support / issue triage | Ongoing | **This is the real cost** | Time |

### Bottom Line

- **npm + GitHub Releases + Homebrew + Scoop** with CI: per-release cost is **one command**. Upfront CI setup is a few hours, then free forever.
- **Tauri desktop app** is the only channel with meaningful ongoing cost (signing certs, complex CI, platform-specific bugs).
- **Money**: $0 for everything except macOS app signing ($99/year).
- **The real ongoing cost is your time** on cross-platform bugs and user support, not publishing mechanics.

---

## npm Publishing Checklist

Detailed steps for Phase 1:

1. **Choose package structure**: single `jacques` package (recommended) vs separate `@jacques/*` scoped packages
2. Remove `"private": true` from root `package.json`
3. Replace `file:` workspace references with versioned dependencies
4. Add `"files"` field to control what gets published (exclude tests, docs, dev configs)
5. Add `prepublishOnly` script: `npm run build:all`
6. Ensure `bin` entries point to correct built files with shebangs
7. Test locally with `npm pack` and `npm install <tarball>`
8. Create npmjs.com account and run `npm publish`
9. Verify with `npx jacques` from a clean environment
