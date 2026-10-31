/** Game rules and defensive API adapters. This module has no browser dependencies. */
export const RULES = Object.freeze({
  sections: 24,
  sectionSeconds: 3,
  duration: 72,
  leadIn: 2.4,
  perfectWindow: 0.070,
  goodWindow: 0.160,
  perfectPoints: 100,
  goodPoints: 50,
  pollMs: 5000,
  requestTimeoutMs: 4500,
  staleSeconds: 120,
});

/** @param {unknown} value @returns {Record<string, unknown>} */
export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @returns {number | null} */
export function numeric(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {number} value @param {number} low @param {number} high */
export function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }

/** @param {unknown} value @returns {number | null} */
export function timestamp(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
    const time = Number(value);
    const milliseconds = time < 1e12 ? time * 1000 : time;
    return Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 8.64e15 ? milliseconds : null;
  }
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** @typedef {{rpmMilli: number, coreStatus: 'SPINNING' | 'IDLE', blockHeight: string | null, blockProgress: number | null, observedAt: number, staleAfterSeconds: number}} Reading */

/** A partial fresh reading preserves previously known fields; stale readings never replace them.
 * @param {unknown} raw @param {Reading | null} previous @param {number} now
 * @returns {Reading | null}
 */
export function parseStatus(raw, previous, now) {
  const data = record(raw);
  const measurement = record(data.measurement);
  const observedAt = timestamp(measurement.observedAt);
  const staleAfterSeconds = clamp(numeric(measurement.staleAfterSeconds) ?? RULES.staleSeconds, 1, 3600);
  if (measurement.freshness !== 'online' || observedAt === null || now - observedAt > staleAfterSeconds * 1000 || observedAt > now + 30_000) return null;
  const rpmValue = numeric(measurement.rpmMilli);
  const rpmMilli = rpmValue !== null && rpmValue >= 0 ? clamp(rpmValue, 0, 1e9) : previous?.rpmMilli;
  const core = measurement.coreStatus;
  const coreStatus = core === 'SPINNING' || core === 'IDLE' ? core : previous?.coreStatus;
  if (rpmMilli === undefined || !coreStatus) return null;
  const anchor = record(record(data.builder).anchor);
  const height = anchor.blockHeight;
  const heightText = typeof height === 'number' && Number.isSafeInteger(height) && height >= 0 ? String(height) : typeof height === 'string' && /^\d{1,30}$/.test(height) ? height.replace(/^0+(?=\d)/, '') : previous?.blockHeight ?? null;
  const progressValue = numeric(anchor.blockProgress);
  return {
    rpmMilli, coreStatus, blockHeight: heightText,
    blockProgress: progressValue === null ? previous?.blockProgress ?? null : clamp(progressValue / 1e9, 0, 1),
    observedAt, staleAfterSeconds,
  };
}

/** @param {Reading | null} reading */
export function liveMode(reading) { return reading?.coreStatus === 'SPINNING' && reading.rpmMilli > 0; }

/** @param {number} rpmMilli */
export function liveDifficulty(rpmMilli) {
  const level = clamp((rpmMilli / 1000 - 5) / 175, 0, 1);
  return { interval: .75 - level * .47, travel: 2.3 - level * 1.1 };
}

/** @typedef {{workAdded: number, settlementCount: number, startAt: number | null}} Bucket */
/** @typedef {{buckets: Bucket[], day: string, id: string, offline: boolean, practice: boolean, allQuiet: boolean, windowStart: number | null}} Track */

/** @param {string} text */
export function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

/** @param {number} seed */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** @param {unknown} raw @param {string} day @returns {Track | null} */
export function parseTrack(raw, day) {
  const data = record(raw);
  if (!Array.isArray(data.buckets) || data.buckets.length !== RULES.sections) return null;
  let known = 0;
  const buckets = data.buckets.map((item) => {
    const bucket = record(item);
    const work = numeric(bucket.workAdded);
    const count = numeric(bucket.settlementCount);
    if (work !== null && work >= 0) known++;
    return { workAdded: clamp(work ?? 0, 0, 1e15), settlementCount: clamp(Math.trunc(count ?? 0), 0, 1e9), startAt: timestamp(bucket.startAt) };
  });
  if (known !== RULES.sections) return null;
  // Start at an active hour, then traverse the entire chronological cycle, including every rest.
  const firstActive = Math.max(0, buckets.findIndex((b) => b.workAdded > 0));
  const ordered = [...buckets.slice(firstActive), ...buckets.slice(0, firstActive)];
  const signature = `${day}:${buckets.map((b) => `${b.startAt}:${b.workAdded}:${b.settlementCount}`).join('|')}`;
  return { buckets: ordered, day, id: hash(signature).toString(36).toUpperCase().padStart(6, '0'), offline: false, practice: false, allQuiet: buckets.every((b) => b.workAdded === 0), windowStart: timestamp(record(data.window).startAt) ?? buckets[0].startAt };
}

/** The built-in fallback is deliberately labeled practice, never live activity.
 * @param {string} day @param {boolean} [practice] @returns {Track}
 */
export function calmTrack(day, practice = false) {
  const pattern = [2, 3, 4, 2, 0, 3, 4, 5, 3, 0, 2, 4, 3, 5, 0, 2, 3, 4, 2, 0, 3, 5, 4, 2];
  return { buckets: pattern.map((workAdded) => ({ workAdded, settlementCount: workAdded ? 1 : 0, startAt: null })), day, id: `CALM-${hash(day).toString(36).toUpperCase()}`, offline: !practice, practice, allQuiet: false, windowStart: null };
}

/** @typedef {{id: number, lane: number, hitAt: number, travel: number, judged: boolean, spawned: boolean}} Note */
/** @param {Track} track @returns {Note[]} */
export function replayNotes(track) {
  const random = seeded(hash(`${track.day}:${track.id}:seeds-v1`));
  const highest = Math.max(1, ...track.buckets.map((b) => b.workAdded));
  /** @type {Note[]} */
  const notes = [];
  let previousLane = -1;
  track.buckets.forEach((bucket, section) => {
    if (bucket.workAdded === 0) return;
    const intensity = Math.sqrt(bucket.workAdded / highest);
    const count = Math.round(2 + intensity * 5);
    const travel = 2.35 - intensity * .95;
    for (let i = 0; i < count; i++) {
      let lane = Math.floor(random() * 3);
      if (lane === previousLane && random() > .3) lane = (lane + 1 + Math.floor(random() * 2)) % 3;
      previousLane = lane;
      notes.push({ id: notes.length, lane, hitAt: section * RULES.sectionSeconds + .55 + i * 2.15 / count, travel, judged: false, spawned: false });
    }
  });
  return notes;
}

/** @typedef {'perfect' | 'good' | 'miss' | 'end'} EventKind */
/** @typedef {{kind: EventKind, lane: number, score: number}} GameEvent */

export class RhythmGame {
  /** @param {Track} track @param {boolean} live @param {number} rpmMilli */
  constructor(track, live = false, rpmMilli = 0) {
    this.track = track;
    this.mode = live ? 'live' : 'replay';
    this.rpmMilli = rpmMilli;
    this.elapsed = -RULES.leadIn;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfect = 0;
    this.good = 0;
    this.miss = 0;
    this.ended = false;
    this.notes = live ? [] : replayNotes(track);
    this.nextId = this.notes.length;
    this.nextLiveSpawn = .55 - liveDifficulty(rpmMilli).travel;
    this.random = seeded(hash(`${track.day}:${track.id}:live`));
    /** @type {GameEvent[]} */
    this.events = [];
  }
  get section() { return clamp(Math.floor(Math.max(0, this.elapsed) / RULES.sectionSeconds), 0, 23); }
  get multiplier() { return this.mode === 'live' ? 2 : 1; }
  get quiet() { return this.mode === 'replay' && this.track.buckets[this.section].workAdded === 0 && this.elapsed >= 0; }

  /** @param {boolean} live @param {number} rpmMilli */
  setMode(live, rpmMilli) {
    this.rpmMilli = rpmMilli;
    const next = live ? 'live' : 'replay';
    if (next === this.mode) return false;
    this.mode = next;
    // In-flight notes retain their trajectories, so a wake-up never teleports a seed.
    this.notes = this.notes.filter((n) => !n.judged && n.hitAt - n.travel <= this.elapsed);
    if (live) this.nextLiveSpawn = Math.max(this.elapsed + .15, .55 - liveDifficulty(rpmMilli).travel);
    else {
      const future = replayNotes(this.track).filter((n) => n.hitAt - n.travel > this.elapsed + .15);
      future.forEach((n) => { n.id = this.nextId++; });
      this.notes.push(...future);
    }
    return true;
  }

  /** @param {number} delta */
  update(delta) {
    if (this.ended || !Number.isFinite(delta) || delta < 0) return;
    this.elapsed += delta;
    if (this.mode === 'live') {
      const difficulty = liveDifficulty(this.rpmMilli);
      if (this.elapsed < 0) this.nextLiveSpawn = Math.max(this.nextLiveSpawn, .55 - difficulty.travel);
      // Bound catch-up work; a suspended browser is paused by the UI.
      let budget = 32;
      while (this.nextLiveSpawn <= this.elapsed && budget-- > 0) {
        const hitAt = this.nextLiveSpawn + difficulty.travel;
        if (hitAt < RULES.duration - .2) this.notes.push({ id: this.nextId++, lane: Math.floor(this.random() * 3), hitAt, travel: difficulty.travel, judged: false, spawned: false });
        this.nextLiveSpawn += difficulty.interval;
      }
      if (budget <= 0) this.nextLiveSpawn = this.elapsed + difficulty.interval;
    }
    this.notes.forEach((note) => {
      if (!note.judged && this.elapsed - note.hitAt > RULES.goodWindow) {
        note.judged = true;
        this.judge('miss', note.lane);
      }
    });
    if (this.elapsed >= RULES.duration + RULES.goodWindow) {
      this.ended = true;
      this.events.push({ kind: 'end', lane: -1, score: this.score });
    }
  }

  /** @param {number} lane */
  hit(lane) {
    if (this.ended || this.elapsed < -.1 || lane < 0 || lane > 2) return;
    let nearest;
    let distance = Infinity;
    for (const note of this.notes) {
      if (note.judged || note.lane !== lane) continue;
      const offset = Math.abs(note.hitAt - this.elapsed);
      if (offset < distance) { nearest = note; distance = offset; }
    }
    if (nearest && distance <= RULES.goodWindow + 1e-9) {
      nearest.judged = true;
      this.judge(distance <= RULES.perfectWindow + 1e-9 ? 'perfect' : 'good', lane);
    } else this.judge('miss', lane);
  }

  /** @param {'perfect' | 'good' | 'miss'} kind @param {number} lane */
  judge(kind, lane) {
    if (kind === 'miss') { this.combo = 0; this.miss++; }
    else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (kind === 'perfect') this.perfect++; else this.good++;
      this.score += (kind === 'perfect' ? RULES.perfectPoints : RULES.goodPoints) * this.multiplier;
    }
    this.events.push({ kind, lane, score: this.score });
  }
  drainEvents() { return this.events.splice(0); }
}
