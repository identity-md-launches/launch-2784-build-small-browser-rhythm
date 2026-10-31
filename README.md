# Wheel Rhythm

A small, static rhythm game powered by Squeekchain's real hamster wheel. HTML, CSS and vanilla JavaScript; no runtime libraries, backend, account, wallet or tracking. All artwork is original and bundled locally.

## Install, rebuild and preview

Use Node.js 22 or later:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open `http://localhost:4173/preview/`. An optional port is accepted by `node scripts/preview.mjs 8080`. The production export is already included in `dist/`; upload that directory unchanged to a static host. All asset URLs are relative, including the favicon and share card. There are no server routes or build-time secrets. Serve over HTTP(S), rather than opening `index.html` through `file://`, because the source uses native ES modules.

`npm run build` copies only `index.html`, `src/` and `assets/` into a clean `dist/` using Node's standard library. Dependencies are for development and verification only. `npm run typecheck` checks the actual JavaScript with strict JSDoc types (`checkJs` and `noEmit`), not a separate TypeScript implementation.

## Play

- Catch a seed's center at the gold line with **A / S / D**, **Left / Down / Right**, or a tap anywhere in its lane.
- Perfect: within **70 ms**, **100 points**. Good: within **160 ms**, **50 points**. A late seed or an incorrect tap is a miss; every miss resets the combo to zero. A caught seed cannot score twice.
- A run lasts **72 seconds**, plus a **2.4-second countdown** and a **160 ms final timing window**. Complete it or select Pause → End this run for the results screen. Play again resets score, combo and note positions.
- **P / Escape** pauses or resumes. Help, switching tabs and losing window focus pause play. Sound starts muted; the header speaker enables original synthesized effects.
- Best score is saved only in this browser, under `wheel-rhythm:best:v1`. If storage is denied, play continues and the result explains that the best score lasts only for this visit.

## Reading the Squeekchain API

`src/app.js` requests both public CORS feeds directly. Requests have a 4.5-second timeout, omit credentials, and send no referrer. A network failure, invalid JSON, missing fields, or invalid values never becomes an unhandled game error.

| Feed / field | Used for |
| --- | --- |
| `https://api.squeekchain.com/v1/status`, every 5 seconds | Wheel status; the only live gameplay input |
| `measurement.rpmMilli` | Divide by 1,000 for displayed RPM; set live speed and seed density |
| `measurement.coreStatus` | `SPINNING` with positive RPM is Live; `IDLE` or zero RPM is Replay |
| `measurement.freshness` | Exactly `online` is eligible to be fresh |
| `measurement.observedAt`, `measurement.staleAfterSeconds` | Reject old data; default age limit is 120 seconds. Missing/invalid timestamps are stale; a timestamp over 30 seconds in the future is rejected |
| `builder.anchor.blockProgress` | Divide by 1e9; clamp to 0–1 for the real block progress bar |
| `builder.anchor.blockHeight` | Small `Block #…` label; read the anchor, not the builder's projected block |
| `https://api.squeekchain.com/v1/settlements?range=24h` | Exactly 24 hourly activity buckets for Replay |
| `buckets[].workAdded` | Actual intensity for each hour; zero-work hours produce no new seed targets |
| `buckets[].settlementCount` | Part of the track fingerprint and each bar's descriptive title |
| `buckets[].startAt` | UTC hour label; missing timestamps become numbered sections |

Numbers and numeric strings are accepted, while empty strings, nonfinite values and unrelated types are rejected. A fresh partial status preserves earlier valid fields. Stale or failed responses never overwrite the last good reading. The header displays **offline, last data**; before any good reading it instead says **offline, no data yet**. Retained live speed is explicitly described as the last wheel rhythm. Recovery happens on the next successful status poll.

**Live:** RPM scales difficulty within fixed bounds, scoring is ×2, and a 2.8-second wake-up banner appears. Waking during a run preserves its score, combo, elapsed time and in-flight seed trajectories. Returning to IDLE resumes Replay at the current section. Results mark a mixed replay/live run.

**Replay:** 24 buckets become 24 three-second sections. The first active hour begins the track; the remaining hours continue chronologically and wrap, so every bucket is included exactly once. Higher work gives faster and denser notes. Quiet sections keep the hamster asleep and show a rest message; incoming notes from the previous section can finish normally. The activity strip and UTC hour label identify the section.

If the settlements feed fails or is incomplete, a deterministic built-in calm pattern is used with an **offline track** badge. A later Play again retries an offline track. If all 24 real buckets contain zero work, Start explicitly offers **Play calm practice**; that run is labeled **Calm practice**, rather than inventing hamster activity. Both use ×1.

## Daily tracks and fair comparisons

Lane choices and timing use a seeded generator, never `Math.random()`. The seed includes the UTC day and a fingerprint of the normalized hourly work, settlement counts and timestamps. The first successful 24-hour snapshot is cached for the UTC day under `wheel-rhythm:replay:v1`; each run freezes its track. The footer exposes the day and track ID. A new day loads a new snapshot before the next run.

**Known limitation:** the specified endpoint returns a rolling 24-hour window, not one immutable daily snapshot. Two new visitors arriving at different hours can receive different buckets and therefore different track IDs, even on the same day. Browser-only caching cannot coordinate them. The implementation guarantees identical notes for the same day **and track ID**, and stable daily replays within a browser; it cannot guarantee one globally identical track for every visitor all day. Compare replay scores only for matching IDs and game versions; mixed/live runs are separate. A strict global daily challenge would require a dated snapshot from the data provider. The app makes no shared leaderboard claim.

## Tune difficulty

Keep rule changes in `src/model.js`:

| Setting / function | Current behavior |
| --- | --- |
| `RULES.perfectWindow`, `goodWindow` | 0.070 s / 0.160 s; widen for easier timing |
| `RULES.perfectPoints`, `goodPoints` | 100 / 50, multiplied by mode ×1 or ×2 |
| `RULES.sections`, `sectionSeconds`, `duration` | 24 × 3 s = 72 s; keep the section count 24 and update duration with section length |
| `RULES.leadIn` | 2.4 s; must allow enough lead time for note travel |
| `liveDifficulty()` | Normalize 5–180 RPM to 0–1; interval 0.75–0.28 s, travel time 2.3–1.2 s |
| `replayNotes()` | `intensity = sqrt(hourWork / maxWork)`; 2–7 seeds per active section; travel 2.35–1.4 s |
| `calmTrack()` | Built-in 24-section practice work pattern, including rests |

Faster travel means a smaller travel duration. Preserve the first-live-note guard so high RPM never creates misses during the countdown. Update the seed suffix (`seeds-v1`), storage keys, help text and tests when rules change; old-version scores should not be treated as comparable. Rendering in `src/render.js` derives the hit line from the actual CSS target position, including text enlargement. `requestAnimationFrame` drives gameplay; resize geometry is read in `ResizeObserver`, not in the frame loop.

## Validation

The worker ran the production build, strict JavaScript typecheck, rule/API tests, real Chromium and WebKit interactions, the pinned taste@1 probe, and an axe accessibility scan. Exact commands, outcomes, fixes, screenshots and remaining limitations are in [artifacts/validation.md](artifacts/validation.md). The design tokens and responsive/component rules are documented in [DESIGN.md](DESIGN.md).

| Final check | Actual result |
| --- | --- |
| `npm run build` | Passed; complete 115,791-byte static export |
| `npm run typecheck` | Passed with TypeScript 5.9.3 checking the vanilla JavaScript |
| `npm test` | 20 passed, 0 failed |
| `npm run test:browser` | 13 checks passed across Chromium and WebKit |
| Pinned taste@1 probe on `dist/` | 16/16 passed; first-screen Start action visible at 390 px |
| axe start-screen audit | 25 rules passed, zero reported violations |
| Native Chromium animation sample | 120 frames, 16.666 ms mean / 16.8 ms p95 |
| Source/export integrity and bundle budget | Byte-identical runtime files; entire submission under 0.7 MiB of the 8 MiB limit |

Physical screen-reader/device sessions and browser-native zoom were not performed. Text enlargement to 200% was checked separately. Audible output was not physically listened to: Chromium's sound toggle passed, while headless WebKit could not resume audio and correctly reached the bounded silent fallback. Global daily replay identity has the rolling-feed limitation explained above.

To run the browser checks on a normal development machine:

```sh
npx playwright install --with-deps chromium webkit
npm run build
npm run test:browser
```

The script manages a bounded local `/preview/` server and closes both engines. Its temporary reports go under `test/scratch/` and are not part of the static export. Optional share-card regeneration: `node scripts/make-share.mjs` (requires the development Playwright browser). `assets/share.svg` is the editable source; the committed PNG makes rebuilding independent of image-generation tooling.

## Submission budget

The allowed addition is 8,388,608 bytes. Source, lockfile, complete `dist/`, original artwork and selected verification artifacts are retained. No dependency archives, package caches, submodules, wallets or runtime CDN assets are included. The explicit `.gitignore` path budget is **1,024 bytes** (actual file: 637 bytes). Generated-directory exclusions are limited to `**/node_modules/`, `**/.npm/`, `**/.cache/`, `**/.vite/`, `**/playwright-report/`, `**/test-results/`, and disposable `test/scratch/`. It does not exclude `dist/`. The bounded `artifacts/*` rule has explicit exceptions for the selected validation report, JSON results, license notices and four screenshots under `artifacts/`.
