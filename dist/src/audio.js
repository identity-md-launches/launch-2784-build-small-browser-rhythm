/** Small original synthesized effects. No sound files or network requests. */
export class GameAudio {
  constructor() {
    this.enabled = false;
    /** @type {AudioContext | null} */
    this.context = null;
  }
  async toggle() {
    if (this.enabled) { this.enabled = false; return false; }
    this.context ??= new AudioContext();
    let timeout = 0;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Audio unavailable')), 2000); }),
      ]);
    } catch (error) {
      void this.context.close().catch(() => {});
      this.context = null;
      throw error;
    } finally { clearTimeout(timeout); }
    this.enabled = true;
    this.play('perfect');
    return true;
  }
  /** @param {string} kind */
  play(kind) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = kind === 'miss' ? 'sine' : 'triangle';
    const frequency = kind === 'perfect' ? 880 : kind === 'good' ? 660 : kind === 'wake' ? 1046.5 : 150;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === 'miss' ? .6 : 1.2), ctx.currentTime + .09);
    gain.gain.setValueAtTime(.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.035, ctx.currentTime + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .12);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .13);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
