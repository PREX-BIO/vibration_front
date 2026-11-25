import type { ForceEstimate, ForceModel, SessionForceEstimate } from './force';

export type PhaseId =
  | 'off_start'
  | 'motor_settle'
  | 'baseline'
  | 'pinch_1'
  | 'light_1'
  | 'pinch_2'
  | 'light_2'
  | 'pinch_3'
  | 'light_3'
  | 'off_end';

export type Phase = {
  id: PhaseId;
  start_ms: number;
  end_ms: number;
  cue: string;
  vibration: boolean;
};

export type AnalysisConfig = {
  protocol_version: string;
  analysis_version: string;
  countdown_ms: number;
  duration_ms: number;
  vibration_start_ms: number;
  vibration_end_ms: number;
  vibration_mode: 'android_continuous' | 'ios_pulsed';
  ios_pulse_interval_ms: number | null;
  ios_pulse_tail_guard_ms: number | null;
  requested_interval_ms: number;
  window_ms: number;
  hop_ms: number;
  min_samples: number;
  min_sample_span_ms: number;
  max_gap_ms: number;
  min_sensor_rate_hz: number;
  phase_exclusion_ms: number;
  min_valid_window_fraction: number;
  numeric_epsilon_g: number;
  weak_motor_ratio: number;
  baseline_cv_note: number;
  command_late_ms: number;
  phases: Phase[];
};

export type RawSample = {
  index: number;
  sensor_timestamp_s: number | null;
  received_relative_ms: number;
  x_g: number | null;
  y_g: number | null;
  z_g: number | null;
  phase_id: PhaseId;
};

export type SessionEvent = {
  type:
    | 'record_start'
    | 'phase_cue'
    | 'vibration_start_request'
    | 'vibration_start_skipped'
    | 'vibration_cancel_request'
    | 'record_stop';
  planned_ms: number;
  actual_ms: number;
  phase_id: PhaseId | null;
  detail: string | null;
};

export type QualityReason =
  | 'insufficient_samples'
  | 'short_receive_span'
  | 'invalid_axis'
  | 'invalid_sensor_timestamp'
  | 'invalid_receive_time'
  | 'low_sample_rate'
  | 'sample_gap'
  | 'delivery_jitter'
  | 'transition'
  | 'command_late'
  | 'insufficient_valid_windows'
  | 'baseline_unavailable'
  | 'incomplete_phase'
  | 'incomplete_session'
  | 'weak_motor_response'
  | 'unstable_baseline'
  | 'manual_artifact';

export type Feature = {
  start_ms: number;
  end_ms: number;
  phase_id: PhaseId | 'transition';
  sample_count: number;
  rms_g: number | null;
  ratio: number | null;
  valid: boolean;
  reasons: QualityReason[];
  force_estimate: ForceEstimate;
};

export type SignalWindow = Omit<Feature, 'force_estimate'>;

export type Trial = {
  trial: number;
  pinch_ratio: number | null;
  preceding_light_ratio: number | null;
  delta: number | null;
  valid: boolean;
  reasons: QualityReason[];
  force_estimate: ForceEstimate;
};

export type Summary = {
  sensor_rate_hz: number | null;
  receive_rate_hz: number | null;
  baseline_rms_g: number | null;
  off_rms_g: number | null;
  motor_response_ratio: number | null;
  baseline_cv: number | null;
  trials: Trial[];
  final_light_ratio: number | null;
  median_trial_delta: number | null;
  quality_notes: QualityReason[];
  pinch_force_kgf: null;
  force_estimate: SessionForceEstimate;
};

export type Environment = {
  table_material: 'wood' | 'stone' | 'metal' | 'glass' | 'other';
  case_on: boolean;
  note: string;
};

export type Session = {
  schema_version: '2.0';
  session_id: string;
  data_origin: 'live' | 'replay' | 'manual_feature';
  source_session_id?: string;
  source_data_origin?: 'live' | 'replay' | 'manual_feature';
  status: 'recording' | 'completed' | 'cancelled' | 'error';
  protocol_version: string;
  analysis_version: string;
  platform: string;
  runtime: 'expo_go' | 'development_build' | 'standalone' | null;
  app_version: string | null;
  expo_sdk_version: string | null;
  device_model_note: string;
  started_at_utc: string;
  ended_at_utc: string | null;
  duration_ms: number;
  posture_id: 'thumb_index';
  hand: 'right';
  environment: Environment;
  phase_assignment: 'js_receive_time';
  config: AnalysisConfig;
  force_model: ForceModel;
  raw_samples: RawSample[];
  events: SessionEvent[];
  features: Feature[];
  summary: Summary;
  observations: {
    phone_moved: boolean | null;
    extra_contact: boolean | null;
    note: string;
  };
};
