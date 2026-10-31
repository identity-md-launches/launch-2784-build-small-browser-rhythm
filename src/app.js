import { RULES, RhythmGame, parseStatus, parseTrack, calmTrack, liveMode, numeric, record, clamp } from './model.js';
import { TrackRenderer, drawHamster } from './render.js';
import { GameAudio } from './audio.js';

const API = 'https://api.squeekchain.com/v1';
const STORAGE = { best: 'wheel-rhythm:best:v1', track: 'wheel-rhythm:replay:v1' };
/** @param {string} id */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node;
}
/** @param {string} id */
function button(id) { return /** @type {HTMLButtonElement} */ (element(id)); }
/** @param {string} key */
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
/** @param {string} key @param {string} value */
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
/** @param {string} message */
function announce(message) { element('announcer').textContent = message; }
/** @param {number} value */
function scoreText(value) { return String(value).padStart(5, '0'); }
function utcDay() { return new Date().toISOString().slice(0, 10); }

const trackCanvas = /** @type {HTMLCanvasElement} */ (element('track'));
const hamsterCanvas = /** @type {HTMLCanvasElement} */ (element('hamster'));
const renderer = new TrackRenderer(trackCanvas);
const audio = new GameAudio();
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const helpDialog = /** @type {HTMLDialogElement} */ (element('help-dialog'));
const laneControls = element('lane-controls');
const lanes = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('.lane-button')]);
const progress = /** @type {HTMLProgressElement} */ (element('block-progress'));
const strip = element('hour-strip');
const hourBars = Array.from({ length: 24 }, () => {
  const span = document.createElement('span'); span.setAttribute('aria-hidden', 'true'); strip.append(span); return span;
});
/** @type {import('./model.js').Reading | null} */
let reading = null;
let connection = 'connecting';
let replay = calmTrack(utcDay());
let trackLoading = true;
/** @type {'ready' | 'playing' | 'paused' | 'over'} */
let state = 'ready';
/** @type {RhythmGame | null} */
let game = null;
let best = clamp(Math.trunc(numeric(readStorage(STORAGE.best)) ?? 0), 0, 1e9);
let storageAvailable = true;
let lastFrame = performance.now();
let lastHamsterFrame = -Infinity;
let lastHud = -Infinity;
let lastSection = -1;
let lastHudSignature = '';
let lastQuiet = false;
let judgementUntil = -Infinity;
let wakeTimeout = 0;
let starting = false;
let mixedRun = false;
/** @type {AbortController[]} */
const pending = [];

element('best').textContent = scoreText(best);

/** @param {string} endpoint @returns {Promise<unknown>} */
async function fetchJSON(endpoint) {
  const controller = new AbortController(); pending.push(controller);
  const timeout = window.setTimeout(() => controller.abort(), RULES.requestTimeoutMs);
  try {
    const response = await fetch(`${API}/${endpoint}`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return /** @type {unknown} */ (await response.json());
  } finally {
    clearTimeout(timeout);
    const index = pending.indexOf(controller); if (index >= 0) pending.splice(index, 1);
  }
}

async function pollStatus() {
  try {
    const raw = await fetchJSON('status');
    const fresh = parseStatus(raw, reading, Date.now());
    if (!fresh) throw new Error('Stale or incomplete measurement');
    reading = fresh; connection = 'online';
  } catch { connection = 'offline'; }
  updateStatus();
}

function updateStatus() {
  const isLive = liveMode(reading);
  const badge = element('connection-badge');
  badge.hidden = connection !== 'offline';
  badge.textContent = reading ? 'offline, last data' : 'offline, no data yet';
  element('core-status').textContent = reading?.coreStatus ?? (connection === 'connecting' ? 'Connecting' : 'Unavailable');
  element('status-pill').classList.toggle('spinning', isLive);
  element('rpm').textContent = reading ? (reading.rpmMilli / 1000).toFixed(1) : '–';
  element('block-height').textContent = reading?.blockHeight !== null && reading?.blockHeight !== undefined ? `Block #${reading.blockHeight}` : 'Block pending';
  progress.value = reading?.blockProgress ?? 0;
  element('block-percent').textContent = reading?.blockProgress !== null && reading?.blockProgress !== undefined ? `${Math.round(reading.blockProgress * 100)}%` : '–';
  if (game && (state === 'playing' || state === 'paused')) {
    const changed = game.setMode(isLive, reading?.rpmMilli ?? 0);
    if (changed) {
      mixedRun = true;
      if (isLive) showWake();
      else announce('The hamster is resting. Your run continues in replay mode at a one-times multiplier.');
      lastSection = -1;
    }
  }
  updateMode();
}

async function loadReplay() {
  trackLoading = true;
  updateTrackBadge();
  const day = utcDay();
  try {
    const stored = readStorage(STORAGE.track);
    if (stored) {
      const cache = record(JSON.parse(stored));
      const cached = cache.day === day ? parseTrack(cache.raw, day) : null;
      if (cached) { replay = cached; return; }
    }
  } catch { /* A damaged or blocked cache must never stop a run. */ }
  try {
    const raw = await fetchJSON('settlements?range=24h');
    const parsed = parseTrack(raw, day);
    if (!parsed) throw new Error('Incomplete 24-hour track');
    replay = parsed;
    // Retain only gameplay fields, not the unrelated chain/account metadata in the response.
    const source = record(raw);
    const rawBuckets = /** @type {unknown[]} */ (source.buckets);
    const safeRaw = {
      buckets: rawBuckets.map((item) => {
        const b = record(item); return { workAdded: b.workAdded, settlementCount: b.settlementCount, startAt: b.startAt };
      }),
      window: { startAt: record(source.window).startAt },
    };
    writeStorage(STORAGE.track, JSON.stringify({ day, raw: safeRaw }));
  } catch { replay = calmTrack(day); }
  finally {
    trackLoading = false;
    if (!game || state === 'ready' || state === 'over') updateTrack();
  }
}

function currentTrack() { return game && state !== 'ready' ? game.track : replay; }
function updateTrackBadge() {
  const badge = element('track-badge');
  const track = currentTrack();
  const live = game && (state === 'playing' || state === 'paused') ? game.mode === 'live' : liveMode(reading);
  badge.hidden = live || (!trackLoading && !track.offline && !track.practice);
  badge.textContent = trackLoading ? 'loading track' : track.practice ? 'calm practice' : 'offline track';
}

function updateTrack() {
  const track = currentTrack();
  const highest = Math.max(1, ...track.buckets.map((b) => b.workAdded));
  track.buckets.forEach((bucket, i) => {
    hourBars[i].style.setProperty('--bar-height', `${bucket.workAdded ? 7 + Math.sqrt(bucket.workAdded / highest) * 11 : 3}px`);
    hourBars[i].className = '';
    const hour = bucket.startAt === null ? `Section ${i + 1}` : `${new Date(bucket.startAt).toISOString().slice(11, 16)} UTC`;
    hourBars[i].title = `${hour}: ${bucket.workAdded} work, ${bucket.settlementCount} settlements`;
  });
  strip.setAttribute('aria-label', `24 hourly sections. ${track.buckets.filter((b) => b.workAdded > 0).length} active hours, ${track.buckets.filter((b) => b.workAdded === 0).length} rest hours. ${track.offline || track.practice ? 'Built-in calm practice track.' : 'Actual Squeekchain activity.'}`);
  element('track-id').textContent = `${track.offline || track.practice ? 'Calm practice' : 'Replay'} · ${track.day} · ${track.id}`;
  element('section-label').textContent = track.allQuiet ? 'A full day of rest on the wheel' : 'His day in 24 short sections';
  if (state === 'ready') updateMode();
  lastSection = -1;
  updateTrackBadge();
}

function updateMode() {
  const isLive = game && (state === 'playing' || state === 'paused') ? game.mode === 'live' : liveMode(reading);
  const practice = !!game?.track.practice && state !== 'ready';
  if (state === 'ready') {
    const quietDay = replay.allQuiet && !isLive;
    element('start-title').textContent = quietDay ? 'A sleepy day.' : 'Ready to roll?';
    element('start-label').textContent = quietDay ? 'Play calm practice' : 'Start playing';
  }
  element('mode-label').textContent = isLive ? 'Live' : practice ? 'Calm practice' : 'Replay of the last 24 hours';
  element('mode-description').textContent = isLive ? (connection === 'offline' ? 'Last wheel rhythm; reconnecting automatically.' : 'His real wheel speed sets the rhythm.') : practice ? 'Built-in seeds for a very sleepy day.' : replay.allQuiet ? 'All 24 hours were quiet; try calm practice.' : 'Hamster asleep; replaying his wheel activity.';
  element('mode-dot').classList.toggle('live', isLive);
  element('multiplier').textContent = isLive ? '×2' : '×1';
  element('multiplier').classList.toggle('live', isLive);
  strip.classList.toggle('live', isLive);
  element('hamster-caption').textContent = isLive ? 'Little paws at full speed.' : 'Resting between runs.';
  hamsterCanvas.setAttribute('aria-label', isLive ? 'An original pixel-art hamster running inside a golden wheel' : 'An original pixel-art hamster sleeping inside a golden wheel');
  updateTrackBadge();
}

function showWake() {
  element('wake-banner').hidden = false;
  clearTimeout(wakeTimeout);
  wakeTimeout = window.setTimeout(() => { element('wake-banner').hidden = true; }, 2800);
  audio.play('wake');
  announce('He is running! Switched to live mode. Catches now score double. Your score and combo continue.');
}

/** @param {'start' | 'pause' | 'end' | null} screen */
function showScreen(screen) {
  element('overlay').hidden = screen === null;
  element('start-screen').hidden = screen !== 'start';
  element('pause-screen').hidden = screen !== 'pause';
  element('end-screen').hidden = screen !== 'end';
  laneControls.inert = screen !== null;
}

async function startRun() {
  if (starting || state === 'playing' || state === 'paused') return;
  starting = true;
  const trigger = state === 'over' ? button('again') : button('start');
  trigger.disabled = true;
  trigger.setAttribute('aria-busy', 'true');
  if (replay.day !== utcDay() || (state === 'over' && replay.offline)) trackReady = loadReplay();
  await trackReady;
  const runTrack = replay.allQuiet && !liveMode(reading) ? calmTrack(replay.day, true) : replay;
  game = new RhythmGame(runTrack, liveMode(reading), reading?.rpmMilli ?? 0);
  state = 'playing'; mixedRun = false; lastFrame = performance.now(); lastHud = -Infinity;
  judgementUntil = -Infinity; lastQuiet = false;
  element('judgement').textContent = '';
  element('rest-label').hidden = true;
  renderer.particles = []; renderer.flashes = [0, 0, 0];
  showScreen(null);
  button('pause').disabled = false;
  trigger.disabled = false; trigger.removeAttribute('aria-busy'); starting = false;
  updateTrack(); updateMode(); updateHUD();
  element('bottom-hint').textContent = 'A S D or arrows · Tap any lane';
  button('pause').focus({ preventScroll: true });
  // Put the entire hit line and key area on screen before the countdown on short phones.
  const field = element('playfield');
  if (matchMedia('(max-width: 700px)').matches && field.getBoundingClientRect().bottom > innerHeight - 8) field.scrollIntoView({ block: 'end', behavior: 'instant' });
  if (game.mode === 'live') showWake();
  announce('Get ready. Catch seeds at the gold line. Your 72-second run is starting.');
}

function pauseRun() {
  if (state !== 'playing') return;
  state = 'paused'; showScreen('pause');
  button('pause').disabled = true;
  element('judgement').textContent = '';
  button('resume').focus({ preventScroll: true });
  announce('Game paused. Resume when you are ready.');
}
function resumeRun() {
  if (state !== 'paused' || helpDialog.open) return;
  state = 'playing'; lastFrame = performance.now(); showScreen(null);
  button('pause').disabled = false; button('pause').focus({ preventScroll: true });
  announce('Game resumed.');
}

function endRun() {
  if (!game || (state !== 'playing' && state !== 'paused')) return;
  const wasBest = game.score > best;
  best = Math.max(best, game.score);
  storageAvailable = writeStorage(STORAGE.best, String(best));
  game.ended = true;
  state = 'over'; showScreen('end'); button('pause').disabled = true;
  element('wake-banner').hidden = true; element('rest-label').hidden = true;
  element('judgement').textContent = '';
  element('end-title').textContent = wasBest ? 'A new little best!' : 'Nice little run.';
  element('end-score').textContent = game.score.toLocaleString('en-US');
  element('end-best').textContent = `${storageAvailable ? 'Best on this device' : 'Best this visit (storage unavailable)'}: ${best.toLocaleString('en-US')}`;
  element('perfect-count').textContent = String(game.perfect);
  element('good-count').textContent = String(game.good);
  element('miss-count').textContent = String(game.miss);
  element('end-combo').textContent = `Top combo: ${game.maxCombo}×${mixedRun ? ' · Mixed replay + live run' : ''}`;
  element('best').textContent = scoreText(best);
  element('bottom-hint').textContent = 'A little better, one seed at a time.';
  button('again').focus({ preventScroll: true });
  announce(`Run complete. Score ${game.score}. Best ${best}. ${game.perfect} perfect, ${game.good} good, ${game.miss} misses. Play again when ready.`);
  updateHUD();
}

/** @param {number} lane */
function hitLane(lane) {
  if (state !== 'playing' || !game || helpDialog.open) return;
  lanes[lane].classList.add('pressed');
  window.setTimeout(() => lanes[lane].classList.remove('pressed'), 110);
  renderer.flashes[lane] = .1;
  game.hit(lane);
  processEvents(); updateHUD();
}

function processEvents() {
  if (!game) return;
  for (const event of game.drainEvents()) {
    if (event.kind === 'end') { endRun(); continue; }
    element('judgement').textContent = event.kind === 'perfect' ? 'Perfect!' : event.kind === 'good' ? 'Good!' : 'Miss';
    element('judgement').className = `judgement ${event.kind}`;
    judgementUntil = game.elapsed + .55;
    renderer.hit(event.lane, event.kind, reducedQuery.matches);
    audio.play(event.kind);
  }
}

function updateHUD() {
  if (!game) return;
  const signature = `${game.score}/${game.combo}/${Math.ceil(RULES.duration - Math.max(0, game.elapsed))}`;
  if (signature !== lastHudSignature) {
    element('score').textContent = scoreText(game.score);
    element('combo').replaceChildren(document.createTextNode(String(game.combo)), Object.assign(document.createElement('span'), { className: 'combo-unit', textContent: '×' }));
    const remaining = Math.max(0, Math.ceil(RULES.duration - Math.max(0, game.elapsed)));
    element('time').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    lastHudSignature = signature;
  }
  if (game.section !== lastSection) {
    lastSection = game.section;
    const bucket = game.track.buckets[lastSection];
    const hour = bucket.startAt === null ? 'Section' : `${new Date(bucket.startAt).toISOString().slice(11, 16)} UTC`;
    element('section-label').textContent = game.mode === 'live' ? 'Following the wheel in real time' : `${hour} · ${lastSection + 1} / 24${bucket.workAdded === 0 ? ' · Rest' : ''}`;
    hourBars.forEach((bar, i) => { bar.classList.toggle('active', i === lastSection); bar.classList.toggle('done', i < lastSection); });
  }
  const quiet = game.quiet && state === 'playing';
  if (quiet !== lastQuiet) {
    lastQuiet = quiet; element('rest-label').hidden = !quiet;
    if (quiet) {
      const remainingActive = game.track.buckets.slice(game.section + 1).some((b) => b.workAdded > 0);
      element('rest-description').textContent = remainingActive ? 'Rest your paws while the next hour arrives.' : 'A sleepy finish while the last seeds fall.';
    }
  }
}

/** @param {number} now */
function frame(now) {
  const rawDelta = (now - lastFrame) / 1000;
  lastFrame = now;
  if (state === 'playing' && game) {
    if (rawDelta > 1) pauseRun();
    else { game.update(Math.max(0, rawDelta)); processEvents(); }
    if (game.elapsed > judgementUntil) { element('judgement').textContent = ''; judgementUntil = Infinity; }
    if (now - lastHud > 80) { updateHUD(); lastHud = now; }
  }
  renderer.draw(game && state !== 'ready' ? game : null, state === 'playing' ? Math.min(rawDelta, .1) : 0, reducedQuery.matches);
  if (now - lastHamsterFrame > 80) {
    drawHamster(hamsterCanvas, liveMode(reading), now / 1000, reducedQuery.matches || state === 'paused');
    lastHamsterFrame = now;
  }
  requestAnimationFrame(frame);
}

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const target = element('lane-controls').querySelector('.hit-target');
    const hitOffset = target ? parseFloat(getComputedStyle(target).bottom) + 8 : 80;
    renderer.resize(entry.contentRect.width, entry.contentRect.height, devicePixelRatio, hitOffset);
    renderer.draw(game && state !== 'ready' ? game : null, 0, reducedQuery.matches);
  }
});
resizeObserver.observe(element('playfield'));

lanes.forEach((lane, index) => {
  lane.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault(); hitLane(index);
  });
  // Native keyboard activation and assistive-technology clicks have detail === 0.
  lane.addEventListener('click', (event) => { if (event.detail === 0) hitLane(index); });
});
const keys = /** @type {Record<string, number>} */ ({ a: 0, s: 1, d: 2, arrowleft: 0, arrowdown: 1, arrowright: 2 });
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || helpDialog.open) return;
  const key = event.key.toLowerCase();
  if ((key === 'p' || key === 'escape') && !event.repeat) {
    if (state === 'playing') { event.preventDefault(); pauseRun(); }
    else if (state === 'paused') { event.preventDefault(); resumeRun(); }
    return;
  }
  if (keys[key] !== undefined && state === 'playing') {
    event.preventDefault(); if (!event.repeat) hitLane(keys[key]);
  }
});
button('start').addEventListener('click', () => { void startRun(); });
button('again').addEventListener('click', () => { void startRun(); });
button('pause').addEventListener('click', pauseRun);
button('resume').addEventListener('click', resumeRun);
button('end-run').addEventListener('click', endRun);
button('help').addEventListener('click', () => { pauseRun(); button('help').focus({ preventScroll: true }); helpDialog.showModal(); });
button('close-help').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('close', () => button('help').focus({ preventScroll: true }));
helpDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const stops = /** @type {HTMLElement[]} */ ([...helpDialog.querySelectorAll('button:not(:disabled), a[href]')]);
  const first = stops[0], last = stops[stops.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === helpDialog)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === helpDialog)) { event.preventDefault(); first.focus(); }
});
button('sound').addEventListener('click', async () => {
  button('sound').disabled = true;
  button('sound').setAttribute('aria-busy', 'true');
  try {
    const enabled = await audio.toggle();
    button('sound').setAttribute('aria-pressed', String(enabled));
    button('sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
    button('sound').title = enabled ? 'Mute sound' : 'Enable sound';
    element('sound-wave').setAttribute('d', enabled ? 'M15 8a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
    announce(enabled ? 'Sound enabled.' : 'Sound muted.');
  } catch { announce('Sound is unavailable in this browser. The game is ready to play silently.'); }
  finally { button('sound').disabled = false; button('sound').removeAttribute('aria-busy'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
window.addEventListener('blur', () => { if (!helpDialog.open) pauseRun(); });
window.addEventListener('pagehide', () => { pauseRun(); pending.forEach((controller) => controller.abort()); });

// Both feeds load independently. Play never depends on either service being reachable.
let trackReady = loadReplay().finally(() => { trackLoading = false; updateTrackBadge(); if (state === 'ready') updateTrack(); });
void pollStatus();
window.setInterval(() => {
  if (reading && Date.now() - reading.observedAt > reading.staleAfterSeconds * 1000) { connection = 'offline'; updateStatus(); }
  void pollStatus();
}, RULES.pollMs);
updateTrack(); updateMode();
requestAnimationFrame(frame);
