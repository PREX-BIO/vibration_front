import type { AnalysisConfig, Phase, PhaseId } from '../types/session';

export const PROTOCOL: AnalysisConfig = {
  protocol_version: 'expo_desk_pinch_v1',
  analysis_version: 'accel_ac_rms_v1',
  countdown_ms: 3000,
  duration_ms: 35000,
  vibration_start_ms: 3000,
  vibration_end_ms: 33000,
  vibration_mode: 'android_continuous',
  ios_pulse_interval_ms: null,
  ios_pulse_tail_guard_ms: null,
  requested_interval_ms: 10,
  window_ms: 500,
  hop_ms: 100,
  min_samples: 20,
  min_sample_span_ms: 400,
  max_gap_ms: 100,
  min_sensor_rate_hz: 50,
  phase_exclusion_ms: 1000,
  min_valid_window_fraction: 0.8,
  numeric_epsilon_g: 1e-9,
  weak_motor_ratio: 1.2,
  baseline_cv_note: 0.3,
  command_late_ms: 250,
  phases: [
    { id: 'off_start', start_ms: 0, end_ms: 3000, cue: '가볍게 접촉해 주세요', vibration: false },
    {
      id: 'motor_settle',
      start_ms: 3000,
      end_ms: 5000,
      cue: '손가락 위치를 유지해 주세요',
      vibration: true,
    },
    { id: 'baseline', start_ms: 5000, end_ms: 9000, cue: '가볍게 접촉해 주세요', vibration: true },
    {
      id: 'pinch_1',
      start_ms: 9000,
      end_ms: 13000,
      cue: '조금 더 세게 집고 유지해 주세요',
      vibration: true,
    },
    {
      id: 'light_1',
      start_ms: 13000,
      end_ms: 17000,
      cue: '접촉을 유지하며 힘을 낮춰 주세요',
      vibration: true,
    },
    {
      id: 'pinch_2',
      start_ms: 17000,
      end_ms: 21000,
      cue: '조금 더 세게 집고 유지해 주세요',
      vibration: true,
    },
    {
      id: 'light_2',
      start_ms: 21000,
      end_ms: 25000,
      cue: '접촉을 유지하며 힘을 낮춰 주세요',
      vibration: true,
    },
    {
      id: 'pinch_3',
      start_ms: 25000,
      end_ms: 29000,
      cue: '조금 더 세게 집고 유지해 주세요',
      vibration: true,
    },
    {
      id: 'light_3',
      start_ms: 29000,
      end_ms: 33000,
      cue: '접촉을 유지하며 힘을 낮춰 주세요',
      vibration: true,
    },
    {
      id: 'off_end',
      start_ms: 33000,
      end_ms: 35000,
      cue: '가볍게 접촉해 주세요',
      vibration: false,
    },
  ],
};

export function supportsLiveMeasurement(platform: string) {
  return platform === 'android' || platform === 'ios';
}

export function protocolForPlatform(platform: string): AnalysisConfig {
  if (platform !== 'ios') return PROTOCOL;
  return {
    ...PROTOCOL,
    protocol_version: 'expo_desk_pinch_ios_pulsed_v1',
    vibration_mode: 'ios_pulsed',
    ios_pulse_interval_ms: 1000,
    ios_pulse_tail_guard_ms: 500,
  };
}

export function phaseAt(ms: number, config = PROTOCOL): Phase | null {
  return config.phases.find((phase) => ms >= phase.start_ms && ms < phase.end_ms) ?? null;
}

export function phaseForWindow(
  start: number,
  end: number,
  config = PROTOCOL,
): PhaseId | 'transition' {
  return (
    config.phases.find((phase) => start >= phase.start_ms && end <= phase.end_ms)?.id ??
    'transition'
  );
}

export function isRatioPhase(id: PhaseId | 'transition') {
  return id === 'baseline' || id.startsWith('pinch_') || id.startsWith('light_');
}
