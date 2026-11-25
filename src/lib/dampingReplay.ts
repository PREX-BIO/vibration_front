import { DAMPING_PROTOCOL, phaseSettle, recordingDuration } from '../config/dampingProtocol';
import type { DampingConfig, DampingSession, SensorSample } from '../types/damping';
import { createDampingSession, type DampingSeed } from './dampingController';
import { isFiniteNumber, phaseAtActual, reanalyzeDamping } from './dampingSignal';
import { replaySession } from './replaySession';

export function syntheticDampingSeed(): DampingSeed {
  return {
    id: `synthetic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    data_origin: 'synthetic_test',
    device: {
      model: null,
      os: 'synthetic',
      os_version: null,
      expo_version: null,
      app_version: null,
      runtime: null,
      sensors: {
        accelerometer: { available: true, permission: 'synthetic' },
        gyroscope: { available: true, permission: 'synthetic' },
      },
    },
    setup: {
      hand: 'right',
      pinch_type: 'thumb_index',
      table_material: 'wood',
      case_on: false,
      orientation: 'screen_up_top_away',
      contact_points: 'right_thumb_left_index_midpoints',
      note: '계산·화면 검증용 합성 신호',
    },
  };
}

export function createDampingExample(config: DampingConfig = DAMPING_PROTOCOL): DampingSession {
  const s = createDampingSession(syntheticDampingSeed(), new Date().toISOString(), config);
  const duration = recordingDuration(config);
  s.session.status = 'completed';
  s.session.actual_duration_ms = duration;
  s.session.ended_at_utc = new Date(Date.parse(s.session.started_at_utc) + duration).toISOString();
  for (const p of s.phases) {
    p.actual_start_ms = p.planned_start_ms;
    p.actual_end_ms = p.planned_end_ms;
    p.summary_start_ms = p.actual_start_ms + phaseSettle(s.config, p);
    p.summary_end_ms = p.actual_end_ms;
    p.completed = true;
    s.events.push({
      type: 'phase_transition',
      actual_ms: p.actual_start_ms,
      planned_ms: p.planned_start_ms,
      phase_id: p.phase_id,
      sensor: null,
      detail: 'synthetic; no cue or motor executed',
    });
  }
  s.vibration = {
    ...s.vibration,
    pattern: null,
    duration_ms: s.config.vibration_end_ms - s.config.vibration_start_ms,
    start_request_ms: 0,
    schedule_request_ms: 0,
    scheduled_start_ms: s.config.vibration_start_ms,
    scheduled_end_ms: s.config.vibration_end_ms,
    stop_request_ms: s.config.vibration_end_ms,
    start_succeeded: true,
    stop_succeeded: true,
  };
  s.events.push(
    {
      type: 'record_start',
      planned_ms: 0,
      actual_ms: 0,
      phase_id: 'off_pre',
      sensor: null,
      detail: 'synthetic; no acquisition executed',
    },
    {
      type: 'vibration_start_request',
      planned_ms: s.config.vibration_start_ms,
      actual_ms: s.config.vibration_start_ms,
      phase_id: phaseAtActual(s.phases, s.config.vibration_start_ms)!.phase_id,
      sensor: null,
      detail: 'synthetic; no motor command executed',
    },
    {
      type: 'vibration_cancel_request',
      planned_ms: s.config.vibration_end_ms,
      actual_ms: s.config.vibration_end_ms,
      phase_id: phaseAtActual(s.phases, s.config.vibration_end_ms)!.phase_id,
      sensor: null,
      detail: 'synthetic; no motor command executed',
    },
    {
      type: 'record_stop',
      planned_ms: duration,
      actual_ms: duration,
      phase_id: 'off_post',
      sensor: null,
      detail: 'synthetic complete',
    },
  );
  s.events.sort((a, b) => a.actual_ms - b.actual_ms);
  for (let t = 0; t < duration; t += 10) {
    const p = phaseAtActual(s.phases, t)!;
    // Calculation fixture with deliberately non-monotonic responses; no physical motor is simulated.
    const amplitude =
      p.target_level === 'off'
        ? 0.0002
        : p.target_level === 'low'
          ? 0.0012
          : p.target_level === 'medium'
            ? 0.0026
            : p.target_level === 'higher'
              ? 0.0008
              : 0.002;
    s.raw.accelerometer.push({
      sample_id: t / 10,
      sensor_timestamp_s: 5000 + t / 1000,
      t_receive_ms: t,
      x: Math.SQRT2 * amplitude * Math.sin((2 * Math.PI * 10 * t) / 1000),
      y: 0,
      z: 1,
      phase_id: p.phase_id,
      valid: true,
      reasons: [],
    });
    if (t % 20 === 0)
      s.raw.gyroscope.push({
        sample_id: t / 20,
        sensor_timestamp_s: 9000 + t / 1000,
        t_receive_ms: t + 2,
        x: 0,
        y: 0,
        z: p.target_level === 'medium' ? 0.1 : 0.015,
        phase_id: p.phase_id,
        valid: true,
        reasons: [],
      });
  }
  return reanalyzeDamping(s);
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const nullable = (v: unknown) => v === null || isFiniteNumber(v);

function validateDamping(input: unknown): asserts input is DampingSession {
  const fail = () => {
    throw new Error('측정 JSON의 설정·원본·시각 형식이 올바르지 않습니다.');
  };
  if (
    !record(input) ||
    !['3.0', '4.0'].includes(String(input.schema_version)) ||
    !record(input.session) ||
    !record(input.config) ||
    !record(input.raw) ||
    !record(input.device) ||
    !record(input.setup) ||
    !record(input.vibration) ||
    !Array.isArray(input.phases)
  )
    return fail();
  const s = input.session,
    c = input.config;
  if (
    typeof s.id !== 'string' ||
    typeof s.started_at_utc !== 'string' ||
    !Number.isFinite(Date.parse(s.started_at_utc)) ||
    !['completed', 'aborted'].includes(String(s.status)) ||
    !isFiniteNumber(s.actual_duration_ms) ||
    s.actual_duration_ms < 0 ||
    s.actual_duration_ms > 600000 ||
    !isFiniteNumber(s.planned_duration_ms) ||
    s.planned_duration_ms <= 0 ||
    s.planned_duration_ms > 600000 ||
    (c.recording_duration_ms ?? c.duration_ms) !== s.planned_duration_ms ||
    !['live', 'replay', 'synthetic_test'].includes(String(input.data_origin)) ||
    input.metric_scope !== 'observed_acceleration_variation' ||
    input.motor_isolation !== 'not_established' ||
    !['accel_ac_rms_2s_fixed_baseline_v1', 'accel_ac_rms_2s_continuous_31s_v1'].includes(
      String(input.analysis_version),
    ) ||
    c.analysis_version !== input.analysis_version ||
    c.protocol_version !== input.protocol_version ||
    c.window_ms !== 2000 ||
    c.hop_ms !== 100 ||
    c.phase_settle_ms !== 2000 ||
    !Array.isArray(c.phases) ||
    !input.phases.length ||
    input.phases.length > 30
  )
    return fail();
  for (const k of [
    'min_samples_per_window',
    'min_receive_span_ms',
    'max_sensor_gap_ms',
    'max_receive_gap_ms',
    'min_observed_sensor_hz',
    'numeric_epsilon_g',
    'weak_response_ratio_note',
    'baseline_cv_note',
  ])
    if (!isFiniteNumber(c[k]) || c[k] < 0) return fail();
  if (
    !isFiniteNumber(c.min_summary_valid_fraction) ||
    c.min_summary_valid_fraction <= 0 ||
    c.min_summary_valid_fraction > 1
  )
    return fail();
  if (
    !input.phases.every(
      (p) =>
        record(p) &&
        typeof p.phase_id === 'string' &&
        typeof p.cue === 'string' &&
        isFiniteNumber(p.planned_start_ms) &&
        isFiniteNumber(p.planned_end_ms) &&
        nullable(p.actual_start_ms) &&
        nullable(p.actual_end_ms) &&
        (p.actual_start_ms === null || (p.actual_start_ms as number) >= 0) &&
        (p.actual_end_ms === null ||
          (p.actual_end_ms as number) <= (s.actual_duration_ms as number)) &&
        (p.actual_start_ms === null
          ? p.actual_end_ms === null
          : p.actual_end_ms !== null &&
            (p.actual_end_ms as number) >= (p.actual_start_ms as number)) &&
        typeof p.completed === 'boolean',
    )
  )
    return fail();
  const active = input.phases.filter((p) => p.actual_start_ms !== null);
  if (active.some((p, i) => i > 0 && p.actual_start_ms < active[i - 1].actual_end_ms))
    return fail();
  if (
    !record(input.raw.units) ||
    input.raw.units.accelerometer !== 'g' ||
    input.raw.units.gyroscope !== 'rad/s'
  )
    return fail();
  if (
    !input.phases.some((p) => (p as Record<string, unknown>).phase_id === c.reference_phase_id) ||
    !record(input.observations) ||
    !record(input.device.sensors) ||
    !Array.isArray(input.events)
  )
    return fail();
  for (const sensor of ['accelerometer', 'gyroscope']) {
    const raw = input.raw[sensor];
    if (
      !record(input.device.sensors[sensor]) ||
      !Array.isArray(raw) ||
      raw.length > 100000 ||
      !raw.every(
        (v) =>
          record(v) &&
          isFiniteNumber(v.sample_id) &&
          isFiniteNumber(v.t_receive_ms) &&
          v.t_receive_ms >= 0 &&
          v.t_receive_ms <= (s.actual_duration_ms as number) &&
          [v.x, v.y, v.z, v.sensor_timestamp_s].every(nullable) &&
          typeof v.phase_id === 'string' &&
          typeof v.valid === 'boolean' &&
          Array.isArray(v.reasons) &&
          v.reasons.every((r) => typeof r === 'string'),
      )
    )
      return fail();
  }
  if (
    !input.events.every(
      (e) => record(e) && typeof e.type === 'string' && isFiniteNumber(e.actual_ms),
    )
  )
    return fail();
  if (![input.vibration.start_request_ms, input.vibration.stop_request_ms].every(nullable))
    return fail();
  if (input.schema_version === '4.0') {
    const android = c.protocol_version === 'expo_desk_pinch_continuous_31s_android_v1';
    // Replay retains the intensity used when the record was collected.
    const recordedIntensity =
      c.haptic_settings_id === 'continuous_i0.5_s0.5_v1'
        ? 0.5
        : c.haptic_settings_id === DAMPING_PROTOCOL.haptic_settings_id
          ? DAMPING_PROTOCOL.haptic_intensity
          : null;
    if (
      (!android && c.protocol_version !== DAMPING_PROTOCOL.protocol_version) ||
      c.analysis_version !== DAMPING_PROTOCOL.analysis_version ||
      c.recording_duration_ms !== recordingDuration(DAMPING_PROTOCOL) ||
      c.vibration_start_ms !== 3000 ||
      c.vibration_end_ms !== 28000 ||
      c.vibration_duration_ms !== 25000 ||
      c.off_phase_settle_ms !== 500 ||
      c.command_late_ms !== 250 ||
      c.vibration_mode !== (android ? 'android_continuous' : 'ios_core_haptics_continuous') ||
      recordedIntensity == null ||
      c.haptic_intensity !== recordedIntensity ||
      c.haptic_sharpness !== 0.5 ||
      c.phases.length !== DAMPING_PROTOCOL.phases.length ||
      input.phases.length !== c.phases.length ||
      input.vibration.duration_s !== 25 ||
      ![
        input.vibration.scheduled_start_ms,
        input.vibration.scheduled_end_ms,
        input.vibration.schedule_request_ms,
        input.vibration.response_received_ms,
        input.vibration.completion_received_ms,
        input.vibration.stop_response_received_ms,
      ].every(nullable) ||
      !Array.isArray(input.vibration.native_events)
    )
      return fail();
    for (const [i, p] of DAMPING_PROTOCOL.phases.entries()) {
      for (const stored of [c.phases[i], input.phases[i]]) {
        if (
          !record(stored) ||
          stored.phase_id !== p.phase_id ||
          stored.planned_start_ms !== p.planned_start_ms ||
          stored.planned_end_ms !== p.planned_end_ms
        )
          return fail();
      }
    }
    for (const event of input.vibration.native_events) {
      if (
        !record(event) ||
        typeof event.playback_id !== 'string' ||
        !['completed', 'stopped', 'engine_stopped', 'engine_reset', 'playback_error'].includes(
          String(event.type),
        ) ||
        !isFiniteNumber(event.native_event_ms) ||
        !isFiniteNumber(event.received_ms)
      )
        return fail();
    }
    const receipt = input.vibration.native_receipt;
    if (
      receipt !== null &&
      (!record(receipt) ||
        typeof receipt.playback_id !== 'string' ||
        ![
          'native_request_ms',
          'native_response_ms',
          'native_scheduled_start_ms',
          'native_scheduled_end_ms',
        ].every((key) => isFiniteNumber(receipt[key])))
    )
      return fail();
  }
}

/** Historical records keep their original timeline and analysis version. */
function legacyDamping(input: unknown): DampingSession {
  const old = replaySession(input);
  const original = input as {
    session_id: string;
    schema_version: string;
    analysis_version: string;
  };
  const config = {
    ...DAMPING_PROTOCOL,
    recording_duration_ms: undefined,
    duration_ms: old.config.duration_ms,
    analysis_version: 'accel_ac_rms_2s_fixed_baseline_v1',
    off_phase_settle_ms: undefined,
    command_late_ms: undefined,
    protocol_version: old.protocol_version,
    reference_phase_id: 'baseline',
    off_pre_phase_id: 'off_start',
    off_post_phase_id: 'off_end',
    vibration_start_ms: old.config.vibration_start_ms,
    vibration_end_ms: old.config.vibration_end_ms,
    vibration_duration_ms: old.config.vibration_end_ms - old.config.vibration_start_ms,
    haptic_intensity: undefined,
    haptic_sharpness: undefined,
    haptic_settings_id: undefined,
    vibration_mode: old.config.vibration_mode,
    ios_pulse_interval_ms: old.config.ios_pulse_interval_ms,
    ios_pulse_tail_guard_ms: old.config.ios_pulse_tail_guard_ms,
    phases: old.config.phases.map((p) => ({
      phase_id: p.id,
      target_level: p.id.startsWith('pinch_')
        ? ('pinch' as const)
        : !p.vibration
          ? ('off' as const)
          : p.id === 'motor_settle'
            ? ('settle' as const)
            : ('contact' as const),
      effort_cue: '이전 기록의 안내',
      cue: p.cue,
      planned_start_ms: p.start_ms,
      planned_end_ms: p.end_ms,
      actual_start_ms: null,
      actual_end_ms: null,
      summary_start_ms: null,
      summary_end_ms: null,
      completed: false,
    })),
  };
  const seed = syntheticDampingSeed();
  seed.data_origin = 'replay';
  seed.id = old.session_id;
  seed.device = {
    model: old.device_model_note || null,
    os: old.platform,
    os_version: null,
    expo_version: old.expo_sdk_version,
    app_version: old.app_version,
    runtime: old.runtime,
    sensors: {
      accelerometer: { available: true, permission: null },
      gyroscope: { available: false, permission: null },
    },
  };
  seed.setup = { ...seed.setup, ...old.environment };
  const s = createDampingSession(seed, old.started_at_utc, config);
  s.source_session_id = original.session_id;
  s.source_data_origin =
    old.platform === 'synthetic'
      ? 'synthetic_test'
      : (input as { data_origin: 'live' | 'replay' }).data_origin;
  s.source_schema_version = original.schema_version;
  s.source_analysis_version = original.analysis_version;
  s.session = {
    ...s.session,
    actual_duration_ms: old.duration_ms,
    ended_at_utc: old.ended_at_utc,
    status: old.status === 'completed' ? 'completed' : 'aborted',
    abort_reason: old.status === 'completed' ? null : old.status,
  };
  s.events = old.events.map((e) => ({ ...e, sensor: null }));
  for (const p of s.phases) {
    const event = old.events.find(
      (e) =>
        e.type === 'phase_cue' && e.phase_id === p.phase_id && !e.detail?.startsWith('skipped:'),
    );
    p.actual_start_ms = event?.actual_ms ?? (p.planned_start_ms === 0 ? 0 : null);
  }
  const active = s.phases.filter(
    (p) => p.actual_start_ms !== null && p.actual_start_ms <= old.duration_ms,
  );
  active.forEach((p, i) => {
    p.actual_end_ms = active[i + 1]?.actual_start_ms ?? old.duration_ms;
    p.summary_start_ms = p.actual_start_ms! + config.phase_settle_ms;
    p.summary_end_ms = p.actual_end_ms;
    p.completed = i < active.length - 1 || old.status === 'completed';
  });
  s.raw.accelerometer = old.raw_samples.map((r): SensorSample => ({
    sample_id: r.index,
    sensor_timestamp_s: r.sensor_timestamp_s,
    t_receive_ms: r.received_relative_ms,
    x: r.x_g,
    y: r.y_g,
    z: r.z_g,
    phase_id: phaseAtActual(s.phases, r.received_relative_ms)?.phase_id ?? r.phase_id,
    valid: [r.x_g, r.y_g, r.z_g, r.sensor_timestamp_s].every(isFiniteNumber),
    reasons: [r.x_g, r.y_g, r.z_g, r.sensor_timestamp_s].every(isFiniteNumber)
      ? []
      : ['invalid_legacy_sample'],
  }));
  const start = old.events.find((e) => e.type === 'vibration_start_request');
  s.vibration.start_request_ms = start?.actual_ms ?? null;
  s.vibration.start_succeeded = !!start;
  const stop = old.events.find((e) => e.type === 'vibration_cancel_request');
  s.vibration.stop_request_ms = stop?.actual_ms ?? null;
  s.vibration.stop_succeeded = !!stop;
  if (start?.detail) {
    try {
      const request = JSON.parse(start.detail);
      if (Array.isArray(request.pattern)) s.vibration.pattern = request.pattern;
    } catch {
      /* Unknown historical command stays unknown. */
    }
  }
  s.vibration.interval_ms = old.config.ios_pulse_interval_ms;
  s.observations = { ...old.observations };
  return reanalyzeDamping(s);
}

export function importDamping(input: unknown): DampingSession {
  if (record(input) && (input.schema_version === '1.0' || input.schema_version === '2.0'))
    return legacyDamping(input);
  validateDamping(input);
  const copy = JSON.parse(JSON.stringify(input)) as DampingSession;
  copy.source_session_id = input.session.id;
  copy.source_data_origin = input.source_data_origin ?? input.data_origin;
  copy.source_schema_version = input.schema_version;
  copy.source_analysis_version = input.analysis_version;
  copy.session.id = `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  copy.data_origin = 'replay';
  return reanalyzeDamping(copy);
}
