const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEMO_FORCE_MODEL } = require('../.test-build/config/demoForceModel.js');
const { predictForce, snapshotForceModel } = require('../.test-build/lib/predictForce.js');
const { reanalyze, summarize, median } = require('../.test-build/lib/signal.js');
const { createReplay } = require('../.test-build/lib/replay.js');
const { replaySession } = require('../.test-build/lib/replaySession.js');
const { chartSegments } = require('../.test-build/lib/chart.js');
const { serializeSession } = require('../.test-build/lib/sessionJson.js');
const context = { protocol_version: 'expo_desk_pinch_ios_pulsed_v1' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const predict = (ratio, model = DEMO_FORCE_MODEL) =>
  predictForce({ accel_rms_ratio: ratio }, model, context);

test('specified demo regression retains raw values and clamps only its output', () => {
  for (const [r, raw, value, clamped] of [
    [0.5, -1.5, 0, true],
    [1, 1, 1, false],
    [1.6, 4, 4, false],
    [2, 6, 6, false],
    [4, 16, 15, true],
  ]) {
    const f = predict(r);
    near(f.raw_kgf, raw);
    near(f.value_kgf, value);
    assert.equal(f.clamped, clamped);
    assert.equal(f.valid, true);
    assert.equal(f.kind, 'demo');
    assert.deepEqual(f.reasons, []);
  }
});

test('null, NaN, missing and invalid inputs never become a valid zero', () => {
  for (const r of [null, NaN, undefined, Infinity, -Infinity]) {
    const f = predict(r);
    assert.equal(f.value_kgf, null);
    assert.equal(f.raw_kgf, null);
    assert.equal(f.valid, false);
    assert.equal(f.clamped, false);
  }
  assert.equal(predictForce({}, DEMO_FORCE_MODEL, context).valid, false);
  assert.equal(
    predictForce({ accel_rms_ratio: 1 }, DEMO_FORCE_MODEL, { ...context, reasons: ['sample_gap'] })
      .valid,
    false,
  );
  assert.equal(predict(0).valid, true);
});

test('model load rejects inconsistent dimensions, order, schema and nonfinite parameters', () => {
  for (const patch of [
    { mean: [] },
    { scale: [1, 1] },
    { coefficients: [5, 6] },
    { feature_order: ['wrong'] },
    { feature_order: ['other', 'accel_rms_ratio'] },
    { feature_schema_id: 'other' },
    { scale: [0] },
    { scale: [-1] },
    { mean: [NaN] },
    { coefficients: [Infinity] },
    { intercept: NaN },
    { output_min: 16 },
    { output_max: Infinity },
    { compatible_protocols: [] },
    { output_unit: 'lb' },
  ]) {
    const model = { ...DEMO_FORCE_MODEL, ...patch };
    assert.throws(() => snapshotForceModel(model));
    assert.deepEqual(predict(1, model).reasons, ['invalid_model']);
  }
  assert.equal(
    predictForce({ accel_rms_ratio: 1 }, DEMO_FORCE_MODEL, {
      protocol_version: 'expo_desk_pinch_v1',
    }).valid,
    false,
  );
  assert.equal(
    predictForce({ accel_rms_ratio: 1 }, DEMO_FORCE_MODEL, {
      ...context,
      feature_schema_id: 'different',
    }).valid,
    false,
  );
  assert.equal(predict(Number.MAX_VALUE).raw_kgf, null);
});

test('shared record ratios give the specified three forces and 4.1 kgf representative display', () => {
  const ratios = [1.5524433593195541, 2.446471026886621, 1.6229344556597134];
  const expected = [3.7622167965977704, 8.232355134433107, 4.114672278298567];
  const values = ratios.map((r, i) => {
    const value = predict(r).value_kgf;
    near(value, expected[i]);
    return value;
  });
  assert.deepEqual(
    values.map((v) => v.toFixed(1)),
    ['3.8', '8.2', '4.1'],
  );
  near(median(values), 4.114672278298567);
  assert.equal(median(values).toFixed(1), '4.1');
});

test('each trial predicts its median ratio before clipping, and representative is median not peak', () => {
  const session = createReplay();
  const features = structuredClone(session.features);
  const b = session.summary.baseline_rms_g;
  for (const [i, ratio] of [
    [1, 0.9],
    [2, 2],
    [3, 4],
  ]) {
    features
      .filter((f) => f.phase_id === `pinch_${i}`)
      .forEach((f) => {
        f.rms_g = b * ratio;
      });
  }
  // 26 selected windows: half at r=.5, half at 1.3. Median ratio=.9 -> .5 kgf.
  // Median of individually clipped windows would incorrectly give 1.25 kgf.
  features
    .filter((f) => f.start_ms >= 10000 && f.end_ms <= 13000)
    .forEach((f, i) => {
      f.rms_g = b * (i < 13 ? 0.5 : 1.3);
    });
  const result = summarize(
    session.raw_samples,
    features,
    session.events,
    session.config,
    35000,
    true,
  );
  near(result.summary.trials[0].force_estimate.value_kgf, 0.5);
  near(result.summary.trials[1].force_estimate.value_kgf, 6);
  near(result.summary.trials[2].force_estimate.value_kgf, 15);
  near(result.summary.force_estimate.value_kgf, 6);
  near(result.summary.trials[2].pinch_ratio, 4);
  near(result.summary.trials[2].force_estimate.raw_kgf, 16);
});

test('baseline absence, off, settling and transition never fabricate force values', () => {
  const session = createReplay();
  for (const f of session.features) {
    if (['off_start', 'off_end', 'motor_settle', 'transition'].includes(f.phase_id)) {
      assert.equal(f.force_estimate.value_kgf, null);
      assert.equal(f.force_estimate.valid, false);
    }
  }
  session.raw_samples.forEach((s) => {
    if (s.phase_id === 'baseline') s.x_g = 0;
  });
  const result = reanalyze(session);
  assert.equal(result.summary.force_estimate.valid, false);
  assert.ok(result.features.every((f) => f.force_estimate.value_kgf === null));
  assert.ok(result.summary.trials.every((t) => !t.force_estimate.valid));
});

test('observation notes do not suppress force or modify the model', () => {
  const session = createReplay();
  session.raw_samples.forEach((s) => {
    if (s.phase_id === 'off_start') s.x_g *= 100;
    if (s.received_relative_ms >= 7500 && s.received_relative_ms < 9000) s.x_g *= 4;
  });
  const before = reanalyze(session);
  session.observations.phone_moved = true;
  session.observations.extra_contact = true;
  const after = reanalyze(session);
  for (const reason of ['weak_motor_response', 'unstable_baseline', 'manual_artifact'])
    assert.ok(after.summary.quality_notes.includes(reason));
  assert.equal(after.summary.force_estimate.valid, true);
  assert.deepEqual(after.summary.force_estimate, before.summary.force_estimate);
  assert.deepEqual(after.force_model, before.force_model);
});

test('partial sessions retain completed individual forces but no representative even after all pinches', () => {
  for (const duration of [18000, 30000]) {
    const session = createReplay();
    session.status = 'cancelled';
    session.duration_ms = duration;
    session.raw_samples = session.raw_samples.filter((s) => s.received_relative_ms < duration);
    const result = reanalyze(session);
    assert.equal(result.summary.trials[0].force_estimate.valid, true);
    assert.equal(result.summary.force_estimate.value_kgf, null);
    assert.ok(result.summary.force_estimate.reasons.includes('incomplete_session'));
    if (duration === 30000) assert.ok(result.summary.trials.every((t) => t.force_estimate.valid));
  }
});

test('late pinch cue invalidates trial force while preserving observed feature outputs', () => {
  const session = createReplay();
  session.events.find((e) => e.type === 'phase_cue' && e.phase_id === 'pinch_2').actual_ms += 251;
  const result = reanalyze(session);
  assert.equal(result.summary.trials[1].force_estimate.valid, false);
  assert.equal(result.summary.force_estimate.valid, false);
  assert.ok(result.features.some((f) => f.phase_id === 'pinch_2' && f.force_estimate.valid));
});

test('force graph breaks for null and invalid outputs, retaining a valid zero', () => {
  const features = createReplay().features.filter((f) => f.end_ms >= 10000 && f.end_ms <= 10400);
  features[0].force_estimate = predict(0.5);
  features[2].force_estimate = predict(null);
  features[4].force_estimate.valid = false;
  const paths = chartSegments(
    features,
    'force_kgf',
    (x) => x,
    (y) => y,
    100,
  );
  assert.equal(paths.length, 2);
  assert.ok(paths[0].includes('M10000.00 0.00'));
  assert.ok(!paths.join('').includes('10200'));
  assert.ok(!paths.join('').includes('10400'));
});

test('v1 replay is a separate v2 result and leaves the original record untouched', () => {
  const source = JSON.parse(serializeSession(createReplay()));
  source.schema_version = '1.0';
  source.data_origin = 'live';
  delete source.force_model;
  delete source.summary.force_estimate;
  source.features.forEach((f) => delete f.force_estimate);
  source.summary.trials.forEach((t) => delete t.force_estimate);
  const original = JSON.stringify(source);
  const result = replaySession(source);
  assert.equal(JSON.stringify(source), original);
  assert.notEqual(result.session_id, source.session_id);
  assert.equal(result.source_session_id, source.session_id);
  assert.equal(result.source_data_origin, 'live');
  assert.equal(result.data_origin, 'replay');
  assert.equal(result.schema_version, '2.0');
  assert.equal(result.summary.force_estimate.valid, true);
  assert.notEqual(result.raw_samples, source.raw_samples);
  assert.deepEqual(result.raw_samples, source.raw_samples);
});

test('v2 replay uses its saved model, not the current default parameters', () => {
  const source = createReplay();
  source.force_model = {
    ...source.force_model,
    model_id: 'saved-demo',
    intercept: 7,
    coefficients: [2],
  };
  const expected = reanalyze(source);
  const replay = replaySession(JSON.parse(serializeSession(expected)));
  assert.deepEqual(replay.features, expected.features);
  assert.deepEqual(replay.summary, expected.summary);
  assert.deepEqual(replay.force_model, source.force_model);
  assert.notEqual(replay.force_model, source.force_model);
  near(replay.summary.force_estimate.value_kgf, 6.6);
});

test('replay rejects unsupported or malformed records before analysis', () => {
  const source = createReplay();
  for (const bad of [
    null,
    {},
    { ...source, schema_version: '3.0' },
    { ...source, config: { ...source.config, hop_ms: 0 } },
    { ...source, config: { ...source.config, phases: [] } },
    { ...source, events: [null] },
    { ...source, raw_samples: [{}] },
    { ...source, force_model: null },
    { ...source, observations: null },
  ])
    assert.throws(() => replaySession(bad));
});
