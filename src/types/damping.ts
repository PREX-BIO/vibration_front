export type SensorName = 'accelerometer' | 'gyroscope';
export type Axis3 = [number, number, number];
export type SensorAccess = { available: boolean | null; permission: string | null };
export type AndroidVibrationRenewal = {
  request_ms: 9000;
  interval_ms: 8000;
  reason: 'galaxy_s10e' | 'galaxy_buddy3' | 'manual';
};
export type AndroidWaveformMode = 'once' | 'repeat';
export type AndroidWaveform = {
  mode: AndroidWaveformMode;
  segment_ms: 8000;
  pause_ms: 0;
};
export type DampingPhase = {
  phase_id: string;
  target_level: 'off' | 'settle' | 'contact' | 'low' | 'medium' | 'higher' | 'pinch';
  effort_cue: string;
  cue: string;
  planned_start_ms: number;
  planned_end_ms: number;
  actual_start_ms: number | null;
  actual_end_ms: number | null;
  summary_start_ms: number | null;
  summary_end_ms: number | null;
  completed: boolean;
};
export type DampingConfig = {
  protocol_version: string;
  analysis_version: string;
  countdown_ms: number;
  recording_duration_ms?: number;
  /** Present only in historical v3 records. */
  duration_ms?: number;
  vibration_start_ms: number;
  vibration_end_ms: number;
  vibration_mode:
    'ios_pulsed' | 'ios_continuous' | 'ios_core_haptics_continuous' | 'android_continuous';
  vibration_duration_ms?: number;
  haptic_intensity?: number;
  haptic_sharpness?: number;
  haptic_settings_id?: string;
  ios_pulse_interval_ms: number | null;
  ios_pulse_tail_guard_ms: number | null;
  window_ms: number;
  hop_ms: number;
  phase_settle_ms: number;
  off_phase_settle_ms?: number;
  command_late_ms?: number;
  requested_accel_interval_ms: number;
  requested_gyro_interval_ms: number;
  min_samples_per_window: number;
  min_receive_span_ms: number;
  max_sensor_gap_ms: number;
  max_receive_gap_ms: number;
  min_observed_sensor_hz: number;
  min_summary_valid_fraction: number;
  numeric_epsilon_g: number;
  weak_response_ratio_note: number;
  baseline_cv_note: number;
  reference_phase_id: string;
  off_pre_phase_id: string;
  off_post_phase_id: string;
  phases: DampingPhase[];
};
export type SensorSample = {
  sample_id: number;
  sensor_timestamp_s: number | null;
  t_receive_ms: number;
  x: number | null;
  y: number | null;
  z: number | null;
  phase_id: string;
  valid: boolean;
  reasons: string[];
};
export type SensorQuality = {
  sample_count: number;
  receive_span_ms: number | null;
  timestamp_monotonic: boolean;
  sensor_rate_hz: number | null;
  receive_rate_hz: number | null;
  max_sensor_gap_ms: number | null;
  max_receive_gap_ms: number | null;
  valid: boolean;
  reasons: string[];
};
export type FeatureFrame = {
  frame_id: number;
  window_start_ms: number;
  window_end_ms: number;
  phase_id_at_end: string;
  included_phase_ids: string[];
  baseline_id: string | null;
  accel: SensorQuality & {
    mean_g: Axis3 | null;
    axis_ac_rms_g: Axis3 | null;
    ac_rms_g: number | null;
    ratio_to_baseline: number | null;
    reduction_pct: number | null;
  };
  gyro: SensorQuality & {
    mean_rad_s: Axis3 | null;
    axis_ac_rms_rad_s: Axis3 | null;
    ac_rms_rad_s: number | null;
    rms_magnitude_rad_s: number | null;
  };
  reduction_valid: boolean;
  reduction_reasons: string[];
  context: 'motor_off' | 'motor_settle' | 'phase_transition' | 'steady';
  summary_eligible: boolean;
};
export type Distribution = {
  median: number | null;
  p25: number | null;
  p75: number | null;
  valid_frames: number;
  expected_frames: number;
  valid: boolean;
  reasons: string[];
};
export type PhaseSummary = {
  phase_id: string;
  accel_ac_rms_g: Distribution;
  accel_reduction_pct: Distribution;
  gyro_rms_magnitude_rad_s: Distribution;
};
export type DampingEvent = {
  type: string;
  planned_ms: number | null;
  actual_ms: number;
  phase_id: string | null;
  sensor: SensorName | null;
  detail: string | null;
};
export type DampingSession = {
  schema_version: '3.0' | '4.0';
  protocol_version: string;
  analysis_version: string;
  metric_scope: 'observed_acceleration_variation';
  motor_isolation: 'not_established';
  data_origin: 'live' | 'replay' | 'synthetic_test';
  source_session_id?: string;
  source_data_origin?: 'live' | 'replay' | 'synthetic_test';
  source_schema_version?: string;
  source_analysis_version?: string;
  session: {
    id: string;
    started_at_utc: string;
    ended_at_utc: string | null;
    planned_duration_ms: number;
    actual_duration_ms: number;
    status: 'recording' | 'completed' | 'aborted';
    abort_reason: string | null;
  };
  device: {
    model: string | null;
    /** Native model identifier, separate from the user's model memo. */
    detected_model?: string | null;
    os: string | null;
    os_version: string | null;
    expo_version: string | null;
    app_version: string | null;
    runtime: string | null;
    sensors: Record<SensorName, SensorAccess>;
  };
  setup: import('./setup').DampingSetup;
  config: DampingConfig;
  vibration: {
    api: 'ReactNative.Vibration' | 'CoreHaptics';
    /** Historical re-request experiment; new measurements never populate this. */
    android_renewal?: AndroidVibrationRenewal;
    android_waveform?: AndroidWaveform;
    duration_ms?: number | null;
    duration_s?: number | null;
    event_type?: 'hapticContinuous' | 'android_continuous';
    settings_id?: string | null;
    schedule_request_ms?: number | null;
    response_received_ms?: number | null;
    scheduled_start_ms?: number | null;
    scheduled_end_ms?: number | null;
    completion_received_ms?: number | null;
    native_receipt?: HapticReceipt | null;
    native_events?: (HapticEvent & { received_ms: number })[];
    stop_response_received_ms?: number | null;
    intensity?: number | null;
    sharpness?: number | null;
    pattern: number[] | null;
    repeat: boolean;
    interval_ms: number | null;
    start_request_ms: number | null;
    stop_request_ms: number | null;
    start_succeeded: boolean | null;
    stop_succeeded: boolean | null;
    hardware_onset_verified: false;
  };
  phases: DampingPhase[];
  events: DampingEvent[];
  raw: {
    units: { accelerometer: 'g'; gyroscope: 'rad/s' };
    accelerometer: SensorSample[];
    gyroscope: SensorSample[];
  };
  baseline: {
    baseline_id: string;
    accel_ac_rms_g: number | null;
    source_start_ms: number | null;
    source_end_ms: number | null;
    frame_ids: number[];
    available_at_ms: number | null;
    valid: boolean;
    reasons: string[];
  };
  features: FeatureFrame[];
  summary: {
    phases: PhaseSummary[];
    off_pre: PhaseSummary | null;
    off_post: PhaseSummary | null;
    baseline_cv: number | null;
    baseline_to_off_pre_ratio: number | null;
    quality_notes: string[];
    sensors: Record<
      SensorName,
      {
        sample_count: number;
        invalid_samples: number;
        invalid_frames: number;
        sensor_rate_hz: number | null;
        receive_rate_hz: number | null;
        gap_events: number;
        timestamp_resets: number;
      }
    >;
  };
  observations: { phone_moved: boolean | null; extra_contact: boolean | null; note: string };
};

/** Native times share systemUptime's monotonic clock, not the JS clock's epoch. */
export type HapticReceipt = {
  playback_id: string;
  native_request_ms: number;
  native_response_ms: number;
  native_scheduled_start_ms: number;
  native_scheduled_end_ms: number;
};
export type HapticEvent = {
  playback_id: string;
  type: 'completed' | 'stopped' | 'engine_stopped' | 'engine_reset' | 'playback_error';
  native_event_ms: number;
  detail: string | null;
};
export type HapticSchedule = {
  playback_id: string;
  delay_ms: number;
  duration_ms: number;
  intensity: number;
  sharpness: number;
};
