const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PROTOCOL, phaseAt, phaseForWindow } = require('../.test-build/config/protocol.js');
const { analyzeWindow, rms, reanalyze, observedRate } = require('../.test-build/lib/signal.js');
const { createReplay } = require('../.test-build/lib/replay.js');
const { serializeSession, sessionFilename } = require('../.test-build/lib/sessionJson.js');
const { chartSegments } = require('../.test-build/lib/chart.js');

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
function samples(amplitude = 0.02, interval = 10, length = 1000) {
  return Array.from({ length: Math.ceil(length / interval) }, (_, i) => ({
    index: i,
    sensor_timestamp_s: 5000 + (i * interval) / 1000,
    received_relative_ms: i * interval,
    x_g: amplitude * Math.sin((2 * Math.PI * 10 * i * interval) / 1000),
    y_g: 0,
    z_g: 1,
    phase_id: 'off_start',
  }));
}

test('constant gravity, on any axis, has zero AC RMS', () => {
  near(rms(Array.from({ length: 50 }, () => ({ x_g: 0.3, y_g: -0.4, z_g: 0.866 }))), 0);
});
test('10 Hz sine at 100 Hz has amplitude / sqrt(2) RMS', () => {
  near(analyzeWindow(samples(), 500).rms_g, 0.02 / Math.sqrt(2));
});
test('doubling amplitude doubles RMS', () => {
  near(rms(samples(0.04)) / rms(samples(0.02)), 2);
});
test('empty windows and NaN axes remain null', () => {
  assert.equal(rms([]), null);
  assert.equal(rms([{ x_g: NaN, y_g: 0, z_g: 1 }]), null);
  const raw = samples();
  raw[20].z_g = NaN;
  const result = analyzeWindow(raw, 500);
  assert.equal(result.rms_g, null);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('invalid_axis'));
  assert.equal(analyzeWindow([], 500).rms_g, null);
});
test('zero baseline never creates a ratio, infinity or a force estimate', () => {
  const session = createReplay();
  session.raw_samples.forEach((sample) => {
    sample.x_g = 0;
  });
  const result = reanalyze(session);
  assert.equal(result.summary.baseline_rms_g, null);
  assert.ok(result.features.every((f) => f.ratio === null));
  assert.equal(result.summary.median_trial_delta, null);
  assert.equal(result.summary.pinch_force_kgf, null);
});
test('1.2 baseline ratios are preserved above 1, without clipping', () => {
  const session = createReplay();
  session.raw_samples.forEach((s) => {
    if (s.phase_id.startsWith('pinch_')) s.x_g *= 1.5;
  });
  const result = reanalyze(session);
  result.summary.trials.forEach((t) => {
    assert.equal(t.valid, true);
    near(t.pinch_ratio, 1.2);
    near(t.delta, 0.2);
  });
});
test('sensor clock origin does not affect phase assignment or rates', () => {
  const session = createReplay();
  const expected = session.summary;
  session.raw_samples.forEach((s) => {
    s.sensor_timestamp_s += 100000;
  });
  const result = reanalyze(session);
  near(result.summary.sensor_rate_hz, 100, 0.0001);
  near(result.summary.median_trial_delta, expected.median_trial_delta);
});
test('missing, duplicate and reversed sensor timestamps invalidate windows', () => {
  for (const value of [null, 5000.19, 4999]) {
    const raw = samples();
    raw[20].sensor_timestamp_s = value;
    const feature = analyzeWindow(raw, 500);
    assert.equal(feature.valid, false);
    assert.ok(feature.reasons.includes('invalid_sensor_timestamp'));
  }
});
test('a gap crossing the left window boundary is detected using the predecessor', () => {
  const raw = samples().filter(
    (s) => s.received_relative_ms <= 350 || s.received_relative_ms >= 500,
  );
  const feature = analyzeWindow(raw, 1000);
  assert.equal(feature.valid, false);
  assert.ok(feature.reasons.includes('sample_gap'));
});
test('slow sensor delivery is invalid even when enough samples exist', () => {
  const raw = samples();
  raw.forEach((s, i) => {
    s.sensor_timestamp_s = 1000 + i / 40;
  });
  assert.ok(analyzeWindow(raw, 500).reasons.includes('low_sample_rate'));
});
test('50 Hz boundary is accepted with floating point timestamp rounding', () => {
  assert.equal(analyzeWindow(samples(0.02, 20), 500).valid, true);
});
test('batched events with a short receive span are not treated as 100 Hz delivery', () => {
  const raw = samples();
  raw.forEach((s, i) => {
    s.received_relative_ms = 300 + i;
  });
  const feature = analyzeWindow(raw, 500);
  assert.equal(feature.valid, false);
  assert.ok(feature.reasons.includes('short_receive_span'));
});
test('delivery jitter invalidates a window, retaining its raw samples', () => {
  const raw = samples();
  raw.forEach((s, i) => {
    if (i >= 25) s.received_relative_ms += 140;
  });
  const feature = analyzeWindow(raw, 700);
  assert.ok(feature.reasons.includes('delivery_jitter'));
  assert.equal(raw.length, 100);
});
test('protocol uses half-open boundaries and exactly 30 s vibration', () => {
  for (const phase of PROTOCOL.phases) {
    assert.equal(phaseAt(phase.start_ms).id, phase.id);
    assert.equal(phaseAt(phase.end_ms - 0.001).id, phase.id);
    assert.notEqual(phaseAt(phase.end_ms)?.id, phase.id);
  }
  assert.equal(phaseAt(-1), null);
  assert.equal(phaseAt(35000), null);
  assert.equal(PROTOCOL.vibration_end_ms - PROTOCOL.vibration_start_ms, 30000);
  assert.equal(phaseForWindow(8500, 9000), 'baseline');
  assert.equal(phaseForWindow(8600, 9100), 'transition');
});
test('off, motor settling and phase crossing ratios are blank', () => {
  const { features } = createReplay();
  for (const feature of features) {
    if (['off_start', 'off_end', 'motor_settle', 'transition'].includes(feature.phase_id))
      assert.equal(feature.ratio, null);
  }
});
test('less than 80% baseline coverage invalidates baseline and all trial ratios', () => {
  const session = createReplay();
  session.raw_samples = session.raw_samples.filter(
    (s) => s.received_relative_ms < 6500 || s.received_relative_ms >= 8000,
  );
  const result = reanalyze(session);
  assert.equal(result.summary.baseline_rms_g, null);
  assert.ok(result.summary.trials.every((t) => !t.valid));
});
test('one incomplete comparison phase invalidates only its trial and aggregate', () => {
  const session = createReplay();
  session.raw_samples = session.raw_samples.filter(
    (s) => s.received_relative_ms < 14000 || s.received_relative_ms >= 16500,
  );
  const { summary } = reanalyze(session);
  assert.equal(summary.trials[0].valid, true);
  assert.equal(summary.trials[1].valid, false);
  near(summary.trials[1].pinch_ratio, 0.8);
  assert.equal(summary.trials[1].preceding_light_ratio, null);
  assert.equal(summary.trials[1].force_estimate.valid, true);
  assert.equal(summary.force_estimate.valid, true);
  assert.equal(summary.trials[2].valid, true);
  assert.equal(summary.median_trial_delta, null);
});
test('late cue invalidates affected trial without hiding observed graph values', () => {
  const session = createReplay();
  session.events.find((e) => e.type === 'phase_cue' && e.phase_id === 'pinch_2').actual_ms += 251;
  const result = reanalyze(session);
  assert.equal(result.summary.trials[1].valid, false);
  assert.ok(result.summary.trials[1].reasons.includes('command_late'));
  assert.ok(result.features.some((f) => f.phase_id === 'pinch_2' && f.ratio !== null));
});
test('late motor reaching baseline invalidates baseline', () => {
  const session = createReplay();
  session.events.find((e) => e.type === 'vibration_start_request').actual_ms = 6500;
  assert.equal(reanalyze(session).summary.baseline_rms_g, null);
});
test('cancelled sessions retain features but never produce a full aggregate', () => {
  const session = createReplay();
  session.status = 'cancelled';
  session.duration_ms = 18000;
  session.raw_samples = session.raw_samples.filter((s) => s.received_relative_ms < 18000);
  const result = reanalyze(session);
  assert.equal(result.summary.trials[0].valid, true);
  assert.equal(result.summary.trials[1].valid, false);
  assert.equal(result.summary.median_trial_delta, null);
  assert.ok(result.features.every((f) => f.end_ms <= 18000));
});
test('manual movement adds a note without changing numbers', () => {
  const session = createReplay();
  session.observations.phone_moved = true;
  const result = reanalyze(session);
  assert.ok(result.summary.quality_notes.includes('manual_artifact'));
  near(result.summary.median_trial_delta, session.summary.median_trial_delta);
});
test('weak motor and unstable baseline notes do not suppress valid baseline', () => {
  const session = createReplay();
  session.raw_samples.forEach((s) => {
    if (s.phase_id === 'off_start') s.x_g *= 10;
  });
  const weak = reanalyze(session);
  assert.ok(weak.summary.quality_notes.includes('weak_motor_response'));
  assert.notEqual(weak.summary.baseline_rms_g, null);
  session.raw_samples.forEach((s) => {
    if (s.received_relative_ms >= 7500 && s.received_relative_ms < 9000) s.x_g *= 4;
  });
  const unstable = reanalyze(session);
  assert.ok(unstable.summary.quality_notes.includes('unstable_baseline'));
  assert.notEqual(unstable.summary.baseline_rms_g, null);
});
test('JSON raw-data recalculation reproduces all features and summaries', () => {
  const session = createReplay();
  const parsed = JSON.parse(serializeSession(session));
  const recalculated = reanalyze(parsed);
  assert.deepEqual(recalculated.features, session.features);
  assert.deepEqual(recalculated.summary, session.summary);
  assert.equal(parsed.data_origin, 'replay');
  assert.equal(parsed.raw_samples.length, 3500);
  assert.equal(parsed.features.length, 346);
  assert.match(sessionFilename(parsed), /^pinch_[0-9TZ]+_[\w-]+\.json$/);
});
test('graph breaks at missing windows and never interpolates them', () => {
  const features = createReplay().features.filter((f) => f.end_ms >= 10000 && f.end_ms <= 10400);
  features[2].ratio = null;
  const paths = chartSegments(
    features,
    'ratio',
    (x) => x,
    (y) => y,
    100,
  );
  assert.equal(paths.length, 2);
  assert.ok(!paths.join('').includes('10200'));
});
test('rate observations never divide duplicated timestamps by zero', () => {
  assert.equal(observedRate([1, 1], 1), null);
  assert.equal(observedRate([null, 2], 1), null);
});
