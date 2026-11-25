import type { AnalysisConfig } from '../types/session';

export type VibrationRequest = { pattern: number | number[]; repeat: false };

/** Continuous output uses one duration; legacy iOS Vibration arrays contain pulse delays. */
export function buildVibrationRequest(
  config: Pick<AnalysisConfig, 'ios_pulse_interval_ms' | 'ios_pulse_tail_guard_ms'> & {
    vibration_mode:
      AnalysisConfig['vibration_mode'] | 'ios_continuous' | 'ios_core_haptics_continuous';
  },
  remainingMs: number,
): VibrationRequest | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  if (config.vibration_mode !== 'ios_pulsed') return { pattern: remainingMs, repeat: false };
  const interval = config.ios_pulse_interval_ms;
  const guard = config.ios_pulse_tail_guard_ms;
  if (interval === null || interval <= 0 || guard === null || remainingMs < guard) return null;
  // Finite pattern, with room for the final ~400 ms system pulse before the off phase.
  // The session controller cancels at its configured end, on interruption and on screen exit.
  const pulseCount = Math.floor((remainingMs - guard) / interval) + 1;
  return { pattern: [0, ...Array<number>(pulseCount - 1).fill(interval)], repeat: false };
}
