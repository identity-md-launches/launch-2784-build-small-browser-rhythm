import { clamp } from './model.js';

const ART = { bg: '#101522', surface: '#151b29', lane: '#192030', line: '#38435a', gold: '#f7c767', darkGold: '#b98837', orange: '#f4a16d', cream: '#ffe3ac', brown: '#7c542f', dark: '#242531', muted: '#a4adc0', mint: '#9dd6b3' };

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} scale @param {string} [color] */
export function drawSeed(ctx, x, y, scale = 2, color = ART.gold) {
  ctx.fillStyle = color;
  [[2, 0, 2, 1], [1, 1, 4, 2], [0, 3, 5, 2], [1, 5, 3, 1], [1, 6, 2, 1]].forEach(([a, b, w, h]) => ctx.fillRect(Math.round(x + (a - 2.5) * scale), Math.round(y + (b - 3.5) * scale), w * scale, h * scale));
  ctx.fillStyle = ART.cream;
  ctx.fillRect(Math.round(x - scale), Math.round(y - 2 * scale), scale, 3 * scale);
}

/** @typedef {{x: number, y: number, dx: number, dy: number, life: number, color: string}} Particle */

export class TrackRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.width = 600;
    this.height = 426;
    this.dpr = 1;
    this.hitOffset = 80;
    /** @type {Particle[]} */
    this.particles = [];
    this.flashes = [0, 0, 0];
  }
  /** @param {number} width @param {number} height @param {number} dpr @param {number} [hitOffset] */
  resize(width, height, dpr, hitOffset = 80) {
    this.width = width; this.height = height; this.dpr = Math.min(2, dpr || 1);
    this.hitOffset = hitOffset;
    this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }
  /** @param {number} lane @param {string} kind @param {boolean} reducedMotion */
  hit(lane, kind, reducedMotion) {
    this.flashes[lane] = .13;
    if (kind === 'miss' || reducedMotion) return;
    const x = (lane + .5) * this.width / 3;
    for (let i = 0; i < 10 && this.particles.length < 80; i++) this.particles.push({ x, y: this.height - this.hitOffset, dx: (i - 4.5) * 14, dy: -50 - (i % 4) * 28, life: .4, color: i % 3 ? ART.gold : ART.orange });
  }
  /** @param {import('./model.js').RhythmGame | null} game @param {number} delta @param {boolean} reducedMotion */
  draw(game, delta, reducedMotion) {
    const ctx = this.ctx, w = this.width, h = this.height, laneWidth = w / 3, target = h - this.hitOffset;
    ctx.fillStyle = ART.surface; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ART.lane; ctx.fillRect(laneWidth, 0, laneWidth, h);
    this.flashes.forEach((flash, lane) => {
      if (flash > 0) {
        ctx.fillStyle = '#f7c76714'; ctx.fillRect(lane * laneWidth, 0, laneWidth, h);
        this.flashes[lane] = Math.max(0, flash - delta);
      }
    });
    // A sparse pixel grid makes distance readable without moving the page itself.
    ctx.fillStyle = '#2a3244';
    const scroll = game && !reducedMotion ? (game.elapsed * 25) % 44 : 0;
    for (let y = 22 + scroll; y < target - 10; y += 44) for (let lane = 0; lane < 3; lane++) ctx.fillRect(Math.round((lane + .5) * laneWidth) - 1, Math.round(y), 2, 2);
    ctx.fillStyle = ART.gold; ctx.fillRect(0, target - 1, w, 2);
    ctx.fillStyle = '#f7c76709'; ctx.fillRect(0, target - 14, w, 28);
    ctx.fillStyle = ART.darkGold; ctx.fillRect(0, target - 4, 3, 8); ctx.fillRect(w - 3, target - 4, 3, 8);
    if (game) {
      for (const note of game.notes) {
        if (note.judged) continue;
        const fraction = (game.elapsed - (note.hitAt - note.travel)) / note.travel;
        if (fraction < 0 || fraction > 1.2) continue;
        const x = (note.lane + .5) * laneWidth, y = -16 + fraction * (target + 16);
        drawSeed(ctx, x, y, 3, note.lane === 1 ? ART.orange : ART.gold);
      }
    }
    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) return false;
      particle.x += particle.dx * delta; particle.y += particle.dy * delta; particle.dy += 160 * delta;
      ctx.globalAlpha = clamp(particle.life / .3, 0, 1); ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 3, 3);
      return true;
    });
    ctx.globalAlpha = 1;
    if (game && game.elapsed < 0) {
      ctx.fillStyle = ART.gold; ctx.textAlign = 'center'; ctx.font = '700 48px "Courier New", monospace';
      ctx.fillText(String(Math.ceil(-game.elapsed)), w / 2, h * .43);
      ctx.fillStyle = ART.muted; ctx.font = '13px sans-serif'; ctx.fillText('Find the gold line', w / 2, h * .43 + 28);
    }
  }
}

/** Original 24-column pixel sprite; each letter is one hand-placed pixel. */
const HAMSTER = [
  '       bb       bb       ',
  '      boob     boob      ',
  '      boobb   bboob      ',
  '     boooobbbboooob      ',
  '    booooooooooooob     ',
  '   booooooooooooooob    ',
  '  boooooooooooooooooob  ',
  ' boooooooooooooocoocob  ',
  ' boooooooooccccccccccob ',
  'boooooooooccccccccccccnb',
  'boooooooocccccccccccccc ',
  'booooooooccccccccccccb  ',
  ' booooooooccccccccccb   ',
  '  bbooooooocccccccbb    ',
  '    bbbbbbbbbbbbb      ',
  '     pp      pp        ',
];
const PIXELS = /** @type {Record<string,string>} */ ({ b: ART.brown, o: ART.orange, c: ART.cream, p: '#dd977b', n: '#d27f72' });

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} radius @param {string} color @param {number} thickness */
function pixelRing(ctx, x, y, radius, color, thickness) {
  ctx.fillStyle = color;
  for (let angle = 0; angle < Math.PI * 2; angle += .018) ctx.fillRect(Math.round((x + Math.cos(angle) * radius) / 4) * 4, Math.round((y + Math.sin(angle) * radius) / 4) * 4, thickness, thickness);
}

/** @param {HTMLCanvasElement} canvas @param {boolean} running @param {number} time @param {boolean} reducedMotion */
export function drawHamster(canvas, running, time, reducedMotion) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 320, 280);
  ctx.imageSmoothingEnabled = false;
  const centerX = 164, centerY = 130, radius = 100;
  // Distant stars and a seedling, all on the same four-pixel grid.
  ctx.fillStyle = '#38435a';
  [[24, 60], [280, 48], [292, 164], [40, 136], [256, 20]].forEach(([x, y]) => ctx.fillRect(x, y, 4, 4));
  ctx.fillStyle = ART.darkGold; ctx.fillRect(104, 248, 124, 4); ctx.fillRect(124, 220, 8, 28); ctx.fillRect(204, 220, 8, 28);
  pixelRing(ctx, centerX, centerY, radius, ART.brown, 8);
  pixelRing(ctx, centerX, centerY, radius - 6, ART.darkGold, 4);
  pixelRing(ctx, centerX, centerY, radius - 13, '#543e2d', 4);
  const angle = running && !reducedMotion ? time * 1.4 : .2;
  ctx.fillStyle = '#5f482f';
  for (let i = 0; i < 8; i++) {
    const theta = angle + i * Math.PI / 4;
    for (let r = 12; r < radius - 12; r += 4) ctx.fillRect(Math.round((centerX + Math.cos(theta) * r) / 4) * 4, Math.round((centerY + Math.sin(theta) * r) / 4) * 4, 4, 4);
  }
  ctx.fillStyle = ART.brown; ctx.fillRect(centerX - 8, centerY - 8, 20, 20);
  ctx.fillStyle = ART.darkGold; ctx.fillRect(centerX - 4, centerY - 4, 12, 12);
  const bounce = running && !reducedMotion && Math.floor(time * 8) % 2 ? -4 : 0;
  const x = 120, y = 159 + bounce;
  HAMSTER.forEach((row, iy) => {
    [...row].forEach((letter, ix) => { if (PIXELS[letter]) { ctx.fillStyle = PIXELS[letter]; ctx.fillRect(x + ix * 4, y + iy * 4, 4, 4); } });
  });
  ctx.fillStyle = ART.dark;
  if (running) { ctx.fillRect(x + 17 * 4, y + 7 * 4, 4, 8); ctx.fillRect(x + 21 * 4, y + 7 * 4, 4, 8); }
  else { ctx.fillRect(x + 16 * 4, y + 8 * 4, 8, 4); ctx.fillRect(x + 20 * 4, y + 8 * 4, 8, 4); }
  // Tiny cheeks and running feet make the two poses distinct without screen shake.
  ctx.fillStyle = '#dd977b'; ctx.fillRect(x + 15 * 4, y + 9 * 4, 8, 4);
  if (running && !reducedMotion) {
    ctx.fillStyle = ART.brown; ctx.fillRect(x + 5 * 4, y + 15 * 4, 60, 4);
    ctx.fillStyle = '#dd977b'; ctx.fillRect(x + (Math.floor(time * 8) % 2 ? 3 : 7) * 4, y + 15 * 4, 12, 4); ctx.fillRect(x + 17 * 4, y + 15 * 4, 12, 4);
  }
  if (!running) {
    ctx.fillStyle = ART.gold; ctx.font = '700 16px "Courier New", monospace';
    const drift = reducedMotion ? 0 : Math.floor(time % 3) * 3;
    ctx.fillText('z', 239, 139 - drift); ctx.fillText('z', 256, 120 - drift); ctx.fillText('Z', 270, 96 - drift);
  }
  ctx.fillStyle = '#38435a'; ctx.fillRect(40, 256, 240, 4); ctx.fillRect(64, 268, 36, 4); ctx.fillRect(232, 268, 20, 4);
  ctx.fillStyle = ART.darkGold; ctx.fillRect(42, 228, 4, 28); ctx.fillRect(34, 228, 8, 8); ctx.fillRect(46, 218, 8, 8);
  ctx.fillStyle = ART.gold; ctx.fillRect(30, 224, 8, 4); ctx.fillRect(50, 214, 8, 4);
  drawSeed(ctx, 270, 248, 2); drawSeed(ctx, 286, 254, 1.5, ART.orange);
}
