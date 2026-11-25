import { isRatioPhase, phaseForWindow, PROTOCOL } from '../config/protocol';
import { DEMO_FORCE_MODEL } from '../config/demoForceModel';
import type { ForceModel } from '../types/force';
import { predictForce } from './predictForce';
import type {
  AnalysisConfig,
  Feature,
  PhaseId,
  QualityReason,
  RawSample,
  Session,
  SessionEvent,
  Summary,
  SignalWindow,
} from '../types/session';

export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function median(values: number[]): number | null {
  if (!values.length || values.some((value) => !finite(value))) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function rms(samples: Pick<RawSample, 'x_g' | 'y_g' | 'z_g'>[]): number | null {
  if (!samples.length || samples.some((s) => !finite(s.x_g) || !finite(s.y_g) || !finite(s.z_g)))
    return null;
  // Welford's algorithm removes the mean of each axis without cancellation near 1 g.
  const mean = [0, 0, 0];
  const m2 = [0, 0, 0];
  samples.forEach((sample, i) => {
    [sample.x_g!, sample.y_g!, sample.z_g!].forEach((value, axis) => {
      const delta = value - mean[axis];
      mean[axis] += delta / (i + 1);
      m2[axis] += delta * (value - mean[axis]);
    });
  });
  const value = Math.sqrt(Math.max(0, (m2[0] + m2[1] + m2[2]) / samples.length));
  return finite(value) ? value : null;
}

export function observedRate(times: (number | null)[], unitsPerSecond: number): number | null {
  if (times.length < 2 || times.some((time) => !finite(time))) return null;
  const gaps = times.slice(1).map((time, i) => time! - times[i]!);
  if (gaps.some((gap) => gap <= 0)) return null;
  const gap = median(gaps);
  return gap && finite(unitsPerSecond / gap) ? unitsPerSecond / gap : null;
}

export function analyzeWindow(raw: RawSample[], end: number, config = PROTOCOL): SignalWindow {
  const start = end - config.window_ms;
  const samples = raw.filter(
    (s) => s.received_relative_ms >= start && s.received_relative_ms < end,
  );
  const firstIndex = samples.length ? raw.indexOf(samples[0]) : -1;
  // Include the predecessor: a gap crossing the left edge still affects this window.
  const adjacent = firstIndex > 0 ? [raw[firstIndex - 1], ...samples] : samples;
  const reasons = new Set<QualityReason>();
  if (samples.length < config.min_samples) reasons.add('insufficient_samples');
  if (
    !samples.length ||
    samples.at(-1)!.received_relative_ms - samples[0].received_relative_ms <
      config.min_sample_span_ms
  )
    reasons.add('short_receive_span');
  if (samples.some((s) => !finite(s.x_g) || !finite(s.y_g) || !finite(s.z_g)))
    reasons.add('invalid_axis');
  if (adjacent.some((s) => !finite(s.sensor_timestamp_s))) reasons.add('invalid_sensor_timestamp');
  for (let i = 1; i < adjacent.length; i++) {
    const previous = adjacent[i - 1];
    const current = adjacent[i];
    const receiveGap = current.received_relative_ms - previous.received_relative_ms;
    if (!finite(receiveGap) || receiveGap < 0) reasons.add('invalid_receive_time');
    if (receiveGap > config.max_gap_ms) reasons.add('sample_gap');
    if (finite(current.sensor_timestamp_s) && finite(previous.sensor_timestamp_s)) {
      const sensorGap = (current.sensor_timestamp_s - previous.sensor_timestamp_s) * 1000;
      if (sensorGap <= 0) reasons.add('invalid_sensor_timestamp');
      if (sensorGap > config.max_gap_ms) reasons.add('sample_gap');
      if (Math.abs(sensorGap - receiveGap) > config.max_gap_ms) reasons.add('delivery_jitter');
    }
  }
  const rate = observedRate(
    samples.map((s) => s.sensor_timestamp_s),
    1,
  );
  if (rate !== null && rate < config.min_sensor_rate_hz) reasons.add('low_sample_rate');
  const value = rms(samples);
  if (value === null && samples.length && !reasons.has('invalid_axis')) reasons.add('invalid_axis');
  const valid = reasons.size === 0 && value !== null;
  const phase = phaseForWindow(start, end, config);
  return {
    start_ms: start,
    end_ms: end,
    phase_id: phase,
    sample_count: samples.length,
    rms_g: valid ? value : null,
    ratio: null,
    valid,
    reasons: [...reasons, ...(phase === 'transition' ? ['transition' as const] : [])],
  };
}

export function latePhases(events: SessionEvent[], config: AnalysisConfig): Set<PhaseId> {
  const late = new Set<PhaseId>();
  for (const event of events) {
    if (event.actual_ms - event.planned_ms <= config.command_late_ms) continue;
    if (event.type === 'phase_cue' && event.phase_id) late.add(event.phase_id);
    if (event.type === 'vibration_start_request' || event.type === 'vibration_start_skipped') {
      // Every vibrating phase intersected by the delayed onset is affected.
      for (const phase of config.phases) {
        if (phase.vibration && phase.start_ms < event.actual_ms) late.add(phase.id);
      }
    }
    if (event.type === 'vibration_cancel_request' && event.planned_ms === config.vibration_end_ms)
      late.add('off_end');
  }
  return late;
}

function phaseValues(
  id: PhaseId,
  features: SignalWindow[],
  config: AnalysisConfig,
  elapsed: number,
  late: Set<PhaseId>,
  field: 'rms_g' | 'ratio',
) {
  const phase = config.phases.find((item) => item.id === id)!;
  const start = phase.start_ms + config.phase_exclusion_ms;
  let expected = 0;
  for (let end = config.window_ms; end <= phase.end_ms; end += config.hop_ms) {
    if (end - config.window_ms >= start) expected++;
  }
  const selected = features.filter((f) => f.start_ms >= start && f.end_ms <= phase.end_ms);
  const values = selected.filter((f) => f.valid && finite(f[field])).map((f) => f[field]!);
  const reasons: QualityReason[] = [];
  if (elapsed < phase.end_ms) reasons.push('incomplete_phase');
  if (late.has(id)) reasons.push('command_late');
  if (!expected || values.length / expected < config.min_valid_window_fraction)
    reasons.push('insufficient_valid_windows');
  return { value: reasons.length ? null : median(values), values, reasons };
}

export function summarize(
  raw: RawSample[],
  input: SignalWindow[],
  events: SessionEvent[],
  config = PROTOCOL,
  elapsed = config.duration_ms,
  completed = false,
  moved = false,
  model: ForceModel = DEMO_FORCE_MODEL,
): { features: Feature[]; summary: Summary } {
  const late = latePhases(events, config);
  const baseline = phaseValues('baseline', input, config, elapsed, late, 'rms_g');
  const b =
    baseline.value !== null && baseline.value > config.numeric_epsilon_g ? baseline.value : null;
  const off = phaseValues('off_start', input, config, elapsed, late, 'rms_g').value;
  const features = input.map((f) => {
    const ratio =
      b !== null && f.valid && f.rms_g !== null && isRatioPhase(f.phase_id) ? f.rms_g / b : null;
    return {
      ...f,
      ratio,
      force_estimate: predictForce({ accel_rms_ratio: ratio }, model, {
        protocol_version: config.protocol_version,
        reasons: [
          ...(!f.valid ? f.reasons : []),
          ...(b === null ? ['baseline_unavailable'] : []),
          ...(!isRatioPhase(f.phase_id) ? ['ineligible_phase'] : []),
        ],
      }),
    };
  });
  const mean = baseline.values.length
    ? baseline.values.reduce((sum, value) => sum + value, 0) / baseline.values.length
    : 0;
  const cv =
    b !== null && mean > config.numeric_epsilon_g && baseline.values.length > 1
      ? Math.sqrt(
          baseline.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (baseline.values.length - 1),
        ) / mean
      : null;
  const motor = b !== null && off !== null && off > config.numeric_epsilon_g ? b / off : null;
  const trials = (
    [
      ['pinch_1', 'baseline'],
      ['pinch_2', 'light_1'],
      ['pinch_3', 'light_2'],
    ] as const
  ).map(([pinch, light], i) => {
    const p = phaseValues(pinch, features, config, elapsed, late, 'ratio');
    const l = phaseValues(light, features, config, elapsed, late, 'ratio');
    const reasons = [
      ...new Set([
        ...p.reasons,
        ...l.reasons,
        ...(b === null ? ['baseline_unavailable' as const] : []),
      ]),
    ];
    const valid = reasons.length === 0 && p.value !== null && l.value !== null;
    return {
      trial: i + 1,
      pinch_ratio: p.value,
      preceding_light_ratio: l.value,
      delta: valid ? p.value! - l.value! : null,
      valid,
      reasons,
      force_estimate: predictForce({ accel_rms_ratio: p.value }, model, {
        protocol_version: config.protocol_version,
        reasons: [...p.reasons, ...(b === null ? ['baseline_unavailable'] : [])],
      }),
    };
  });
  const notes = new Set<QualityReason>(
    features.flatMap((f) => f.reasons).filter((reason) => reason !== 'transition'),
  );
  if (b === null && elapsed >= 9000) notes.add('baseline_unavailable');
  if (late.size) notes.add('command_late');
  if (motor !== null && motor < config.weak_motor_ratio) notes.add('weak_motor_response');
  if (cv !== null && cv > config.baseline_cv_note) notes.add('unstable_baseline');
  if (!completed) notes.add('incomplete_session');
  if (moved) notes.add('manual_artifact');
  const forceReasons = [
    ...new Set([
      ...(!completed ? ['incomplete_session'] : []),
      ...trials.flatMap((t) => t.force_estimate.reasons),
    ]),
  ];
  const forceValid = completed && trials.every((t) => t.force_estimate.valid);
  return {
    features,
    summary: {
      sensor_rate_hz: observedRate(
        raw.map((s) => s.sensor_timestamp_s),
        1,
      ),
      receive_rate_hz: observedRate(
        raw.map((s) => s.received_relative_ms),
        1000,
      ),
      baseline_rms_g: b,
      off_rms_g: off,
      motor_response_ratio: motor,
      baseline_cv: cv,
      trials,
      final_light_ratio: phaseValues('light_3', features, config, elapsed, late, 'ratio').value,
      median_trial_delta:
        completed && trials.every((t) => t.valid) ? median(trials.map((t) => t.delta!)) : null,
      quality_notes: [...notes],
      pinch_force_kgf: null,
      force_estimate: {
        value_kgf: forceValid ? median(trials.map((t) => t.force_estimate.value_kgf!)) : null,
        kind: 'demo',
        model_id: model.model_id,
        aggregation: 'median_of_three_trial_estimates',
        valid: forceValid,
        reasons: forceReasons,
      },
    },
  };
}

export function reanalyze(session: Session): Session {
  const features: SignalWindow[] = [];
  for (
    let end = session.config.window_ms;
    end <= Math.min(session.duration_ms, session.config.duration_ms);
    end += session.config.hop_ms
  )
    features.push(analyzeWindow(session.raw_samples, end, session.config));
  const result = summarize(
    session.raw_samples,
    features,
    session.events,
    session.config,
    session.duration_ms,
    session.status === 'completed',
    session.observations.phone_moved === true || session.observations.extra_contact === true,
    session.force_model,
  );
  return { ...session, ...result };
}
