import type { DampingConfig, DampingPhase } from '../types/damping';

const rows: [string, number, number, DampingPhase['target_level'], string, string][] = [
  ['off_pre', 0, 3, 'off', '힘 빼고 접촉만 유지', '최소 접촉'],
  ['light_ref', 3, 8, 'contact', '그대로 유지 · 기준 측정', '최소 접촉'],
  ['pinch_low', 8, 13, 'low', '약하게 집고 유지', '주관적 노력 2/10 정도'],
  ['pinch_medium', 13, 18, 'medium', '중간으로 집고 유지', '주관적 노력 4/10 정도'],
  ['pinch_higher', 18, 23, 'higher', '더 세게 집고 유지', '주관적 노력 6/10 정도'],
  ['light_recovery', 23, 28, 'contact', '힘 빼고 접촉만 유지', '최소 접촉'],
  ['off_post', 28, 31, 'off', '그대로 유지 · 종료 기록', '최소 접촉'],
];

export const DAMPING_PROTOCOL: DampingConfig = {
  protocol_version: 'expo_desk_pinch_continuous_31s_v1',
  analysis_version: 'accel_ac_rms_2s_continuous_31s_v1',
  countdown_ms: 3000,
  recording_duration_ms: 31000,
  vibration_start_ms: 3000,
  vibration_end_ms: 28000,
  vibration_duration_ms: 25000,
  vibration_mode: 'ios_core_haptics_continuous',
  haptic_intensity: 1.0,
  haptic_sharpness: 0.5,
  haptic_settings_id: 'continuous_i1.0_s0.5_v1',
  ios_pulse_interval_ms: null,
  ios_pulse_tail_guard_ms: null,
  window_ms: 2000,
  hop_ms: 100,
  phase_settle_ms: 2000,
  off_phase_settle_ms: 500,
  command_late_ms: 250,
  requested_accel_interval_ms: 10,
  requested_gyro_interval_ms: 10,
  min_samples_per_window: 80,
  min_receive_span_ms: 1800,
  max_sensor_gap_ms: 100,
  max_receive_gap_ms: 250,
  min_observed_sensor_hz: 50,
  min_summary_valid_fraction: 0.8,
  numeric_epsilon_g: 1e-9,
  weak_response_ratio_note: 1.2,
  baseline_cv_note: 0.3,
  reference_phase_id: 'light_ref',
  off_pre_phase_id: 'off_pre',
  off_post_phase_id: 'off_post',
  phases: rows.map(([phase_id, start, end, target_level, cue, effort_cue]) => ({
    phase_id,
    target_level,
    cue,
    effort_cue,
    planned_start_ms: start * 1000,
    planned_end_ms: end * 1000,
    actual_start_ms: null,
    actual_end_ms: null,
    summary_start_ms: null,
    summary_end_ms: null,
    completed: false,
  })),
};

export function supportsDampingMeasurement(platform: string) {
  return platform === 'ios' || platform === 'android';
}

export function dampingProtocolForPlatform(platform: string): DampingConfig {
  return {
    ...DAMPING_PROTOCOL,
    protocol_version:
      platform === 'android'
        ? 'expo_desk_pinch_continuous_31s_android_v1'
        : DAMPING_PROTOCOL.protocol_version,
    vibration_mode: platform === 'android' ? 'android_continuous' : 'ios_core_haptics_continuous',
  };
}

export const phaseLabel = (phase: DampingPhase) =>
  ({
    off_pre: '진동 꺼짐 · 전',
    motor_settle: '진동 준비',
    light_ref: '기준 접촉',
    pinch_low: '약하게 집기',
    light_after_low: '힘 풀기 · 1',
    pinch_medium: '중간으로 집기',
    light_after_medium: '힘 풀기 · 2',
    pinch_higher: '더 세게 집기',
    light_after_higher: '힘 풀기 · 3',
    light_recovery: '힘 풀기',
    off_post: '진동 꺼짐 · 후',
  })[phase.phase_id] ?? phase.cue;

export const recordingDuration = (config: DampingConfig) =>
  config.recording_duration_ms ?? config.duration_ms!;

export const phaseSettle = (config: DampingConfig, phase: DampingPhase) =>
  phase.target_level === 'off'
    ? (config.off_phase_settle_ms ?? config.phase_settle_ms)
    : config.phase_settle_ms;

export function vibrationInterval(session: import('../types/damping').DampingSession) {
  const v = session.vibration;
  const on = v.start_succeeded ? (v.scheduled_start_ms ?? v.start_request_ms) : null;
  const ends = [v.scheduled_end_ms, v.stop_request_ms].filter((t): t is number => t != null);
  return { on, off: ends.length ? Math.min(...ends) : null };
}
