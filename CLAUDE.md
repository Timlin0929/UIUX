# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **static HTML prototype playground** for an AI travel‑planning app ("WanderAI"). There is **no build step, no framework, no bundler**. Prototypes run directly from the filesystem (`file://`) or any static server. The most current / main flow is [ai-travel-planner-v8.html](app/ai-travel-planner-v8.html); the explore + login + onboarding flow is [ai-travel-explore-final.html](app/ai-travel-explore-final.html).

**Read [AGENTS.md](AGENTS.md) before any task** — it holds the authoritative working rules and a required post-change user-flow testing protocol (see below).

## Folder layout

```
app/        ← all web-app runtime files (HTML, CSS, JS, data, config)
archive/    ← retired inline prototypes (no longer active)
tools/      ← one-off utility scripts (patch_gen_overlay.py, nginx-blocklist.conf)
crawler/    ← Node.js data pipeline (npm project, run from that folder)
```

## Commands

There is **no test/lint/build at the repo root**. Validation is manual (open the page, exercise the flow). To preview a prototype, open its `.html` via `file://` or serve the folder statically.

- **Syntax gate (enforced automatically):** a `PostToolUse` hook ([.claude/settings.json](.claude/settings.json) → [.claude/hooks/check-edited-js.js](.claude/hooks/check-edited-js.js)) runs `node --check` on every `.js` you Write/Edit. Run it yourself with `node --check <file>.js`.

The only npm project is the **crawler** ([crawler/](crawler/), run from that folder after `npm install`). It needs `$env:FIREBASE_SERVICE_ACCOUNT_PATH` pointing at `crawler/serviceAccount.json`; the Google Maps key is auto-loaded from `app/weather.env.js`. See [crawler/README.md](crawler/README.md) for full detail.

| Command | Purpose |
|---|---|
| `npm run import` (`import:dry`) | Taiwan tourism OpenData → Firestore `scenic_points` |
| `npm run verify:places` (`-- --force`, `-- --limit N`) | Strict-name-match each scenic point against Google Places; write back precise coords / hours / rating / `place_id` (keeps OpenData name) |
| `npm run enrich:fees` (`-- --force`, `-- --loose`, `-- --tdx`) | Match real ticket prices (主來源: 台東觀光網 opendata, optional `--tdx` for nationwide TDX) → write `fee`/`feeNote`/`feeSource` back onto `scenic_points` |
| `npm run export:local` (`export:local:dry`) | `scenic_points` → [app/poi-data.js](app/poi-data.js) |
| `npm run crawl:food` (`crawl:food:dry`) | Restaurants per destination (Places `searchNearby`, incl. `costPerPerson`/`costNote`) → [app/restaurant-data.js](app/restaurant-data.js) |

A Windows scheduled task **`WanderAI Food Crawl`** runs `crawl:food` biweekly via [crawler/run-food-crawl.bat](crawler/run-food-crawl.bat).

## Architecture

### Prototype file-split convention (important)
- All app files live in [app/](app/). `ai-travel-planner-v8.html` and `ai-travel-explore-final.html` load **sibling external `.css`/`.js`** (e.g. [app/ai-travel-planner-v8.js](app/ai-travel-planner-v8.js), [app/ai-travel-explore-final.js](app/ai-travel-explore-final.js)). **Put logic/style changes in those files**; the `.html` keeps only markup, CDN/`weather.env.js` script tags, and the Google Maps loader. They are plain `<script src>` (not ES modules) so `file://` works.
- Retired prototypes (e.g. [archive/ai-travel-planner.html](archive/ai-travel-planner.html)) keep everything **inline**.
- Keep changes local to the target prototype; only backport across variants when explicitly asked.

### Runtime config & external services
- [app/weather.env.js](app/weather.env.js) (gitignored) defines `window.TRAVEL_APP_CONFIG`: `GOOGLE_MAPS_API_KEY`, Vertex AI keys/project, Firebase config. Never hardcode keys in page markup — read them from here.
- [app/ferry-config.js](app/ferry-config.js) (`window.WAI_FERRY_CONFIG`) holds stable island-harbor anchor coordinates (Places often mis-geocodes these).
- [app/attraction-fee-config.js](app/attraction-fee-config.js) (`window.WAI_ATTRACTION_FEE`) is a **hand-maintained** override layer for admission fees — unlike the other data files below, edit it directly; it takes priority over the `fee`/`feeNote` that `enrich:fees` writes into `app/poi-data.js`.
- Services, all loaded via CDN (`file://`-compatible): **Firebase** (Auth + Firestore), **Google Maps Places API (New)**, **Vertex AI / Gemini** (trip generation).

### Local-first data pipeline (the core cost design — spans crawler + frontend)
Per-trip Google Places calls are expensive, so generated scenic/restaurant data is **cached into static files and used local-first**:

- Data files (auto-generated, do not hand-edit): [app/poi-data.js](app/poi-data.js) = `window.WAI_POI_DATA` (scenic spots), [app/restaurant-data.js](app/restaurant-data.js) = `window.WAI_RESTAURANT_DATA` (restaurants). Loaded via `<script src>` in `ai-travel-explore-final.html`. (The one exception is [app/attraction-fee-config.js](app/attraction-fee-config.js) — hand-maintained, see above.)
- **Pipeline:** OpenData → `scenic_points` (Firestore) → `verify:places` (Places enrichment) + `enrich:fees` (ticket-price enrichment, 台東觀光網 opendata + optional `--tdx`), both written back to Firestore → `export:local` → `app/poi-data.js`; and `crawl:food` (Places `searchNearby`) → `app/restaurant-data.js`.
- **Frontend (`ai-travel-explore-final.js`) is local-first:** if a destination exists in `app/poi-data.js`, the generator uses the local POI list and **skips** the live Places fetch and the Firebase `poi_cache`/reviews path. `getLocalPoiList` / `getLocalFoodList` do the lookup; `fetchGoogleMapsFoodList` is local-first too.
- After the AI produces a trip, `verifyAndFilterStopsWithPlaces` validates final stops — but **short-circuits** stops whose name matches a verified local POI/cached restaurant (skips the Places call). This is what keeps runtime Places usage low.
- **Cost surfacing (`ai-travel-planner-v8.js`):** real ticket prices (`fee`/`feeNote` from `app/poi-data.js`, overridable via `app/attraction-fee-config.js`) and restaurant per-person cost (`costPerPerson`/`costNote` from `app/restaurant-data.js`, derived from Places `priceLevel`/`priceRange`) are shown on itinerary stop cards and folded into the per-person budget breakdown.
- **Refresh:** scenic coords/hours = `verify:places -- --force` → `export:local`; scenic fees = `enrich:fees -- --force` → `export:local`; restaurants = `crawl:food` (mostly automatic via the scheduled task). Refreshing only changes the cache/hints; final-trip coords/hours are still re-verified live for non-cached stops.
- Estimated/heuristic, not from Places: scenic **stay duration** (`estimateDuration` in [crawler/worker.js](crawler/worker.js) — category table + desc parsing, to avoid the costly Places reviews SKU).

### Crawler internals
[crawler/worker.js](crawler/worker.js) is a single Node script; mode is chosen by CLI flag (`--import` / `--verify-places` / `--enrich-fees` / `--export-local` / `--crawl-food`, plus `--dry-run`, `--force`, `--limit`). Reads Firestore via `firebase-admin`. `deriveDestKey` buckets POIs into frontend destination keys (台東 / 綠島 / 蘭嶼 …); `placeNameMatchesQuery` is the strict matcher shared in spirit with the frontend verify step (臺→台 normalization matters throughout). `--enrich-fees` additionally needs `TDX_APP_ID`/`TDX_APP_KEY` (only when passing `-- --tdx`) and looks up `app/weather.env.js` first, falling back to the repo-root copy for compatibility.

## Post-change testing (from AGENTS.md)
After a change, **run the affected feature from the start of the flow as a real user**, not just the edited line. Check state/ordering, preview/summary sync, persistence, and that user-entered values are preserved unless a feature must correct them. Itinerary-time edits have explicit rules (later stops auto-delay only when earlier-or-equal to the previous stop; manual edits otherwise preserved). Report findings using the "User Flow Test Result" template in AGENTS.md. Note in the report anything blocked locally (Firebase/Maps keys, network, `localStorage`).
