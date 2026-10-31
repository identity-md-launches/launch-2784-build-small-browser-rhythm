# Wheel Rhythm: worker validation

## Outcome

The static game, source, lockfile, metadata, documentation and production `dist/` are delivered. Production build and strict JavaScript typecheck passed. **20/20 rule/API tests, 13/13 browser checks, 16/16 taste@1 checks**, and **25 axe rules with zero reported violations** on the start screen passed. These are worker observations, not independent certification.

**One strict brief requirement remains limited:** a globally identical replay for every visitor for the entire UTC day cannot be guaranteed by the specified rolling 24-hour endpoint. Deterministic notes, a per-day local snapshot and a visible track ID are implemented. Identical day + track ID + game version produce identical notes. Different first-fetch hours can produce different IDs. The README and in-product guide explain comparisons. No shared leaderboard or globally synchronized snapshot is claimed.

## Scope and decisions

One native HTML/CSS/JavaScript page, served as the production export under `/preview/` during browser checks. No runtime libraries, wallets, backend, tracking, remote font or image dependencies. The browser owns only a local best score and a sanitized daily replay snapshot.

The inferred run length is 24 × 3 = 72 seconds, with a 2.4-second lead-in and final 160 ms window. Replay begins at the first active bucket and visits the full chronological cycle, so a long quiet prefix does not leave the player waiting at the beginning. Missing or invalid API data uses explicit last-data/fallback states. An entirely zero-work day offers labeled calm practice rather than invented activity.

## Commands and actual outcomes

| Command | Result |
| --- | --- |
| `npm install --package-lock-only --ignore-scripts --cache /tmp/wheel-rhythm-npm-cache --no-audit --no-fund` | Lockfile generated; no repository dependency tree |
| `node scripts/make-share.mjs` with external Playwright tools | Original SVG rendered to the committed 1200 × 630 PNG |
| `npm run build` | Exit 0; complete static export copied to `dist/` |
| `PATH=/tmp/wheel-rhythm-tools/node_modules/.bin:$PATH npm run typecheck` | Exit 0; TypeScript 5.9.3 strict `checkJs`, no emit |
| `npm test` | Exit 0; 20 tests passed, 0 failed |
| `node test/browser.mjs` with external browser tools and temporary Linux libraries | Exit 0; 13 checks passed, 0 failed; Chromium and WebKit actually launched |
| `IMD_PLAYWRIGHT=/tmp/wheel-rhythm-tools/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` | Exit 0; all 16 checks passed at 320, 390 and 1440, plus reduced motion |
| Read-only export integrity and budget check | Source/export bytes match; relative assets resolve under `/preview/`; see package totals in README |

Development tools were installed outside the repository. The supplied browser connector initially failed with `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`. Validation continued using downloaded Playwright Chromium 141 and WebKit under `/tmp`. WebKit's Linux libraries were downloaded/extracted only under `/tmp`; its temporary launcher preserved that library search path. `PLAYWRIGHT_BROWSERS_PATH`, `WHEEL_TEST_TOOLS`, `LD_LIBRARY_PATH` and `GST_PLUGIN_SYSTEM_PATH` pointed to these temporary tools. The final browser command also used `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`: Playwright's global `ldconfig` preflight cannot see libraries installed in a temporary prefix. Actual engines, page rendering, input and application checks still ran. None of those browsers, libraries, package archives, caches or launcher changes is delivered.

The pinned taste probe ran with regular Chromium host validation and offline external requests. Both live API endpoints were also checked without interception in the browser. The final real-API observation was **IDLE, 0.0 RPM, Block #5204**, with online status and a fetched replay. API availability is an observation from this run, not a permanent guarantee.

## Useful interaction coverage

The browser suite exercises the finished export, not the source page:

- Start action wholly visible at **390 × 844**, correct title/description/favicon/OG metadata and default-muted sound.
- Perfect keyboard catch → 100 points and 1× combo; wrong-lane arrow → combo 0; a later Good arrow catch → 150 total.
- A real emulated touch at **360 × 800** catches once, with no duplicate synthetic-click miss.
- P/Escape and button pause/resume, Help auto-pause, Escape dismissal, Tab containment and return focus to Help.
- The entire 72-second run (accelerated browser clock), summary counts, score/best, persistent best across reload, Play again resetting score/combo.
- Status polling at 5-second intervals, IDLE → SPINNING mid-run while paused, retained score/combo/time, wake banner and ×2. Failure and stale readings retain the real prior values. Online IDLE recovery restores ×1.
- Completely failed requests and denied localStorage still produce a usable calm run and an honest storage message.
- A completely quiet real day offers calm practice; a daily successful replay cache survives reload without another settlement fetch.
- No horizontal overflow at **320, 360, 390, 700, 768, 1024 and 1440 px**. Sound, Help, Start and Pause meet **48 × 48 px**; the three lane buttons are much larger.
- Reduced-motion mode, a visible 2 px focus ring, 200% root text enlargement and no horizontal overflow after enlargement. This is **text enlargement**, not native browser zoom.
- WebKit mobile touch catch, pause/resume and responsive layout passed. Its headless audio context could not resume: the 2-second timeout and silent recovery message passed. Chromium's sound enable/mute flow passed.
- An additional native-clock WebKit smoke run advanced from the countdown to **1:10** after 4.5 real seconds, with the overlay hidden and zero script errors. This confirmed ordinary animation advances independently of the accelerated-clock interaction tests.
- **Zero uncaught script exceptions or missing local assets** across both engines.

The model tests cover numeric-string parsing; null/missing/malformed fields; stale/future/missing timestamps; anchor vs projected data; progress/RPM bounds; IDLE/zero-RPM mode precedence; deterministic track IDs/notes; higher-work difficulty and zero-work rests; exact Perfect/Good/Miss boundaries; duplicate-catch prevention; missed-note combo reset; wake/sleep trajectory preservation; ×2 scoring; full-run termination/restart; and no premature live misses during countdown, including an RPM change.

## Render and performance evidence

The final **120 native animation frames** in Chromium (no installed fake clock for this sample) averaged **16.666 ms**, with **16.8 ms p95**, consistent with approximately 60 fps on this host. The actual gold hit-line sample was `[247, 199, 103, 255]` after resize. This short sample is not a guarantee for every device or a sustained performance benchmark. Canvas runs on `requestAnimationFrame`, HUD writes are value-gated, geometry is cached by `ResizeObserver`, particles are capped at 80, and hamster art redraws about 12 fps.

Final packaging was approximately **650 KiB** against the **8 MiB** limit; `dist/` is **115,791 bytes**. All runtime source/export files were byte-compared. Relative HTML asset targets exist, the lockfile matches the manifest, and the delivered tree contains no symlinks, dependency directories, dependency archives or submodules. The ignore file is **637 bytes**, within its explicit 1,024-byte path budget. Only its named validation-artifact exceptions are retained.

The first 390 px screen was visually inspected: title and utility controls, honest offline/live telemetry, compact hamster, mode, score, activity strip and the gold Start action are visible. Desktop and phone gameplay, focus, enlarged text, wake, offline and WebKit screenshots were also inspected. Example data screenshots use deterministic **test fixtures**; only `1440-actual-api.png` in scratch was an unintercepted API capture. The fixture screenshots are UI evidence, not claims about real activity at those hours.

Delivered evidence:

| File | What it records |
| --- | --- |
| `390-first-screen.png` | Final taste probe's first 390 × 844 CSS-pixel screen, at device scale 2, with network blocked |
| `1440-playing.png` | Desktop keyboard gameplay against a deterministic fixture |
| `390-wake.png` | Mid-run wake-up, retained score/combo and ×2 fixture |
| `390-webkit.png` | Actual WebKit gameplay with fixture data after silent audio fallback |
| `browser-results.json` | Final 13 interaction results, API observation and frame sample |
| `taste.json` | Final 16 probe results and measurements |
| `axe-ready.json` | Start-screen axe result: 25 rules passed, zero violations |

Full temporary evidence was generated in `test/scratch/interaction/` and `test/scratch/taste/shots/`; scratch is excluded from submission and may be deleted. Only the selected files above are retained.

## Better Interface: six-domain review

The pinned workflow and all six domains' core principles were read before implementation. Supporting guidance for keyboard/focus, target sizes, motion/text enlargement, token contrast and design documentation informed the implementation. The requested navy/gold/pixel character remains authoritative.

| Domain | Coverage and results | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native buttons/dialog/progress, names and roles, skip link, visible keyboard focus, lane keyboard/touch input, modal Tab/Escape/focus return, inert lanes behind screens, polite state announcements, automatic pause, reduced motion; axe start-screen audit passed | No physical screen-reader session or physical touchscreen. A visual rhythm game is not claimed fully playable without sight. Axe is not a complete accessibility certification |
| Layout — Checked | DOM order, bounded shell, seven viewport widths, first mobile screen, stable board geometry across states, touch hit line in view, header/score reflow and 200% text enlargement | Native browser 200% zoom not performed. RTL/localization variants are outside this English-only brief |
| Writing — Checked | Three short rules, verb-first primary actions, concise mode/source labels, last-data and storage errors, timing guide, comparisons tied to track ID; six competing tagline fragments reduced to one | Global immutable daily-data guarantee remains limited as disclosed; no fabricated data is labeled real |
| Typography — Checked | Two local font families, six declared sizes, three weights; rendered probe shows four initial phone sizes and five desktop sizes; tabular numbers, natural case/tracking, wrapping, no ellipsized critical values | System font glyphs vary by platform; every possible fallback face was not individually tested |
| Colors — Checked | Semantic token roles, source-pair calculations, probe solid-background measurements, colored statuses paired with words; no measured normal-text contrast failure | The probe leaves 24 text boxes over/near canvas, image or composite backgrounds unmeasured. No claim of measured contrast for every artwork/composite pixel. Only one requested dark theme exists |
| UI — Checked | Ready, pending API, playing, pressed, paused, help, results, offline, stale/recovery, all-quiet practice, wake/sleep and audio failure; named 120 ms transitions, guarded 360 ms wake entry, reduced decorative canvas motion | Native Animations-panel playback at 10% speed not performed. Physical audible output was not listened to; headless WebKit audio was unavailable |

Declared solid-pair contrast calculations (sRGB WCAG relative luminance): text/page **16.05:1**, muted/page **8.08:1**, text/game **15.15:1**, muted/game **7.63:1**, muted/raised **7.05:1**, navy/gold button **11.56:1**, navy/mint wake banner **11.02:1**, gold/center lane **10.32:1**, miss/game **8.26:1**, mint/game **10.41:1**, warm/page **8.82:1**. These calculations use the actual declared solid colors; they do not fill the composite-image measurement gap above.

## Findings, corrections and rechecks

| Severity / source | Observed issue and correction | Recheck |
| --- | --- | --- |
| High — `src/style.css:122`, `src/app.js:228` | At 360 × 800 the key area extended below the viewport. Stable board sizing and a single pre-countdown scroll now place the entire target area in view | Actual 360 px touch produced one Perfect catch and 100 points |
| Medium — `src/app.js:376` | Opening Help during play initially returned focus to Resume; native wrapping briefly reached the body. Preserve Help as the native return target and explicitly wrap Tab/Shift-Tab among dialog controls | Keyboard walk and return-focus assertions passed |
| High — `src/style.css:66`, `src/style.css:106`, `src/style.css:198` | Enlarged brand/score text initially overflowed, while an absolute companion caption overlapped its heading. Header wraps, score uses auto-fit rem columns, caption uses grid flow, and board/overlay bounds grow with text | 200% text screenshot inspected; no horizontal overflow, caption/rules/action remain readable |
| Medium — `index.html:57`, `src/app.js:171` | Six short tagline-like fragments competed with the game. Keep the companion title and use direct descriptive copy elsewhere | taste@1 slogans: one; all 16 checks pass |
| Medium — `src/model.js:171` | At high RPM, live seeds could reach the line before input began. First target is bounded to 0.55 s after the countdown, including RPM changes during countdown | Dedicated tests at 1, 90, 180 and extreme RPM passed with no pre-run misses |
| Medium — `src/model.js:35` | A numeric timestamp outside the JavaScript Date range could reach a later date formatter. Reject out-of-range milliseconds | Invalid timestamps and malformed-data fuzz passed |
| Medium — `src/audio.js:11`, `src/app.js:386` | WebKit's headless audio resume could remain pending. Bound resume to 2 s, disable/re-enable the toggle while pending and announce silent fallback | Chromium enable/mute passed; actual WebKit unavailable-audio recovery passed |
| Low — `src/app.js:340` | A canvas resize could briefly leave an empty black frame before the next animation frame, visible under a stopped test clock | Resize now redraws immediately without advancing game time; gold-line pixel and rendered gameplay passed |

`DESIGN.md` was written from the final tokens, CSS geometry and actual components after corrections. The share metadata, first-screen Start action and clean export were rechecked after the last runtime source change. There are no unresolved observed primary-interaction failures. The daily-global-identity limit and manual/native-device checks above remain explicit limitations.
