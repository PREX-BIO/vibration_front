import { DEMO_FORCE_MODEL } from '../config/demoForceModel';
import { PROTOCOL, protocolForPlatform } from '../config/protocol';
import type { AnalysisConfig, Session } from '../types/session';
import { snapshotForceModel } from './predictForce';
import { finite, reanalyze } from './signal';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
const nullableBoolean = (value: unknown) => value === null || typeof value === 'boolean';

function validConfig(value: unknown): value is AnalysisConfig {
  if (!record(value)) return false;
  const expected =
    value.protocol_version === 'expo_desk_pinch_ios_pulsed_v1'
      ? protocolForPlatform('ios')
      : PROTOCOL;
  // This replay reader supports the existing 35-second protocol and analysis version only.
  if (
    value.protocol_version !== expected.protocol_version ||
    value.analysis_version !== expected.analysis_version
  )
    return false;
  for (const key of ['duration_ms', 'window_ms', 'hop_ms', 'phase_exclusion_ms'] as const)
    if (value[key] !== expected[key]) return false;
  for (const key of [
    'min_samples',
    'min_sample_span_ms',
    'max_gap_ms',
    'min_sensor_rate_hz',
    'numeric_epsilon_g',
    'weak_motor_ratio',
    'baseline_cv_note',
    'command_late_ms',
  ] as const)
    if (!finite(value[key]) || value[key] < 0) return false;
  if (
    !finite(value.min_valid_window_fraction) ||
    value.min_valid_window_fraction <= 0 ||
    value.min_valid_window_fraction > 1
  )
    return false;
  return (
    Array.isArray(value.phases) &&
    value.phases.length === expected.phases.length &&
    value.phases.every(
      (phase, i) =>
        record(phase) &&
        phase.id === expected.phases[i].id &&
        phase.start_ms === expected.phases[i].start_ms &&
        phase.end_ms === expected.phases[i].end_ms &&
        typeof phase.cue === 'string' &&
        phase.vibration === expected.phases[i].vibration,
    )
  );
}

/** Recompute from raw data into a new record; never write back to the selected source. */
export function replaySession(
  input: unknown,
  id = `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
): Session {
  if (
    !record(input) ||
    !['1.0', '2.0'].includes(String(input.schema_version)) ||
    typeof input.session_id !== 'string' ||
    !input.session_id ||
    id === input.session_id ||
    !['live', 'replay'].includes(String(input.data_origin)) ||
    !['completed', 'cancelled', 'error'].includes(String(input.status)) ||
    typeof input.started_at_utc !== 'string' ||
    !Number.isFinite(Date.parse(input.started_at_utc)) ||
    !finite(input.duration_ms) ||
    input.duration_ms < 0 ||
    input.duration_ms > 35000 ||
    (input.status === 'completed' && input.duration_ms !== 35000) ||
    !validConfig(input.config) ||
    input.protocol_version !== input.config.protocol_version ||
    input.analysis_version !== input.config.analysis_version ||
    !Array.isArray(input.raw_samples) ||
    input.raw_samples.length > 10000 ||
    !Array.isArray(input.events) ||
    input.events.length > 1000 ||
    !record(input.observations) ||
    !nullableBoolean(input.observations.phone_moved) ||
    !nullableBoolean(input.observations.extra_contact) ||
    typeof input.observations.note !== 'string' ||
    !record(input.environment)
  )
    throw new Error('지원하는 35초 측정 JSON(v1 또는 v2)을 선택해 주세요.');
  const phaseIds = input.config.phases.map((p) => p.id as string);
  if (
    !input.raw_samples.every(
      (sample) =>
        record(sample) &&
        finite(sample.index) &&
        finite(sample.received_relative_ms) &&
        sample.received_relative_ms >= 0 &&
        sample.received_relative_ms <= 35000 &&
        nullableNumber(sample.sensor_timestamp_s) &&
        [sample.x_g, sample.y_g, sample.z_g].every(nullableNumber) &&
        phaseIds.includes(String(sample.phase_id)),
    ) ||
    !input.events.every(
      (event) =>
        record(event) &&
        [
          'record_start',
          'phase_cue',
          'vibration_start_request',
          'vibration_start_skipped',
          'vibration_cancel_request',
          'record_stop',
        ].includes(String(event.type)) &&
        finite(event.planned_ms) &&
        finite(event.actual_ms) &&
        (event.phase_id === null || phaseIds.includes(String(event.phase_id))) &&
        (event.detail === null || typeof event.detail === 'string'),
    )
  )
    throw new Error('원본 표본 또는 이벤트 형식이 올바르지 않습니다.');
  const model = snapshotForceModel(
    input.schema_version === '1.0' ? DEMO_FORCE_MODEL : input.force_model,
  );
  const copy = JSON.parse(JSON.stringify(input)) as Session;
  return reanalyze({
    ...copy,
    schema_version: '2.0',
    session_id: id,
    data_origin: 'replay',
    source_session_id: input.session_id,
    source_data_origin: copy.data_origin,
    force_model: model,
  });
}
