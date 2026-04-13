/**
 * Unusonic Sound Palette — 6 synthesized tones (v2).
 *
 * Tonal direction: "Analog source, digital precision."
 * Filtered oscillators with 2nd/3rd harmonics, exponential envelopes,
 * transient noise layers for mechanical feel. Mono.
 *
 * All fundamentals below 500Hz or above 5kHz.
 * Avoids 1-4kHz vocal presence range that production professionals monitor.
 *
 * Research-driven improvements:
 * - Exponential decay (setTargetAtTime) for natural acoustic behavior
 * - Transient noise bursts (1-3ms) for TE-style tactile "click"
 * - Micro pitch sweeps (start sharp, settle) for "strike" character
 * - Harmonics slightly detuned (1-2 cents) for organic warmth
 * - Filter envelopes (open on attack, close during decay)
 * - Alert changed from minor 2nd (too aggressive) to descending minor 3rd
 * - Arrive Q dropped from 8 to 1.5 (was piercing)
 * - Tap switched from square to triangle (softer partials)
 * - Close shortened from 400ms to 220ms (match UI dismiss timing)
 */

export type SoundName =
  | 'resolve'
  | 'confirm'
  | 'arrive'
  | 'alert'
  | 'tap'
  | 'close';

// Phase 2: 'breathe' (looping) and 'open' (sonic logo)

export type SoundCategory = 'interaction' | 'notification' | 'ambient' | 'aion';

export const SOUND_CATEGORY: Record<SoundName, SoundCategory> = {
  resolve: 'aion',
  confirm: 'interaction',
  arrive: 'notification',
  alert: 'notification',
  tap: 'interaction',
  close: 'ambient',
};

export interface SoundConfig {
  /** Primary oscillator type */
  type: OscillatorType;
  /** Fundamental frequency in Hz */
  freq: number;
  /** Additional oscillators at frequency ratios */
  harmonics?: { ratio: number; gain: number; type?: OscillatorType; detune?: number }[];
  /** Attack time in seconds */
  attack: number;
  /** Decay time in seconds (exponential via setTargetAtTime) */
  decay: number;
  /** Sustain level (0-1) */
  sustain: number;
  /** Release time in seconds (exponential) */
  release: number;
  /** Total duration in seconds */
  duration: number;
  /** Static lowpass filter cutoff Hz (used if no filterEnvelope) */
  filterFreq?: number;
  /** Filter resonance Q (default 1) */
  filterQ?: number;
  /** Sweeping filter envelope */
  filterEnvelope?: { startFreq: number; endFreq: number; time: number };
  /** Detune in cents */
  detune?: number;
  /** Micro pitch sweep: start slightly sharp/flat, settle to freq (acoustic "strike") */
  pitchSweep?: { startRatio: number; time: number };
  /** Macro pitch envelope: sweep to end frequency over time */
  pitchEnvelope?: { endFreq: number; time: number };
  /** Peak gain (0-1, default 0.3). UI sounds should stay 0.08-0.18. */
  gain?: number;
  /** Transient noise burst for mechanical "click" at onset */
  transient?: { freq: number; Q?: number; gain: number; duration: number };
}

// D4 = 293.66Hz, G4 = 392.00Hz, B3 = 246.94Hz, A4 = 440Hz

export const SOUNDS: Record<SoundName, SoundConfig | SoundConfig[]> = {

  // ── RESOLVE ── Aion response ready (the signature sound)
  // Filtered sine D4 with warm harmonics, micro pitch sweep for "strike"
  // Transient click at onset for tactile feel
  resolve: {
    type: 'sine',
    freq: 293.66,
    harmonics: [
      { ratio: 2, gain: 0.06, detune: 1.5 },   // 2nd: warmth (-12dB from fundamental)
      { ratio: 3, gain: 0.02, detune: -1 },     // 3rd: subtle presence
    ],
    attack: 0.005,
    decay: 0.15,
    sustain: 0.0,
    release: 0.04,
    duration: 0.2,
    filterFreq: 900,
    filterQ: 1.0,           // was Q2 — dropped to avoid nasal peak
    filterEnvelope: { startFreq: 1400, endFreq: 700, time: 0.15 }, // bright attack, warm decay
    pitchSweep: { startRatio: 1.02, time: 0.015 }, // start 2% sharp, settle in 15ms
    gain: 0.14,
    transient: { freq: 3000, Q: 2, gain: 0.04, duration: 0.003 },
  },

  // ── CONFIRM ── Deal/payment/crew accepted
  // Ascending perfect 4th (D4 → G4). Both tones get harmonics + transients.
  // 120ms first note, brief gap, 140ms second note.
  confirm: [
    {
      type: 'sine',
      freq: 293.66,
      harmonics: [
        { ratio: 2, gain: 0.05, detune: 1 },
      ],
      attack: 0.005,
      decay: 0.09,
      sustain: 0.0,
      release: 0.025,
      duration: 0.12,
      filterFreq: 1200,
      filterQ: 0.8,
      pitchSweep: { startRatio: 1.015, time: 0.012 },
      gain: 0.12,
      transient: { freq: 2500, Q: 2, gain: 0.03, duration: 0.002 },
    },
    {
      type: 'sine',
      freq: 392.0,
      harmonics: [
        { ratio: 2, gain: 0.05, detune: 1.5 },
      ],
      attack: 0.005,
      decay: 0.11,
      sustain: 0.0,
      release: 0.03,
      duration: 0.14,
      filterFreq: 1400,
      filterQ: 0.8,
      pitchSweep: { startRatio: 1.015, time: 0.012 },
      gain: 0.14,
      transient: { freq: 2500, Q: 2, gain: 0.03, duration: 0.002 },
    },
  ],

  // ── ARRIVE ── Incoming notification (metallic comms click)
  // Triangle wave with moderate filter resonance. Longer than v1 (160ms).
  // Transient burst gives the "radio click" character.
  arrive: {
    type: 'triangle',
    freq: 440,
    harmonics: [
      { ratio: 2, gain: 0.04, detune: 2 },   // slight shimmer
    ],
    attack: 0.003,
    decay: 0.1,
    sustain: 0.0,
    release: 0.05,
    duration: 0.16,
    filterFreq: 2000,       // was 6000 — much less piercing
    filterQ: 1.5,           // was Q8 — no more ear-ringing resonance
    filterEnvelope: { startFreq: 4000, endFreq: 1500, time: 0.08 },
    pitchSweep: { startRatio: 1.03, time: 0.008 },
    gain: 0.13,
    transient: { freq: 4000, Q: 3, gain: 0.06, duration: 0.002 },
  },

  // ── ALERT ── Error/urgent
  // Descending minor 3rd (D4 → B3) — concerned but not fight-or-flight.
  // Was minor 2nd (D4 → Eb4) which was too horror-movie for form validation errors.
  // Filter at 900Hz for enough presence to be noticed.
  alert: [
    {
      type: 'sine',
      freq: 293.66,
      harmonics: [
        { ratio: 2, gain: 0.07, detune: 2 },
        { ratio: 3, gain: 0.025 },
      ],
      attack: 0.008,
      decay: 0.14,
      sustain: 0.05,
      release: 0.06,
      duration: 0.2,
      filterFreq: 900,       // was 600 — too dark to notice
      filterQ: 1.0,
      filterEnvelope: { startFreq: 1200, endFreq: 700, time: 0.18 },
      gain: 0.16,
      transient: { freq: 2000, Q: 1.5, gain: 0.03, duration: 0.003 },
    },
    {
      type: 'sine',
      freq: 246.94,           // B3 — descending minor 3rd from D4
      harmonics: [
        { ratio: 2, gain: 0.07, detune: -1.5 },
        { ratio: 3, gain: 0.025 },
      ],
      attack: 0.008,
      decay: 0.16,
      sustain: 0.0,
      release: 0.08,
      duration: 0.22,
      filterFreq: 800,
      filterQ: 1.0,
      filterEnvelope: { startFreq: 1100, endFreq: 600, time: 0.2 },
      gain: 0.16,
    },
  ],

  // ── TAP ── Micro-interaction click
  // Triangle wave (was square — softer partials). Bandpassed transient
  // is the primary sound; the oscillator is just sub-bass body.
  tap: {
    type: 'triangle',        // was square — no more harsh odd harmonics
    freq: 220,
    attack: 0.002,
    decay: 0.025,
    sustain: 0.0,
    release: 0.01,
    duration: 0.04,
    filterFreq: 500,         // was 400 — slightly more presence
    gain: 0.07,
    transient: { freq: 3500, Q: 2, gain: 0.05, duration: 0.002 },
  },

  // ── CLOSE ── Session end / dismiss
  // Descending pitch sweep with sub-harmonic. Shortened to 220ms (was 400ms).
  // Dynamic filter tracks the pitch downward.
  close: {
    type: 'sine',
    freq: 392.0,
    harmonics: [
      { ratio: 0.5, gain: 0.08, detune: -1 },  // sub-octave body
      { ratio: 2, gain: 0.04, detune: 2 },      // shimmer on attack
    ],
    attack: 0.008,
    decay: 0.16,
    sustain: 0.0,
    release: 0.05,
    duration: 0.22,           // was 0.4 — tighter, matches UI dismiss timing
    pitchEnvelope: { endFreq: 240, time: 0.18 },
    filterEnvelope: { startFreq: 900, endFreq: 450, time: 0.18 }, // filter tracks pitch
    filterFreq: 900,
    filterQ: 1.0,
    gain: 0.12,
  },
};
