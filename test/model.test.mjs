import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, numeric, timestamp, parseStatus, liveMode, liveDifficulty, parseTrack, calmTrack, replayNotes, RhythmGame } from '../src/model.js';

const now = Date.parse('2026-10-31T12:00:00Z');
const day = '2026-10-31';
function status(overrides = {}) {
  return { measurement: { freshness: 'online', observedAt: new Date(now).toISOString(), staleAfterSeconds: '120', rpmMilli: '30000', coreStatus: 'SPINNING', ...overrides }, builder: { anchor: { blockHeight: '5204', blockProgress: '637347328' } } };
}
function feed(work = Array.from({ length: 24 }, (_, i) => i % 6 ? (i + 1) * 10 : 0)) {
  return { buckets: work.map((value, i) => ({ workAdded: String(value), settlementCount: String(value ? i % 6 + 1 : 0), startAt: new Date(now - (24 - i) * 3600000).toISOString() })) };
}
const track = parseTrack(feed(), day);
assert.ok(track);

test('API numbers reject empty, nonfinite, boolean and object values', () => {
  for (const value of [null, undefined, {}, [], true, '', ' ', 'no', Infinity, NaN]) assert.equal(numeric(value), null);
  assert.equal(numeric('637347328'), 637347328);
  assert.equal(timestamp('2026-10-31T12:00:00Z'), now);
  assert.equal(timestamp(now / 1000), now);
  assert.equal(timestamp('not a timestamp'), null);
  assert.equal(timestamp(1e30), null);
});
test('status consumes the specified anchor, not projected values', () => {
  const raw = status(); raw.builder.projected = { blockHeight: '9999', blockProgress: '1000000000' };
  const value = parseStatus(raw, null, now);
  assert.equal(value.rpmMilli, 30000); assert.equal(value.blockHeight, '5204');
  assert.equal(value.blockProgress, .637347328); assert.equal(liveMode(value), true);
});
test('idle overrides RPM, and zero RPM overrides spinning', () => {
  assert.equal(liveMode(parseStatus(status({ coreStatus: 'IDLE' }), null, now)), false);
  assert.equal(liveMode(parseStatus(status({ rpmMilli: 0 }), null, now)), false);
});
test('stale, unknown freshness, missing dates and future measurements are rejected', () => {
  for (const measurement of [{ freshness: 'offline' }, { freshness: null }, { observedAt: null }, { observedAt: now - 120001 }, { observedAt: now + 31000 }]) assert.equal(parseStatus(status(measurement), null, now), null);
  assert.ok(parseStatus(status({ observedAt: now - 120000 }), null, now));
  assert.equal(parseStatus(status({ observedAt: now - 10001, staleAfterSeconds: 10 }), null, now), null);
});
test('every absent field is safe; fresh partial status preserves known values', () => {
  for (const value of [null, undefined, 1, 'bad', [], {}, { measurement: {} }, { builder: null }]) assert.equal(parseStatus(value, null, now), null);
  const previous = parseStatus(status(), null, now);
  const partial = parseStatus({ measurement: { freshness: 'online', observedAt: now }, builder: {} }, previous, now);
  assert.equal(partial.rpmMilli, previous.rpmMilli); assert.equal(partial.coreStatus, previous.coreStatus);
  assert.equal(partial.blockHeight, '5204'); assert.equal(partial.blockProgress, previous.blockProgress);
});
test('progress, unreasonable RPM and malformed height are bounded', () => {
  const raw = status({ rpmMilli: '1e300' }); raw.builder.anchor.blockProgress = '2000000000'; raw.builder.anchor.blockHeight = '<script>';
  const value = parseStatus(raw, null, now);
  assert.equal(value.rpmMilli, 1e9); assert.equal(value.blockProgress, 1); assert.equal(value.blockHeight, null);
  raw.builder.anchor.blockProgress = '-100'; assert.equal(parseStatus(raw, null, now).blockProgress, 0);
});
test('live difficulty scales with real RPM and stays within playable bounds', () => {
  const low = liveDifficulty(0), mid = liveDifficulty(90000), high = liveDifficulty(1e9);
  assert.equal(low.interval, .75); assert.ok(mid.interval < low.interval); assert.ok(high.interval >= .28 - 1e-9);
  assert.ok(high.travel >= 1.2 - 1e-9); assert.deepEqual(liveDifficulty(-100), low);
});
test('live countdown never schedules an uncatchable note before the run starts', () => {
  for (const rpm of [1000, 90000, 180000, 1e9]) {
    const game = new RhythmGame(track, true, rpm);
    for (let i = 0; i < 240; i++) game.update(.01);
    assert.equal(game.miss, 0);
    assert.ok(game.notes.every((n) => n.hitAt >= .55 - 1e-9));
  }
});
test('RPM changes during countdown still leave time to catch the first live seed', () => {
  const game = new RhythmGame(track, true, 1000);
  game.update(.3); game.setMode(true, 180000);
  for (let i = 0; i < 210; i++) game.update(.01);
  assert.equal(game.miss, 0); assert.ok(game.notes.every((n) => n.hitAt >= .55 - 1e-9));
});
test('replay reads exactly 24 buckets including real zero-work rests', () => {
  assert.equal(track.buckets.length, 24); assert.ok(track.buckets[0].workAdded > 0);
  assert.equal(track.buckets.filter((b) => b.workAdded === 0).length, 4);
  assert.equal(parseTrack({ buckets: [] }, day), null);
  assert.equal(parseTrack({ buckets: [null] }, day), null);
  assert.equal(parseTrack({ buckets: Array(24).fill({ settlementCount: '1' }) }, day), null);
});
test('all-zero activity is preserved as a rest track, not passed off as activity', () => {
  const quiet = parseTrack(feed(Array(24).fill(0)), day);
  assert.equal(quiet.allQuiet, true); assert.deepEqual(replayNotes(quiet), []);
});
test('identical day and bucket snapshot yield identical IDs and seed timing', () => {
  assert.deepEqual(replayNotes(track), replayNotes(parseTrack(JSON.parse(JSON.stringify(feed())), day)));
  assert.equal(track.id, parseTrack(feed(), day).id);
  assert.notEqual(track.id, parseTrack(feed(), '2026-11-01').id);
  const changed = feed(); changed.buckets[2].workAdded = '9000';
  assert.notEqual(track.id, parseTrack(changed, day).id);
});
test('higher work makes a section denser and faster; zero work spawns no seeds', () => {
  const custom = parseTrack(feed([1, 1000, ...Array(22).fill(0)]), day);
  const notes = replayNotes(custom), a = notes.filter((n) => n.hitAt < 3), b = notes.filter((n) => n.hitAt >= 3 && n.hitAt < 6);
  assert.ok(b.length > a.length); assert.ok(b[0].travel < a[0].travel);
  assert.equal(notes.filter((n) => n.hitAt >= 6).length, 0);
});
test('built-in calm track is deterministic and openly offline', () => {
  assert.equal(calmTrack(day).offline, true);
  assert.deepEqual(replayNotes(calmTrack(day)), replayNotes(calmTrack(day)));
});
test('perfect and good boundaries score correctly; late notes and wrong lanes reset combo', () => {
  for (const [offset, expected, points] of [[0, 'perfect', 100], [.07, 'perfect', 100], [.071, 'good', 50], [.16, 'good', 50], [.161, 'miss', 0]]) {
    const game = new RhythmGame(track); game.notes = [{ id: 0, lane: 1, hitAt: 1, travel: 2, judged: false, spawned: false }]; game.elapsed = 1 + offset;
    game.hit(1); assert.equal(game.drainEvents()[0].kind, expected); assert.equal(game.score, points);
  }
  const game = new RhythmGame(track); const first = game.notes[0]; game.elapsed = first.hitAt; game.hit(first.lane);
  assert.equal(game.combo, 1); game.hit((first.lane + 1) % 3); assert.equal(game.combo, 0); assert.equal(game.score, 100);
});
test('a seed can be caught only once, and overdue notes miss once', () => {
  const game = new RhythmGame(track), first = game.notes[0]; game.elapsed = first.hitAt;
  game.hit(first.lane); game.hit(first.lane); assert.equal(game.score, 100); assert.equal(game.perfect, 1); assert.equal(game.miss, 1);
  const other = new RhythmGame(track); other.update(RULES.leadIn + first.hitAt + .2);
  const missed = other.miss; other.update(.001); assert.equal(other.miss, missed); assert.equal(other.combo, 0);
});
test('waking preserves score, combo, clock and in-flight note trajectories; doubles scoring', () => {
  const game = new RhythmGame(track), first = game.notes[0]; game.elapsed = first.hitAt; game.hit(first.lane); game.drainEvents();
  const inFlight = game.notes.find((n) => !n.judged && n.hitAt - n.travel <= game.elapsed);
  const position = inFlight.hitAt, clock = game.elapsed;
  game.setMode(true, 90000);
  assert.equal(game.score, 100); assert.equal(game.combo, 1); assert.equal(game.elapsed, clock);
  assert.equal(game.notes.find((n) => n.id === inFlight.id).hitAt, position);
  game.elapsed = inFlight.hitAt; game.hit(inFlight.lane);
  assert.equal(game.score, 300); assert.equal(game.combo, 2);
});
test('sleeping again retains in-flight live seeds and resumes the correct replay section', () => {
  const game = new RhythmGame(track, true, 90000); game.update(3);
  assert.ok(game.notes.length > 0); const elapsed = game.elapsed;
  game.setMode(false, 0); assert.equal(game.mode, 'replay'); assert.equal(game.elapsed, elapsed); assert.equal(game.multiplier, 1);
  assert.ok(game.notes.some((n) => n.hitAt - n.travel > elapsed));
});
test('a complete run ends, reports summary once, and restart starts from zero', () => {
  const game = new RhythmGame(track);
  for (let t = 0; t < 7600; t++) game.update(.01);
  assert.equal(game.ended, true); assert.equal(game.miss, replayNotes(track).length); assert.equal(game.combo, 0);
  assert.equal(game.drainEvents().filter((e) => e.kind === 'end').length, 1);
  game.update(100); assert.deepEqual(game.drainEvents(), []);
  const again = new RhythmGame(track); assert.equal(again.score, 0); assert.equal(again.combo, 0); assert.equal(again.elapsed, -RULES.leadIn);
});
test('malformed data fuzz: adapters do not throw', () => {
  const values = [undefined, null, false, 0, -1, NaN, Infinity, '', 'a', [], {}, { x: 1 }];
  for (const value of values) {
    assert.doesNotThrow(() => parseStatus({ measurement: value, builder: value }, null, now));
    assert.doesNotThrow(() => parseTrack({ buckets: Array(24).fill(value) }, day));
    for (const field of ['rpmMilli', 'coreStatus', 'freshness', 'staleAfterSeconds', 'observedAt']) assert.doesNotThrow(() => parseStatus(status({ [field]: value }), null, now));
  }
});
