# Wheel Rhythm design system

## Overview

Wheel Rhythm is a compact arcade game for keyboard and touch players. A midnight navy surface, warm seed colors and an original pixel hamster carry the visual identity. The game and Start action share the first mobile screen. Data, score and current section sit immediately above the lanes; instructional copy stays beside the relevant controls.

The implementation is `index.html`, `src/style.css`, `src/app.js` and the canvas drawing code in `src/render.js`. There are no UI or font dependencies.

## Colors

Canonical CSS values are in `src/style.css:1`. Primitives supply semantic roles; components use roles. Canvas artwork uses a matching local `ART` palette in `src/render.js`.

| Semantic token | Primitive / value | Use |
| --- | --- | --- |
| `--color-bg` | `--navy-950`, `#101522` | Page and text on filled actions |
| `--color-surface` | `--navy-900`, `#151b29` | Game surface and opaque in-board screens |
| `--color-raised` | `--navy-850`, `#1b2232` | Keycaps, utility hover, dialog |
| `--color-hover` | `--navy-800`, `#242d40` | Neutral progress track |
| `--color-border` | `--navy-700`, `#38435a` | Structural separators and lane dividers |
| `--color-text` | `--cream-100`, `#f6f0e3` | Main text and scores |
| `--color-muted` | `--slate-300`, `#a4adc0` | Descriptions and small metadata |
| `--color-accent` | `--gold-400`, `#f7c767` | Primary action, targets, seed, current hour |
| `--color-wheel` | `--gold-600`, `#b98837` | Wheel art and completed hours, not body text |
| `--color-warm` | `--orange-400`, `#f4a16d` | Seed variation and offline badge |
| `--color-live` | `--mint-400`, `#9dd6b3` | Live status and good judgement |
| `--color-miss` | `--red-400`, `#f49c9c` | Miss judgement |
| `--color-focus` | `--gold-400`, `#f7c767` | 2 px keyboard outline, 5 px offset |

The primary button hover uses `#ffda8c`. Canvas-only detail colors define fur, wheel spokes, cheeks and tiny background pixels; they are decorative, not text roles. Status and feedback always include words alongside color. There is one dark theme, as requested.

Computed solid-token contrast includes muted/page **8.08:1**, muted/game **7.63:1**, text/game **15.15:1**, and navy/primary-gold **11.56:1**. See validation for the measured pairs and the canvas/overlay coverage limitations.

## Typography

`--font-body`: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Prose and controls use the local system face. `--font-game`: `"Courier New", ui-monospace, monospace`, reserved for score, combo, timer, RPM and keycaps. No font downloads occur.

The six declared sizes are `--text-caption` **13 px**, `--text-body` **16 px**, `--text-small-heading` **20 px**, `--text-heading` **24 px**, `--text-title` **32 px**, and `--text-display` **48 px**, expressed in rem. The 48 px role is the final score; the initial screen uses fewer sizes. Weights are 400, 600 and 700. System font availability determines the final local glyph shapes.

Body line height is 1.5; descriptions and help use 1.6. Headings use 1.15, companion heading 1.2 on phones, numeric displays 1.3, and keycaps 1.2. The brand uses −0.03em tracking (−0.035em on phones), the companion heading −0.035em, overlay headings −0.02em. Ordinary content has natural tracking. Headings balance; prose uses pretty wrapping. Changing numbers use tabular digits. Long values wrap rather than being ellipsized. The document remains zoomable.

## Layout

`.app-shell` caps the page at **1120 px**, with **24 px** side padding. The desktop `.game-layout` is a **320 px** companion column plus the flexible game, with **64 px** gap and **36 / 28 px** block padding. The principal space rhythm is 4, 8, 12, 16, 20, 24, 28, 32 and 64 px; component-specific values preserve the arcade geometry.

- At **960 px** and below, columns become 0.7fr / 1.3fr and the gap is 32 px. The footer track ID takes a second row.
- At **700 px** and below, the shell caps at 540 px with 20 px gutters. The header is at least 78 px tall; telemetry becomes two rows. The companion becomes a small two-row grid with a **124 × 108 px** canvas beside its heading/caption. Its supporting paragraph and lower note disappear, while the game remains directly below.
- At **359 px** and below, gutters become 12 px, the brand becomes 16 px, and utility controls retain 48 px targets.

The scoreboard uses `repeat(auto-fit, minmax(min(100%, 4rem), 1fr))`: four columns at normal mobile size, fewer with enlarged text. The header wraps its utilities when necessary. Companion caption stays in normal grid flow, so enlarged text does not overlap the heading.

The desktop playfield is **426 px** tall. Phones use `clamp(382px, calc(100svh - 460px), 426px)`. Every state retains a minimum `calc(23rem + 14px)` height; this grows with text enlargement and avoids a board resize on Start/Pause. On a short phone, Start places the whole hit line/key area in view before the countdown. The hit target is `calc(40px + 2rem)` above the bottom; the canvas takes that actual computed position as its timing line. The in-board overlay leaves `calc(68px + 2rem)` below it so enlarged text still leaves the hit line visible.

Observed widths: 320, 360, 390, 700, 768, 1024 and 1440 px. See validation for text enlargement and browser limitations.

## Elevation & Depth

The system is flat. Lines communicate structure; there are no elevated cards or gradients. Game start/pause/results use an opaque game-surface overlay inside the same board. Canvas is the base, full-lane buttons are layer 2, judgement layer 3, screens layer 4, and the wake banner layer 5. The native help dialog uses the browser top layer with a `#080b13d9` backdrop. The small decorative moon uses a 3 px shadow as a pixel cutout; this is not surface elevation.

## Shapes

Pixels and simple rectangles lead. The board has 8 px top corners and 4 px bottom corners; primary actions use 6 px, keycaps and status pills 4 px, numbered rule tiles and hit targets 3 px, the dialog 12 px. Keycaps have a 3 px bottom border. The local SVG favicon, raster share card, wheel and hamster sprite use crisp pixel edges. There are no third-party characters.

## Components

| Pattern | Source | States / behavior |
| --- | --- | --- |
| Brand and utility controls | `index.html`, `.brand`, `.utility` | Name on left; 48 px sound/help controls on right. Sound is muted by default and exposes its pressed state |
| Telemetry | `.telemetry`, `updateStatus()` | Connecting, fresh IDLE/SPINNING, stale/failed last data. Native labeled progress element and stable number roles |
| Mode row | `.mode-row`, `updateMode()` | Replay ×1, Live ×2, or explicitly labeled quiet-day practice. Offline status remains visible in the header |
| Scoreboard | `.scoreboard`, `updateHUD()` | Score, combo, best and time; updates only on relevant value changes. Miss resets combo |
| Activity strip | `.hour-strip`, `updateTrack()` | 24 proportional work bars; current hour has gold outline, completed hours bronze, live state mint. A textual UTC section label and accessible summary explain it |
| Lane controls | `.lane-controls`, `hitLane()` | Three native full-height buttons; pointer down for immediate touch/mouse input, native click for keyboard/assistive activation. Pointer-generated click is not scored twice. A/S/D and arrows also work globally during play |
| Game screens | `.game-overlay`, `showScreen()` | Start has three rules and one gold action. Pause offers Resume and End this run. Results show score, local best, timing counts and top combo. Underlying lane buttons are inert |
| Help dialog | `#help-dialog`, `src/app.js` | Native modal, Escape dismissal, bounded scrolling, explicit Tab wrapping and focus return to Help. Opening during play pauses the game |
| Wake and judgement | `.wake-banner`, `.judgement` | Text and color feedback. Wake stays for 2.8 s; catch/miss feedback for 0.55 game seconds. A stable polite live region announces game/mode/result changes |
| Art and particles | `src/render.js` | Canvas notes use animation frames; pixel companion redraws at roughly 12 fps. Reduced motion removes wheel rotation, hamster bounce, drifting sleep glyphs, background scrolling and particles; falling notes remain essential gameplay |

Hover effects are enabled only on hover-capable devices. Interactive transitions list exact properties and last 120 ms; the one-shot wake entrance is 360 ms. Button press scales to 0.96 only with no reduced-motion preference. Forced colors retain a system Highlight focus ring and explicit button/target borders.

## Do's and Don'ts

- Reuse semantic tokens and the six type roles. Keep prose sans-serif and changing game numbers monospaced.
- Keep one filled primary action in a game screen; keep the utility controls at least 48 px.
- Derive gameplay feedback from actual API or engine state. Label fallback/practice data and retain the visible track ID.
- Preserve the three equal lanes, the computed hit-line geometry, and the fixed board geometry across screen states.
- Keep DOM measurements out of the animation loop; use the resize observer. Do not add external runtime assets or tracking.
- For another supporting screen, reuse `.app-shell`, the header, text roles and button patterns. Keep it within this single page or use a hash so static hosting needs no rewrite rules.

Design guidance: Jakub Krehel's Better Interface (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and the documentation method adapted from Paul Bakaus's Impeccable (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). See `artifacts/design-guidance-LICENSE.txt` for retained license notices.
