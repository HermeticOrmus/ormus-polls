# ormus-polls

> Self-hosted polling with Firebase Auth Google Sign-In. Express + SQLite, ~500 lines of server.

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
