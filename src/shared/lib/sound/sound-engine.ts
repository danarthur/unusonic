/**
 * Unusonic Sound Engine — Web Audio API synthesis.
 *
 * Singleton. Lazy AudioContext (created on first play()).
 * Each sound is synthesized on-the-fly from oscillator configs.
 * No audio files — pure digital precision.
 *
 * v2: Exponential envelopes, transient layer, filter envelopes,
 *     harmonics track ADSR, micro pitch sweep for "strike" feel.
 */

import { SOUNDS, type SoundConfig, type SoundName } from './sounds';

// Exponential ramps can't target 0. Use a near-zero floor.
const SILENT = 0.0001;

class SoundEngineImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensureContext(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return { ctx: this.ctx, master: this.master! };
  }

  setVolume(volume: number) {
    if (this.master) {
      this.master.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  play(name: SoundName) {
    const config = SOUNDS[name];
    if (!config) return;

    const { ctx, master } = this.ensureContext();

    if (Array.isArray(config)) {
      let offset = 0;
      for (const tone of config) {
        this.synthesize(ctx, master, tone, offset);
        offset += tone.duration * 0.75;
      }
    } else {
      this.synthesize(ctx, master, config, 0);
    }
  }

  private synthesize(
    ctx: AudioContext,
    destination: GainNode,
    config: SoundConfig,
    startOffset: number
  ) {
    const now = ctx.currentTime + startOffset;
    const peakGain = config.gain ?? 0.3;
    const sustainLevel = Math.max(peakGain * config.sustain, SILENT);

    // ── Envelope (exponential for natural acoustic decay) ──
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(SILENT, now);

    // Attack: linear ramp to peak (linear attack sounds more responsive)
    envelope.gain.linearRampToValueAtTime(peakGain, now + config.attack);

    // Decay: exponential fall to sustain (natural instrument behavior)
    const decayTime = config.decay * 0.3; // time constant = ~30% of decay duration
    envelope.gain.setTargetAtTime(sustainLevel, now + config.attack, decayTime);

    // Release: exponential fade to silence
    const releaseStart = now + config.duration - config.release;
    const releaseTime = config.release * 0.3;
    envelope.gain.setTargetAtTime(SILENT, releaseStart, releaseTime);

    // ── Filter (with optional envelope tracking) ──
    let filterNode: BiquadFilterNode | null = null;
    if (config.filterFreq) {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(config.filterFreq, now);
      filterNode.Q.value = config.filterQ ?? 1;

      // Filter envelope: open slightly on attack, close during decay
      // Mimics the brightness of a struck instrument fading
      if (config.filterEnvelope) {
        filterNode.frequency.setValueAtTime(config.filterEnvelope.startFreq, now);
        filterNode.frequency.exponentialRampToValueAtTime(
          config.filterEnvelope.endFreq,
          now + config.filterEnvelope.time
        );
      }

      envelope.connect(filterNode);
      filterNode.connect(destination);
    } else {
      envelope.connect(destination);
    }

    // ── Primary oscillator ──
    const osc = ctx.createOscillator();
    osc.type = config.type;
    osc.frequency.setValueAtTime(config.freq, now);

    if (config.detune) {
      osc.detune.setValueAtTime(config.detune, now);
    }

    // Micro pitch sweep: start slightly sharp, settle to target (acoustic "strike")
    if (config.pitchSweep) {
      osc.frequency.setValueAtTime(config.freq * config.pitchSweep.startRatio, now);
      osc.frequency.exponentialRampToValueAtTime(
        config.freq,
        now + config.pitchSweep.time
      );
    }

    // Macro pitch envelope (for close/descending sounds)
    if (config.pitchEnvelope) {
      const sweepStart = config.pitchSweep
        ? now + config.pitchSweep.time
        : now;
      osc.frequency.exponentialRampToValueAtTime(
        config.pitchEnvelope.endFreq,
        now + config.pitchEnvelope.time
      );
    }

    osc.connect(envelope);
    osc.start(now);
    osc.stop(now + config.duration + 0.1);

    // ── Harmonics (track the same ADSR envelope) ──
    if (config.harmonics) {
      for (const h of config.harmonics) {
        const harmOsc = ctx.createOscillator();
        harmOsc.type = h.type ?? config.type;
        const harmFreq = config.freq * h.ratio;
        harmOsc.frequency.setValueAtTime(harmFreq, now);

        // Detune harmonics slightly for organic feel (1-2 cents)
        harmOsc.detune.setValueAtTime(h.detune ?? 1.5, now);

        // Harmonics follow pitch envelopes
        if (config.pitchSweep) {
          harmOsc.frequency.setValueAtTime(harmFreq * config.pitchSweep.startRatio, now);
          harmOsc.frequency.exponentialRampToValueAtTime(harmFreq, now + config.pitchSweep.time);
        }
        if (config.pitchEnvelope) {
          harmOsc.frequency.exponentialRampToValueAtTime(
            config.pitchEnvelope.endFreq * h.ratio,
            now + config.pitchEnvelope.time
          );
        }

        // Harmonic gain follows ADSR shape (not a simple linear fade)
        const harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(SILENT, now);
        harmGain.gain.linearRampToValueAtTime(h.gain, now + config.attack);
        harmGain.gain.setTargetAtTime(h.gain * config.sustain || SILENT, now + config.attack, decayTime);
        harmGain.gain.setTargetAtTime(SILENT, releaseStart, releaseTime);

        harmOsc.connect(harmGain);
        harmGain.connect(envelope);
        harmOsc.start(now);
        harmOsc.stop(now + config.duration + 0.1);
      }
    }

    // ── Transient layer (noise burst for mechanical "click" feel) ──
    if (config.transient) {
      const bufferSize = Math.ceil(ctx.sampleRate * config.transient.duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      // Bandpass the transient to the specified frequency
      const transientFilter = ctx.createBiquadFilter();
      transientFilter.type = 'bandpass';
      transientFilter.frequency.value = config.transient.freq;
      transientFilter.Q.value = config.transient.Q ?? 2;

      const transientGain = ctx.createGain();
      transientGain.gain.setValueAtTime(config.transient.gain, now);
      transientGain.gain.exponentialRampToValueAtTime(SILENT, now + config.transient.duration);

      noise.connect(transientFilter);
      transientFilter.connect(transientGain);
      transientGain.connect(filterNode ?? destination);

      noise.start(now);
      noise.stop(now + config.transient.duration + 0.01);
    }
  }
}

/** Singleton sound engine. Safe to import anywhere — no side effects until play(). */
export const SoundEngine = new SoundEngineImpl();
