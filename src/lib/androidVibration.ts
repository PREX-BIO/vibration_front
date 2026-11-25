import type { AndroidWaveformMode } from '../types/damping';

export type AndroidVibrationPreference = 'standard' | 'waveform_once';
export const DEFAULT_ANDROID_VIBRATION_PREFERENCE: AndroidVibrationPreference = 'standard';

/** Old selections retained by Fast Refresh must not enable a removed experiment. */
export function resolveAndroidVibrationPreference(value: unknown): AndroidVibrationPreference {
  return value === 'waveform_once' ? value : DEFAULT_ANDROID_VIBRATION_PREFERENCE;
}

export const ANDROID_WAVEFORM_SEGMENT_MS = 8000;

export function selectAndroidWaveformMode(
  platform: string,
  preference: AndroidVibrationPreference,
): 'once' | null {
  if (platform !== 'android') return null;
  if (preference === 'waveform_once') return 'once';
  return null;
}

/** Build a finite waveform. The repeat mode is retained only to validate historical JSON. */
export function buildAndroidWaveformRequest(
  mode: AndroidWaveformMode,
  remainingMs: number,
): { pattern: number[]; repeat: boolean } | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > 25000) return null;
  let remaining = Math.ceil(remainingMs);
  if (mode === 'repeat' && remaining > ANDROID_WAVEFORM_SEGMENT_MS)
    return { pattern: [0, ANDROID_WAVEFORM_SEGMENT_MS], repeat: true };
  // If only one segment remains, it can end natively without an indefinite loop.
  const pattern: number[] = [];
  while (remaining > 0) {
    const duration = Math.min(remaining, ANDROID_WAVEFORM_SEGMENT_MS);
    pattern.push(0, duration);
    remaining -= duration;
  }
  return { pattern, repeat: false };
}
