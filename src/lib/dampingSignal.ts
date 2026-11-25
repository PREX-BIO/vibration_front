import { phaseSettle, vibrationInterval } from '../config/dampingProtocol';
import type {
  Axis3,
  DampingConfig,
  DampingPhase,
  DampingSession,
  Distribution,
  FeatureFrame,
  SensorQuality,
  SensorSample,
} from '../types/damping';

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export function quantile(values: number[], p: number): number | null {
  if (!values.length || values.some((v) => !isFiniteNumber(v))) return null;
  const a = [...values].sort((x, y) => x - y),
    index = (a.length - 1) * p;
  const lo = Math.floor(index),
    hi = Math.ceil(index);
  return a[lo] + (a[hi] - a[lo]) * (index - lo);
}
export function rate(times: (number | null)[], units: number): number | null {
  if (times.length < 2 || times.some((t) => !isFiniteNumber(t))) return null;
  const gaps = times.slice(1).map((t, i) => t! - times[i]!);
  if (gaps.some((g) => g <= 0)) return null;
  const median = quantile(gaps, 0.5)!;
  return isFiniteNumber(units / median) ? units / median : null;
}
export function vectorStats(samples: Pick<SensorSample, 'x' | 'y' | 'z'>[]) {
  if (!samples.length || samples.some((s) => ![s.x, s.y, s.z].every(isFiniteNumber))) return null;
  const mean: Axis3 = [0, 0, 0],
    m2: Axis3 = [0, 0, 0];
  let squares = 0;
  samples.forEach((s, i) => {
    [s.x!, s.y!, s.z!].forEach((value, axis) => {
      const delta = value - mean[axis];
      mean[axis] += delta / (i + 1);
      m2[axis] += delta * (value - mean[axis]);
      squares += value * value;
    });
  });
  const axes = m2.map((v) => Math.sqrt(Math.max(0, v / samples.length))) as Axis3;
  const ac = Math.hypot(...axes),
    magnitude = Math.sqrt(squares / samples.length);
  return [...mean, ...axes, ac, magnitude].every(isFiniteNumber)
    ? { mean, axes, ac, magnitude }
    : null;
}

export function sensorWindow(
  raw: SensorSample[],
  end: number,
  config: DampingConfig,
  available = true,
) {
  const start = end - config.window_ms;
  const selected = raw.filter((s) => s.t_receive_ms >= start && s.t_receive_ms < end);
  const first = selected.length ? raw.indexOf(selected[0]) : -1;
  const adjacent = first > 0 ? [raw[first - 1], ...selected] : selected;
  const reasons = new Set<string>();
  if (!available) reasons.add('sensor_unavailable');
  if (selected.length < config.min_samples_per_window) reasons.add('insufficient_samples');
  const span = selected.length ? selected.at(-1)!.t_receive_ms - selected[0].t_receive_ms : null;
  if (span === null || span < config.min_receive_span_ms) reasons.add('short_receive_span');
  for (const s of selected) {
    if (!s.valid) s.reasons.forEach((r) => reasons.add(r));
    if (![s.x, s.y, s.z].every(isFiniteNumber)) reasons.add('invalid_axis');
  }
  let monotonic =
    adjacent.length > 1 && adjacent.every((s) => isFiniteNumber(s.sensor_timestamp_s));
  const nativeGaps: number[] = [],
    receiveGaps: number[] = [];
  for (let i = 1; i < adjacent.length; i++) {
    const previous = adjacent[i - 1],
      current = adjacent[i];
    const receiveGap = current.t_receive_ms - previous.t_receive_ms;
    receiveGaps.push(receiveGap);
    if (!isFiniteNumber(receiveGap) || receiveGap < 0) reasons.add('invalid_receive_time');
    if (isFiniteNumber(previous.sensor_timestamp_s) && isFiniteNumber(current.sensor_timestamp_s)) {
      const gap = (current.sensor_timestamp_s - previous.sensor_timestamp_s) * 1000;
      nativeGaps.push(gap);
      if (gap <= 0) monotonic = false;
    }
  }
  if (!monotonic) reasons.add('invalid_sensor_timestamp');
  const nativeMax = nativeGaps.length ? Math.max(...nativeGaps) : null;
  const receiveMax = receiveGaps.length ? Math.max(...receiveGaps) : null;
  if (nativeMax !== null && nativeMax > config.max_sensor_gap_ms) reasons.add('sensor_gap');
  if (receiveMax !== null && receiveMax > config.max_receive_gap_ms) reasons.add('receive_gap');
  const sensorRate = monotonic
    ? rate(
        selected.map((s) => s.sensor_timestamp_s),
        1,
      )
    : null;
  if (sensorRate !== null && sensorRate + 1e-7 < config.min_observed_sensor_hz)
    reasons.add('low_sample_rate');
  const stats = vectorStats(selected);
  if (!stats && selected.length) reasons.add('invalid_axis');
  const quality: SensorQuality = {
    sample_count: selected.length,
    receive_span_ms: span,
    timestamp_monotonic: monotonic,
    sensor_rate_hz: sensorRate,
    receive_rate_hz: rate(
      selected.map((s) => s.t_receive_ms),
      1000,
    ),
    max_sensor_gap_ms: nativeMax,
    max_receive_gap_ms: receiveMax,
    valid: reasons.size === 0 && stats !== null,
    reasons: [...reasons],
  };
  return { quality, stats: quality.valid ? stats : null };
}

export function phaseAtActual(phases: DampingPhase[], ms: number): DampingPhase | undefined {
  return phases.find(
    (p) =>
      p.actual_start_ms !== null && ms >= p.actual_start_ms && ms < (p.actual_end_ms ?? Infinity),
  );
}

export function analyzeDampingWindow(
  s: DampingSession,
  end: number,
  config = s.config,
): FeatureFrame {
  const start = end - config.window_ms;
  const a = sensorWindow(
    s.raw.accelerometer,
    end,
    config,
    s.device.sensors.accelerometer.available !== false &&
      s.device.sensors.accelerometer.permission !== 'denied',
  );
  const g = sensorWindow(
    s.raw.gyroscope,
    end,
    config,
    s.device.sensors.gyroscope.available !== false &&
      s.device.sensors.gyroscope.permission !== 'denied',
  );
  const phases = s.phases.filter(
    (p) =>
      p.actual_start_ms !== null &&
      p.actual_start_ms < end &&
      (p.actual_end_ms ?? Infinity) > start,
  );
  const phase = phaseAtActual(s.phases, end - 1e-7);
  const { on, off } = vibrationInterval(s);
  const crossesCommand = [on, off].some((t) => t !== null && t > start && t < end);
  const motorOff = on === null || end <= on || (off !== null && start >= off);
  const stableTime =
    phases.length === 1 &&
    phase !== undefined &&
    start >= phase.actual_start_ms! + phaseSettle(config, phase);
  const motorMatches =
    phase?.target_level === 'off'
      ? motorOff
      : on !== null && start >= on && (off === null || end <= off);
  const eligible = stableTime && (s.schema_version !== '4.0' || motorMatches);
  const settling =
    phases.length === 1 &&
    (phase?.target_level === 'settle' ||
      (s.schema_version === '4.0' &&
        phase?.phase_id === config.reference_phase_id &&
        on !== null &&
        start >= on &&
        end <= Math.max(on, phase.actual_start_ms!) + config.phase_settle_ms));
  const context: FeatureFrame['context'] = crossesCommand
    ? 'phase_transition'
    : motorOff
      ? 'motor_off'
      : settling
        ? 'motor_settle'
        : !eligible
          ? 'phase_transition'
          : 'steady';
  return {
    frame_id: Math.round((end - config.window_ms) / config.hop_ms),
    window_start_ms: start,
    window_end_ms: end,
    phase_id_at_end: phase?.phase_id ?? 'unknown',
    included_phase_ids: phases.map((p) => p.phase_id),
    baseline_id: null,
    accel: {
      ...a.quality,
      mean_g: a.stats?.mean ?? null,
      axis_ac_rms_g: a.stats?.axes ?? null,
      ac_rms_g: a.stats?.ac ?? null,
      ratio_to_baseline: null,
      reduction_pct: null,
    },
    gyro: {
      ...g.quality,
      mean_rad_s: g.stats?.mean ?? null,
      axis_ac_rms_rad_s: g.stats?.axes ?? null,
      ac_rms_rad_s: g.stats?.ac ?? null,
      rms_magnitude_rad_s: g.stats?.magnitude ?? null,
    },
    reduction_valid: false,
    reduction_reasons: ['baseline_unavailable'],
    context,
    summary_eligible: eligible,
  };
}

function phaseFrames(s: DampingSession, phase: DampingPhase, frames: FeatureFrame[]) {
  const from =
    phase.actual_start_ms === null ? null : phase.actual_start_ms + phaseSettle(s.config, phase);
  const end = phase.actual_end_ms ?? s.session.actual_duration_ms;
  let expected = 0;
  if (from !== null)
    for (let t = s.config.window_ms; t <= end; t += s.config.hop_ms)
      if (t - s.config.window_ms >= from) expected++;
  return {
    expected,
    selected:
      from === null
        ? []
        : frames.filter(
            (f) =>
              f.window_start_ms >= from &&
              f.window_end_ms <= end &&
              (s.schema_version !== '4.0' || f.summary_eligible),
          ),
    from,
    end,
  };
}
function distribution(
  values: (number | null)[],
  expected: number,
  complete: boolean,
  fraction: number,
): Distribution {
  const valid = values.filter(isFiniteNumber);
  const reasons: string[] = [];
  if (!complete) reasons.push('incomplete_phase');
  if (!expected || valid.length / expected < fraction) reasons.push('insufficient_valid_windows');
  return {
    median: reasons.length ? null : quantile(valid, 0.5),
    p25: reasons.length ? null : quantile(valid, 0.25),
    p75: reasons.length ? null : quantile(valid, 0.75),
    valid_frames: valid.length,
    expected_frames: expected,
    valid: reasons.length === 0,
    reasons,
  };
}
export function reductionPct(a: number | null, baseline: number | null): number | null {
  if (!isFiniteNumber(a) || a < 0 || !isFiniteNumber(baseline) || baseline <= 0) return null;
  const value = 100 * (1 - a / baseline);
  return isFiniteNumber(value) ? value : null;
}

/** Same pure path for live snapshots, final saves and imported records. */
export function summarizeDamping(s: DampingSession, input: FeatureFrame[]): DampingSession {
  const reference = s.phases.find((p) => p.phase_id === s.config.reference_phase_id)!;
  const selection = phaseFrames(s, reference, input);
  const baselineValues = selection.selected
    .filter((f) => f.accel.valid)
    .map((f) => f.accel.ac_rms_g!);
  const bd = distribution(
    baselineValues,
    selection.expected,
    reference.completed,
    s.config.min_summary_valid_fraction,
  );
  const b = bd.median !== null && bd.median > s.config.numeric_epsilon_g ? bd.median : null;
  const baseline = {
    baseline_id: `${reference.phase_id}_1`,
    accel_ac_rms_g: b,
    source_start_ms: selection.from,
    source_end_ms: reference.actual_end_ms,
    frame_ids: selection.selected.filter((f) => f.accel.valid).map((f) => f.frame_id),
    available_at_ms: reference.completed ? reference.actual_end_ms : null,
    valid: b !== null,
    reasons: b !== null ? [] : [...bd.reasons, ...(bd.median !== null ? ['zero_baseline'] : [])],
  };
  const frames = input.map((f) => {
    const d = f.accel.valid ? reductionPct(f.accel.ac_rms_g, b) : null;
    return {
      ...f,
      baseline_id: b === null ? null : baseline.baseline_id,
      accel: {
        ...f.accel,
        ratio_to_baseline: d === null ? null : f.accel.ac_rms_g! / b!,
        reduction_pct: d,
      },
      reduction_valid: d !== null,
      reduction_reasons:
        d !== null ? [] : [...f.accel.reasons, ...(b === null ? ['baseline_unavailable'] : [])],
    };
  });
  const timingMismatch =
    s.schema_version === '4.0' &&
    (s.events.some((e) => e.type === 'timing_mismatch' || e.type === 'phase_skipped') ||
      s.phases.some(
        (p) =>
          (p.actual_start_ms === null && s.session.status === 'completed') ||
          (p.actual_start_ms !== null &&
            Math.abs(p.actual_start_ms - p.planned_start_ms) > s.config.command_late_ms!),
      ));
  const comparisonReasons = timingMismatch ? ['timing_mismatch'] : [];
  if (s.schema_version === '4.0' && s.session.status === 'aborted')
    comparisonReasons.push('aborted');
  const summaries = s.phases.map((p) => {
    const { selected, expected } = phaseFrames(s, p, frames);
    const summarize = (values: (number | null)[]) => {
      const d = distribution(values, expected, p.completed, s.config.min_summary_valid_fraction);
      return comparisonReasons.length
        ? {
            ...d,
            median: null,
            p25: null,
            p75: null,
            valid: false,
            reasons: [...d.reasons, ...comparisonReasons],
          }
        : d;
    };
    return {
      phase_id: p.phase_id,
      accel_ac_rms_g: summarize(selected.map((f) => (f.accel.valid ? f.accel.ac_rms_g : null))),
      accel_reduction_pct: summarize(selected.map((f) => f.accel.reduction_pct)),
      gyro_rms_magnitude_rad_s: summarize(
        selected.map((f) => (f.gyro.valid ? f.gyro.rms_magnitude_rad_s : null)),
      ),
    };
  });
  const offPre = summaries.find((p) => p.phase_id === s.config.off_pre_phase_id) ?? null;
  const off = offPre?.accel_ac_rms_g.median;
  const response = b !== null && off != null && off > s.config.numeric_epsilon_g ? b / off : null;
  const mean = baselineValues.length
    ? baselineValues.reduce((a, v) => a + v, 0) / baselineValues.length
    : 0;
  const cv =
    b !== null && mean > s.config.numeric_epsilon_g
      ? Math.sqrt(baselineValues.reduce((a, v) => a + (v - mean) ** 2, 0) / baselineValues.length) /
        mean
      : null;
  const notes: string[] = [];
  if (timingMismatch) notes.push('timing_mismatch');
  if (reference.completed && b === null) notes.push('baseline_unavailable');
  if (response !== null && response < s.config.weak_response_ratio_note)
    notes.push('weak_motor_response');
  if (cv !== null && cv > s.config.baseline_cv_note) notes.push('unstable_baseline');
  if (s.observations.phone_moved || s.observations.extra_contact) notes.push('manual_artifact');
  if (s.session.status === 'aborted') notes.push('aborted');
  if (s.vibration.start_succeeded === false) notes.push('vibration_start_failed');
  if (s.vibration.stop_succeeded === false) notes.push('vibration_stop_failed');
  const stats = (sensor: 'accelerometer' | 'gyroscope') => ({
    sample_count: s.raw[sensor].length,
    invalid_samples: s.raw[sensor].filter((v) => !v.valid).length,
    invalid_frames: frames.filter(
      (f) => !(sensor === 'accelerometer' ? f.accel.valid : f.gyro.valid),
    ).length,
    sensor_rate_hz: rate(
      s.raw[sensor].map((v) => v.sensor_timestamp_s),
      1,
    ),
    receive_rate_hz: rate(
      s.raw[sensor].map((v) => v.t_receive_ms),
      1000,
    ),
    gap_events: s.events.filter((e) => e.type === 'sensor_gap' && e.sensor === sensor).length,
    timestamp_resets: s.events.filter((e) => e.type === 'timestamp_reset' && e.sensor === sensor)
      .length,
  });
  return {
    ...s,
    baseline,
    features: frames,
    summary: {
      phases: summaries,
      off_pre: offPre,
      off_post: summaries.find((p) => p.phase_id === s.config.off_post_phase_id) ?? null,
      baseline_cv: cv,
      baseline_to_off_pre_ratio: response,
      quality_notes: notes,
      sensors: { accelerometer: stats('accelerometer'), gyroscope: stats('gyroscope') },
    },
  };
}

export function reanalyzeDamping(s: DampingSession): DampingSession {
  const frames: FeatureFrame[] = [];
  for (let end = s.config.window_ms; end <= s.session.actual_duration_ms; end += s.config.hop_ms)
    frames.push(analyzeDampingWindow(s, end));
  return summarizeDamping(s, frames);
}

export function detailFrames(s: DampingSession): FeatureFrame[] {
  const config = {
    ...s.config,
    window_ms: 500,
    min_samples_per_window: 20,
    min_receive_span_ms: 400,
  };
  const frames: FeatureFrame[] = [];
  for (let end = 500; end <= s.session.actual_duration_ms; end += config.hop_ms)
    frames.push(analyzeDampingWindow(s, end, config));
  return frames; // Detail only: never substitutes a different baseline or main reduction curve.
}
