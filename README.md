<p align="center">
  <img src="https://ormus.solutions/mascot/pixellab_liquid_to_eye.gif" alt="ormus-polls" width="128" style="image-rendering: pixelated;" />
</p>

<h1 align="center">ormus-polls</h1>

<p align="center">
  <em>Self-hosted polling with Firebase Auth Google Sign-In. Express + SQLite, single-file server.</em>
</p>

<p align="center">
  <a href="https://github.com/HermeticOrmus/ormus-polls/stargazers"><img src="https://img.shields.io/github/stars/HermeticOrmus/ormus-polls?style=flat-square&color=aa8142" alt="Stars" /></a>
  <a href="https://github.com/HermeticOrmus/ormus-polls/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HermeticOrmus/ormus-polls?style=flat-square&color=aa8142" alt="License" /></a>
  <a href="https://github.com/HermeticOrmus/ormus-polls/commits"><img src="https://img.shields.io/github/last-commit/HermeticOrmus/ormus-polls?style=flat-square&color=aa8142" alt="Last Commit" /></a>
  <img src="https://img.shields.io/badge/Claude_Code-aa8142?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code" />
</p>

---

> **Self-hosted polling with Firebase Auth Google Sign-In. Express + SQLite, ~500 lines of server.**

A minimal-but-complete polling app you run yourself. Create polls with required-selection counts and entries, share the slug URL, voters sign in with Google (via Firebase Auth), each email votes once. Admins see full per-voter breakdowns; everyone else sees aggregated tallies.

## Why

For times when you need polling that's:

- Authenticated (Google Sign-In, one vote per email) — not anonymous
- Private (no SaaS company sees your data) — not Google Forms
- Cheap (free Firebase tier + your own server) — not a $50/mo SaaS
- Hackable (one server.js, one HTML per page) — not a black-box product

`ormus-polls` is the minimum viable build. Express + better-sqlite3 + Firebase Auth verification (raw JWT, no SDK).

## Install

### 1. Set up a Firebase project

- Go to https://console.firebase.google.com and create a free project
- Enable **Authentication → Sign-in method → Google**
- In Project Settings → General → "Your apps", register a web app
- Copy the `apiKey`, `authDomain`, and `projectId` shown for that app

### 2. Run the server

```bash
git clone https://github.com/HermeticOrmus/ormus-polls
cd ormus-polls
npm install
cp .env.example .env
# Edit .env with your Firebase values + ADMIN_EMAILS
npm start
```

Open `http://localhost:8096`. Create polls via the API or directly in SQLite.

## Configuration

| Env var | Required | Purpose |
|---|---|---|
| `PORT` | no (default 8096) | HTTP port |
| `DB_PATH` | no (default `./data/polls.db`) | SQLite file location |
| `FIREBASE_PROJECT_ID` | **yes** | Your Firebase project ID |
| `FIREBASE_AUTH_DOMAIN` | **yes** | `<project>.firebaseapp.com` |
| `FIREBASE_API_KEY` | **yes** | Firebase web app API key (safe to expose — restricted by domain in Firebase console) |
| `ADMIN_EMAILS` | recommended | Comma-separated list of emails with admin access to per-voter breakdowns |

## Architecture

- **Server-side Firebase token verification**: raw JWT verification using Google's public certs (no Firebase Admin SDK dependency, no service account key needed)
- **Client config served from server**: `/api/config.js` injects Firebase web config into the page so deployers configure once via env vars and never edit static HTML
- **One vote per voter**: enforced by unique constraint on `(poll_id, voter_id)` in SQLite
- **Voter identity**: email from verified Firebase ID token; first/last name captured at first vote

## Schema

| Table | Purpose |
|---|---|
| `polls` | poll metadata: slug, title, description, required_selections, entries (JSON), status |
| `voters` | one row per email, captures first/last name at registration |
| `votes` | one row per (poll, voter, entry); unique constraint on (poll_id, voter_id, entry) |

## Pages

| Route | Purpose |
|---|---|
| `/` | Index (list of open polls) |
| `/:slug` | Voting page for a poll |
| `/:slug/info` | Pre-vote info page |
| `/:slug/results` | Public aggregated results + admin per-voter breakdown if admin |

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/config.js` | Firebase client config (public) |
| `GET` | `/api/polls` | List open polls |
| `GET` | `/api/polls/:slug` | Single poll metadata |
| `POST` | `/api/voter` | Register voter (Firebase auth required) |
| `POST` | `/api/vote` | Submit votes (Firebase auth required) |
| `GET` | `/api/results/:slug` | Public aggregated tally |
| `GET` | `/api/admin/results/:slug` | Per-voter breakdown (admin email required) |

## Pairs with

Part of the **ormus session lifecycle** family — composable Claude Code skills:

- [ormus-handoff](https://github.com/HermeticOrmus/ormus-handoff) · [ormus-pickup](https://github.com/HermeticOrmus/ormus-pickup) · [ormus-absorb](https://github.com/HermeticOrmus/ormus-absorb) · [ormus-explore](https://github.com/HermeticOrmus/ormus-explore) · [ormus-vibe-proof](https://github.com/HermeticOrmus/ormus-vibe-proof) · [ormus-meta-prompting](https://github.com/HermeticOrmus/ormus-meta-prompting)

And other self-hosted Ormus tools:

- [ormus-invoicer](https://github.com/HermeticOrmus/ormus-invoicer) — self-hosted invoicing for solo operators

## License

MIT. See [LICENSE](LICENSE).

## Origin

Built for community decision-making where Google Forms didn't fit (need authenticated one-vote-per-email, private data, custom slug URLs to share). Released so anyone running an authenticated poll doesn't need to glue together SDKs and SaaS to do it.

---

## Part of the Libre Open-Source Stack for Claude Code

This repository is part of a growing family of open-source toolkits for Claude Code.

### Libre suite — comprehensive plugin bundles

- [LibreUIUX-Claude-Code](https://github.com/HermeticOrmus/LibreUIUX-Claude-Code) — UI/UX development (152 agents, 70 plugins, 76 commands, 74 skills)
- [LibreArch-Claude-Code](https://github.com/HermeticOrmus/LibreArch-Claude-Code) — Software architecture and system design
- [LibreCopy-Claude-Code](https://github.com/HermeticOrmus/LibreCopy-Claude-Code) — Technical writing and documentation engineering
- [LibreDevOps-Claude-Code](https://github.com/HermeticOrmus/LibreDevOps-Claude-Code) — DevOps engineering and infrastructure automation
- [LibreEmbed-Claude-Code](https://github.com/HermeticOrmus/LibreEmbed-Claude-Code) — Embedded systems, firmware, and IoT development
- [LibreFinTech-Claude-Code](https://github.com/HermeticOrmus/LibreFinTech-Claude-Code) — Financial technology development
- [LibreGEO-Claude-Code](https://github.com/HermeticOrmus/LibreGEO-Claude-Code) — AI-search optimization (ChatGPT, Perplexity, Gemini, Google AI Overviews)
- [LibreGameDev-Claude-Code](https://github.com/HermeticOrmus/LibreGameDev-Claude-Code) — Game development across Godot, Unity, Unreal
- [LibreMLOps-Claude-Code](https://github.com/HermeticOrmus/LibreMLOps-Claude-Code) — ML engineering and AI operations
- [LibreMobileDev-Claude-Code](https://github.com/HermeticOrmus/LibreMobileDev-Claude-Code) — Mobile app development (Flutter, React Native, native iOS, native Android)
- [LibreSecOps-Claude-Code](https://github.com/HermeticOrmus/LibreSecOps-Claude-Code) — Security operations

### Skills mini-repos — single CLAUDE.md drop-ins

- [vibe-engineer-skills](https://github.com/HermeticOrmus/vibe-engineer-skills) — Direct AI codegen well (hypothesis → scope → validate → reject working-but-wrong)
- [markdown-discipline-skills](https://github.com/HermeticOrmus/markdown-discipline-skills) — Strip AI-slop from markdown (no em dashes, no marketing fluff)
- [shell-safety-skills](https://github.com/HermeticOrmus/shell-safety-skills) — `set -euo pipefail` discipline + 15 failure-mode examples
- [commit-standard-skills](https://github.com/HermeticOrmus/commit-standard-skills) — Ormus Commit Standard v1.0 + commit-msg hook + commitlint
- [unwoke-skills](https://github.com/HermeticOrmus/unwoke-skills) — Strip AI theater (ten sins to eliminate, symmetric engagement)
- [python-conventions-skills](https://github.com/HermeticOrmus/python-conventions-skills) — Modern Python 3.11+ (types, pathlib, async, ruff, mypy, uv)
- [typescript-conventions-skills](https://github.com/HermeticOrmus/typescript-conventions-skills) — TypeScript strict mode, discriminated unions, Result types
- [hermetic-laws-skills](https://github.com/HermeticOrmus/hermetic-laws-skills) — Seven Hermetic Principles applied to engineering
- [riper-workflow-skills](https://github.com/HermeticOrmus/riper-workflow-skills) — Research / Innovate / Plan / Execute / Review systematic dev
- [six-day-cycle-skills](https://github.com/HermeticOrmus/six-day-cycle-skills) — Sustainable shipping cadence with mandatory rest
- [token-optimization-skills](https://github.com/HermeticOrmus/token-optimization-skills) — Claude Code token + context optimization
- [osint-skills](https://github.com/HermeticOrmus/osint-skills) — OSINT research methodology (multi-wave investigative spiral)
- [calcinate-skills](https://github.com/HermeticOrmus/calcinate-skills) — Stage 1 of the Magnum Opus (burn project bloat)
- [claude-md-overhaul-skills](https://github.com/HermeticOrmus/claude-md-overhaul-skills) — Audit CLAUDE.md and MEMORY.md against caps
- [session-handoff-skills](https://github.com/HermeticOrmus/session-handoff-skills) — Session handoff + pickup discipline
- [naming-skills](https://github.com/HermeticOrmus/naming-skills) — Product naming methodology (mine the brand's vocabulary)
- [magnum-opus-skills](https://github.com/HermeticOrmus/magnum-opus-skills) — Seven-stage alchemy applied to project transformation

### Template source

- [andrej-karpathy-skills](https://github.com/HermeticOrmus/andrej-karpathy-skills) — the canonical single-file CLAUDE.md pattern (fork of jiayuan_jy's original)

Star the family, not just one — that's how the suite stays coherent.
