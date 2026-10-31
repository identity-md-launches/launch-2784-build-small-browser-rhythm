import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { preview } from '../scripts/preview.mjs';
import { parseTrack, replayNotes } from '../src/model.js';

const loadTool = (name, file) => import(process.env.WHEEL_TEST_TOOLS ? pathToFileURL(`${process.env.WHEEL_TEST_TOOLS}/${name}/${file}`).href : name);
const { chromium, webkit } = await loadTool('playwright', 'index.mjs');
const { default: AxeBuilder } = await loadTool('@axe-core/playwright', 'dist/index.mjs');
const output = 'test/scratch/interaction';
await mkdir(output, { recursive: true });
const server = preview(0);
await new Promise((done) => server.on('listening', done));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const fixed = new Date('2026-10-31T12:00:00.000Z');
const feed = { window: { startAt: '2026-10-30T12:00:00Z' }, buckets: Array.from({ length: 24 }, (_, i) => ({ workAdded: String(i % 5 === 4 ? 0 : 30 + i * 15), settlementCount: String(i % 5 === 4 ? 0 : i % 6 + 1), startAt: new Date(+fixed - (24 - i) * 3600000).toISOString() })) };
const notes = replayNotes(parseTrack(feed, '2026-10-31'));
const results = [];
const consoleErrors = [];
let failures = 0;

async function check(name, action) {
  try { const detail = await action(); results.push({ name, passed: true, detail: detail ?? '' }); console.log(`PASS ${name}`); }
  catch (error) { failures++; results.push({ name, passed: false, detail: String(error.stack ?? error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
function rawStatus(options = {}) {
  return { measurement: { rpmMilli: options.live ? '90000' : '0', coreStatus: options.live ? 'SPINNING' : 'IDLE', freshness: options.stale ? 'stale' : 'online', staleAfterSeconds: '120', observedAt: fixed.toISOString() }, builder: { anchor: { blockHeight: '5204', blockProgress: '637347328' } } };
}

async function makePage(browser, { width = 390, height = 844, touch = false, offline = false, badStorage = false, quietDay = false, controlledClock = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, reducedMotion: 'reduce' });
  if (badStorage) await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value: () => { throw new Error('Storage denied'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('Storage denied'); } });
  });
  const page = await context.newPage();
  const remote = { live: false, stale: false, offline, statusRequests: 0, settlementRequests: 0 };
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => { if (response.url().startsWith(base) && response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`); });
  if (controlledClock) { await page.clock.install({ time: fixed }); await page.clock.pauseAt(fixed); }
  await page.route('https://api.squeekchain.com/**', async (route) => {
    if (route.request().url().includes('/status')) remote.statusRequests++; else remote.settlementRequests++;
    if (remote.offline) return route.abort();
    const activity = quietDay ? { ...feed, buckets: feed.buckets.map((b) => ({ ...b, workAdded: '0', settlementCount: '0' })) } : feed;
    const status = rawStatus(remote);
    if (!controlledClock) status.measurement.observedAt = new Date().toISOString();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route.request().url().includes('/status') ? status : activity) });
  });
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById('core-status')?.textContent !== 'Connecting');
  await page.waitForFunction(() => document.getElementById('track-badge')?.textContent !== 'loading track');
  if (controlledClock) await page.clock.runFor(32); else await page.waitForTimeout(32);
  return { context, page, remote };
}

let chromiumBrowser;
try {
  chromiumBrowser = await chromium.launch();
  await check('Initial product and Start action at 390; complete local metadata', async () => {
    const { context, page } = await makePage(chromiumBrowser);
    const start = await page.locator('#start').boundingBox();
    assert.ok(start.y >= 0 && start.y + start.height <= 844, JSON.stringify(start));
    assert.equal(await page.locator('#core-status').textContent(), 'IDLE');
    assert.equal(await page.locator('#rpm').textContent(), '0.0');
    assert.equal(await page.locator('#block-height').textContent(), 'Block #5204');
    assert.equal(await page.locator('#block-progress').getAttribute('value'), '0.637347328');
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    for (const selector of ['title', 'link[rel="icon"]', 'meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:image"]']) assert.equal(await page.locator(selector).count(), 1);
    await page.screenshot({ path: `${output}/390-ready.png`, fullPage: true });
    await context.close();
  });

  await check('Actual keyboard catches, miss resets combo, pause/help/resume, sound, finish, saved best and restart', async () => {
    const { context, page } = await makePage(chromiumBrowser, { width: 1440, height: 1000 });
    await page.locator('#start').click();
    await page.clock.runFor((2.4 + notes[0].hitAt) * 1000);
    await page.keyboard.press(['a', 's', 'd'][notes[0].lane]);
    assert.equal(await page.locator('#score').textContent(), '00100');
    assert.equal((await page.locator('#combo').textContent()).trim(), '1×');
    await page.keyboard.press(['ArrowLeft', 'ArrowDown', 'ArrowRight'][(notes[0].lane + 1) % 3]);
    assert.equal(await page.locator('#combo').textContent(), '0×');
    await page.clock.runFor((notes[1].hitAt - notes[0].hitAt + .1) * 1000);
    await page.keyboard.press(['ArrowLeft', 'ArrowDown', 'ArrowRight'][notes[1].lane]);
    assert.equal(await page.locator('#score').textContent(), '00150');
    assert.equal(await page.locator('#combo').textContent(), '1×');
    await page.screenshot({ path: `${output}/1440-playing.png`, fullPage: true });
    await page.keyboard.press('p');
    assert.equal(await page.locator('#pause-screen').isVisible(), true);
    const time = await page.locator('#time').textContent();
    await page.clock.runFor(2000); assert.equal(await page.locator('#time').textContent(), time);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#overlay').isVisible(), false);
    await page.locator('#help').click();
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    assert.equal(await page.locator('#pause-screen').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#help-dialog').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'help');
    await page.locator('#resume').click();
    await page.locator('#sound').click(); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await page.locator('#sound').click(); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    await page.clock.runFor(76000);
    assert.equal(await page.locator('#end-screen').isVisible(), true);
    assert.equal(await page.locator('#end-score').textContent(), '150');
    assert.equal(await page.locator('#perfect-count').textContent(), '1');
    assert.equal(await page.locator('#good-count').textContent(), '1');
    assert.ok(Number(await page.locator('#miss-count').textContent()) > 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('wheel-rhythm:best:v1')), '150');
    await page.screenshot({ path: `${output}/1440-finished.png`, fullPage: true });
    await page.locator('#again').click(); assert.equal(await page.locator('#score').textContent(), '00000'); assert.equal(await page.locator('#combo').textContent(), '0×');
    await page.reload(); assert.equal(await page.locator('#best').textContent(), '00150');
    await context.close();
  });

  await check('Touch anywhere in a lane catches once, without a duplicate click miss', async () => {
    const { context, page } = await makePage(chromiumBrowser, { width: 360, height: 800, touch: true });
    await page.locator('#start').tap();
    await page.clock.runFor((2.4 + notes[0].hitAt) * 1000);
    const lane = await page.locator(`.lane-button[data-lane="${notes[0].lane}"]`).boundingBox();
    await page.touchscreen.tap(lane.x + lane.width / 2, lane.y + lane.height - 40);
    assert.equal(await page.locator('#score').textContent(), '00100');
    assert.equal(await page.locator('#combo').textContent(), '1×');
    assert.equal(await page.locator('#judgement').textContent(), 'Perfect!');
    await page.screenshot({ path: `${output}/360-touch.png`, fullPage: true });
    await context.close();
  });

  await check('5-second polls, mid-run wake-up preserves score/combo, ×2 live, sleep, stale/failure keeps last good values', async () => {
    const { context, page, remote } = await makePage(chromiumBrowser);
    await page.locator('#start').click();
    await page.clock.runFor((2.4 + notes[0].hitAt) * 1000);
    await page.keyboard.press(['a', 's', 'd'][notes[0].lane]);
    await page.keyboard.press('p');
    const time = await page.locator('#time').textContent();
    remote.live = true;
    await page.clock.runFor(2300);
    await page.waitForFunction(() => document.getElementById('core-status').textContent === 'SPINNING');
    assert.equal(remote.statusRequests, 2);
    assert.equal(await page.locator('#mode-label').textContent(), 'Live');
    assert.equal(await page.locator('#multiplier').textContent(), '×2');
    assert.equal(await page.locator('#score').textContent(), '00100');
    assert.equal(await page.locator('#combo').textContent(), '1×');
    assert.equal(await page.locator('#time').textContent(), time);
    assert.equal(await page.locator('#wake-banner').isVisible(), true);
    await page.screenshot({ path: `${output}/390-wake.png`, fullPage: true });
    remote.offline = true;
    await page.clock.runFor(5000);
    await page.waitForFunction(() => !document.getElementById('connection-badge').hidden);
    assert.equal(await page.locator('#rpm').textContent(), '90.0');
    assert.equal(await page.locator('#block-height').textContent(), 'Block #5204');
    assert.equal(await page.locator('#connection-badge').textContent(), 'offline, last data');
    remote.offline = false; remote.stale = true;
    await page.clock.runFor(5000); assert.equal(await page.locator('#rpm').textContent(), '90.0');
    remote.stale = false; remote.live = false;
    await page.clock.runFor(5000);
    await page.waitForFunction(() => document.getElementById('core-status').textContent === 'IDLE');
    assert.equal(await page.locator('#multiplier').textContent(), '×1');
    assert.equal(await page.locator('#connection-badge').isVisible(), false);
    assert.equal(await page.locator('#score').textContent(), '00100');
    await page.locator('#resume').click();
    assert.equal(await page.locator('#overlay').isVisible(), false);
    await context.close();
  });

  await check('Fully offline and denied localStorage still produce a complete playable calm run', async () => {
    const { context, page } = await makePage(chromiumBrowser, { offline: true, badStorage: true });
    assert.equal(await page.locator('#track-badge').textContent(), 'offline track');
    assert.equal(await page.locator('#connection-badge').textContent(), 'offline, no data yet');
    await page.locator('#start').click(); await page.clock.runFor(4000);
    assert.equal(await page.locator('#overlay').isVisible(), false);
    await page.locator('#pause').click(); await page.locator('#end-run').click();
    assert.equal(await page.locator('#end-screen').isVisible(), true);
    assert.ok((await page.locator('#end-best').textContent()).includes('storage unavailable'));
    await page.screenshot({ path: `${output}/390-offline.png`, fullPage: true });
    await context.close();
  });

  await check('An entirely quiet 24 hours offers honest calm practice; daily API replay is cached on reload', async () => {
    const { context, page } = await makePage(chromiumBrowser, { quietDay: true });
    assert.equal(await page.locator('#start-label').textContent(), 'Play calm practice');
    assert.equal(await page.locator('#section-label').textContent(), 'A full day of rest on the wheel');
    await page.locator('#start').click(); await page.clock.runFor(3500);
    assert.equal(await page.locator('#mode-label').textContent(), 'Calm practice');
    assert.equal(await page.locator('#track-badge').textContent(), 'calm practice');
    assert.equal(await page.locator('#connection-badge').isVisible(), false);
    await page.screenshot({ path: `${output}/390-quiet-practice.png`, fullPage: true });
    await context.close();
    const cached = await makePage(chromiumBrowser);
    const id = await cached.page.locator('#track-id').textContent();
    assert.equal(cached.remote.settlementRequests, 1);
    await cached.page.reload();
    await cached.page.waitForFunction(() => document.getElementById('track-badge').textContent !== 'loading track');
    assert.equal(await cached.page.locator('#track-id').textContent(), id);
    assert.equal(cached.remote.settlementRequests, 1);
    await cached.context.close();
  });

  await check('Keyboard focus, dialog focus containment, reduced motion, 200% text reflow, automated accessibility', async () => {
    const { context, page } = await makePage(chromiumBrowser);
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'sound');
    const ring = await page.locator('#sound').evaluate((node) => getComputedStyle(node).outlineWidth);
    assert.equal(ring, '2px');
    await page.screenshot({ path: `${output}/390-keyboard-focus.png`, fullPage: true });
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true); }
    await page.keyboard.press('Escape');
    await page.clock.resume(); // axe schedules its own timers; do not audit a frozen browser clock.
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    await writeFile(`${output}/axe-ready.json`, JSON.stringify({ violations: audit.violations, passes: audit.passes.length }, null, 2));
    assert.deepEqual(audit.violations.map((v) => `${v.id}: ${v.nodes.length}`), []);
    assert.equal(await page.evaluate(() => document.getAnimations().filter((a) => a.effect.getTiming().iterations === Infinity && a.playState === 'running').length), 0);
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#start').isVisible(), true);
    await page.screenshot({ path: `${output}/390-text-200.png`, fullPage: true });
    await context.close();
    return `${audit.passes.length} axe rules passed; zero violations. Text enlargement is not native browser zoom.`;
  });

  await check('Responsive export and 48px controls at 320, 360, 390, 700, 768, 1024 and 1440', async () => {
    for (const width of [320, 360, 390, 700, 768, 1024, 1440]) {
      const { context, page } = await makePage(chromiumBrowser, { width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      for (const selector of ['#sound', '#help', '#start', '#pause']) {
        const bounds = await page.locator(selector).boundingBox(); assert.ok(bounds.width >= 48 && bounds.height >= 48, `${selector} at ${width}: ${JSON.stringify(bounds)}`);
      }
      if ([320, 768, 1440].includes(width)) await page.screenshot({ path: `${output}/${width}-ready.png`, fullPage: true });
      await context.close();
    }
  });

  await check('Production API integration: actual responses render defensively; local assets all load', async () => {
    const context = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('core-status').textContent !== 'Connecting', { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('track-badge').textContent !== 'loading track', { timeout: 10000 });
    const details = await page.evaluate(() => ({ status: document.getElementById('core-status').textContent, rpm: document.getElementById('rpm').textContent, block: document.getElementById('block-height').textContent, track: document.getElementById('track-id').textContent, offlineStatus: !document.getElementById('connection-badge').hidden, offlineTrack: !document.getElementById('track-badge').hidden }));
    await page.screenshot({ path: `${output}/1440-actual-api.png`, fullPage: true });
    assert.ok(details.status);
    await context.close(); return details;
  });

  await check('Actual animation frame sample and canvas hit line after resize', async () => {
    const { context, page } = await makePage(chromiumBrowser, { width: 390, height: 844, controlledClock: false });
    await page.locator('#start').click(); await page.waitForTimeout(3000);
    const timing = await page.evaluate(() => new Promise((resolve) => {
      const times = []; let previous = 0;
      const sample = (time) => {
        if (previous) times.push(time - previous); previous = time;
        if (times.length < 120) requestAnimationFrame(sample);
        else {
          const sorted = [...times].sort((a, b) => a - b);
          const canvas = document.querySelector('#track'); const ctx = canvas.getContext('2d');
          const bounds = document.querySelector('.hit-target').getBoundingClientRect();
          const canvasBounds = canvas.getBoundingClientRect(); const dpr = canvas.width / canvasBounds.width;
          const sampleY = Math.round((bounds.y + bounds.height / 2 - canvasBounds.y) * dpr);
          const pixel = [...ctx.getImageData(10, sampleY, 1, 1).data];
          resolve({ frames: times.length, meanMs: times.reduce((a, b) => a + b, 0) / times.length, p95Ms: sorted[Math.floor(sorted.length * .95)], pixel });
        }
      }; requestAnimationFrame(sample);
    }));
    assert.deepEqual(timing.pixel.slice(0, 3), [247, 199, 103]);
    assert.ok(timing.meanMs < 100, `unresponsive frame cadence: ${JSON.stringify(timing)}`);
    await context.close(); return timing;
  });

  await check('No uncaught JavaScript exceptions or missing local resources across Chromium interactions', () => { assert.deepEqual(consoleErrors, []); });

  await check('WebKit primary interaction, mobile layout and optional sound handling', async () => {
    const browser = await webkit.launch();
    try {
      const { context, page } = await makePage(browser, { width: 390, height: 844, touch: true });
      await page.locator('#start').tap();
      await page.clock.runFor((2.4 + notes[0].hitAt) * 1000);
      const lane = await page.locator(`.lane-button[data-lane="${notes[0].lane}"]`).boundingBox();
      await page.touchscreen.tap(lane.x + lane.width / 2, lane.y + lane.height - 40);
      assert.equal(await page.locator('#score').textContent(), '00100');
      await page.locator('#pause').tap(); assert.equal(await page.locator('#pause-screen').isVisible(), true);
      await page.locator('#resume').tap(); assert.equal(await page.locator('#overlay').isVisible(), false);
      await page.clock.resume();
      await page.locator('#sound').tap();
      await page.waitForFunction(() => document.getElementById('sound').getAttribute('aria-pressed') === 'true' || document.getElementById('announcer').textContent.includes('Sound is unavailable'), null, { timeout: 4000 });
      const enabled = await page.locator('#sound').getAttribute('aria-pressed') === 'true';
      if (enabled) { await page.locator('#sound').tap(); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false'); }
      else assert.ok((await page.locator('#announcer').textContent()).includes('Sound is unavailable'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${output}/390-webkit.png`, fullPage: true });
      await context.close();
      return { soundEnabled: enabled, limitation: enabled ? 'Audible output not physically listened to.' : 'Headless WebKit audio could not resume; the bounded silent fallback was verified.' };
    } finally { await browser.close(); }
  });
  await check('No uncaught exceptions after both browser engines', () => { assert.deepEqual(consoleErrors, []); });
} finally {
  await chromiumBrowser?.close();
  await new Promise((done) => server.close(done));
  await writeFile(`${output}/results.json`, JSON.stringify({ results, failures, consoleErrors }, null, 2));
}
console.log(`${results.length - failures}/${results.length} browser checks passed.`);
process.exitCode = failures ? 1 : 0;
