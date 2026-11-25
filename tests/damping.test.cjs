const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DAMPING_PROTOCOL,
  dampingProtocolForPlatform,
} = require('../.test-build/config/dampingProtocol.js');
const { DampingController } = require('../.test-build/lib/dampingController.js');
const {
  createDampingExample,
  syntheticDampingSeed,
  importDamping,
} = require('../.test-build/lib/dampingReplay.js');
const {
  vectorStats,
  reductionPct,
  reanalyzeDamping,
  sensorWindow,
  quantile,
  phaseAtActual,
} = require('../.test-build/lib/dampingSignal.js');
const { nearestFrame, plotSegments } = require('../.test-build/lib/dampingChart.js');
const { serializeSession, sessionFilename } = require('../.test-build/lib/sessionJson.js');
const { createReplay } = require('../.test-build/lib/replay.js');
const near = (a, b) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const phase = (s, id) => s.summary.phases.find((p) => p.phase_id === id);

function rig(overrides = {}, seed = syntheticDampingSeed(), config = DAMPING_PROTOCOL) {
  let now = 0;
  const timers = new Set(),
    listeners = { accelerometer: new Set(), gyroscope: new Set() };
  const hapticListeners = new Set();
  let scheduled = null,
    completionSent = false;
  const log = [],
    finished = [],
    snapshots = [];
  const controller = new DampingController(
    {
      now: () => now,
      utcNow: () => new Date(now).toISOString(),
      every: (callback) => {
        timers.add(callback);
        return () => {
          log.push('timer_clear');
          timers.delete(callback);
        };
      },
      subscribe: (sensor, callback, interval) => {
        assert.equal(interval, 10);
        listeners[sensor].add(callback);
        log.push(`subscribe:${sensor}`);
        return () => {
          log.push(`unsubscribe:${sensor}`);
          listeners[sensor].delete(callback);
        };
      },
      vibrate: (pattern, repeat) => log.push({ pattern, repeat, now }),
      cancelVibration: () => log.push('cancel'),
      subscribeHaptics: (callback) => {
        hapticListeners.add(callback);
        return () => hapticListeners.delete(callback);
      },
      scheduleHaptics: (request) => {
        assert.equal(request.intensity, 1.0);
        assert.equal(request.sharpness, 0.5);
        log.push({
          pattern: request.duration_ms,
          repeat: false,
          now,
          delay_ms: request.delay_ms,
          kind: 'schedule',
        });
        scheduled = {
          playback_id: request.playback_id,
          native_request_ms: 900000 + now,
          native_response_ms: 900000 + now,
          native_scheduled_start_ms: 900000 + now + request.delay_ms,
          native_scheduled_end_ms: 900000 + now + request.delay_ms + request.duration_ms,
        };
        return scheduled;
      },
      onUpdate: (s) => snapshots.push(s),
      onFinish: (s) => finished.push(s),
      ...overrides,
    },
    config,
  );
  const tick = (time) => {
    now = time;
    if (scheduled && !completionSent && now + 900000 >= scheduled.native_scheduled_end_ms) {
      completionSent = true;
      for (const cb of hapticListeners)
        cb({
          playback_id: scheduled.playback_id,
          type: 'completed',
          native_event_ms: scheduled.native_scheduled_end_ms,
          detail: null,
        });
    }
    [...timers].forEach((cb) => cb());
  };
  const sample = (time, sensor = 'accelerometer', patch = {}) => {
    now = time;
    [...listeners[sensor]].forEach((cb) =>
      cb({
        x: sensor === 'accelerometer' ? 0.002 * Math.sin((2 * Math.PI * time) / 100) : 0,
        y: 0,
        z: sensor === 'accelerometer' ? 1 : 0.1,
        timestamp: (sensor === 'accelerometer' ? 4000 : 8000) + time / 1000,
        ...patch,
      }),
    );
  };
  const native = (type, time, patch = {}) => {
    now = time;
    for (const cb of [...hapticListeners])
      cb({
        playback_id: scheduled?.playback_id,
        type,
        native_event_ms: 900000 + time,
        detail: null,
        ...patch,
      });
  };
  return {
    controller,
    seed,
    tick,
    sample,
    native,
    hapticListeners,
    log,
    finished,
    snapshots,
    timers,
    listeners,
  };
}

test('v3 reduction preserves positive, zero and unbounded negative values', () => {
  near(reductionPct(0.0012, 0.002), 40);
  near(reductionPct(0.002, 0.002), 0);
  near(reductionPct(0.0026, 0.002), -30);
  near(reductionPct(0.02, 0.002), -900);
  near(reductionPct(0, 0.002), 100);
  for (const b of [0, null, NaN]) assert.equal(reductionPct(0.001, b), null);
});
test('vector math removes constant gravity, combines axes and preserves constant rotation', () => {
  const a = vectorStats(Array.from({ length: 200 }, () => ({ x: 0.3, y: -0.4, z: 0.866 })));
  near(a.ac, 0);
  const g = vectorStats(Array.from({ length: 200 }, () => ({ x: 0, y: 0, z: 0.1 })));
  near(g.magnitude, 0.1);
  near(g.ac, 0);
  const axes = vectorStats(
    Array.from({ length: 200 }, (_, i) => ({
      x: (i % 2 ? 1 : -1) * 0.003,
      y: (i % 2 ? 1 : -1) * 0.004,
      z: 1,
    })),
  );
  near(axes.axes[0], 0.003);
  near(axes.axes[1], 0.004);
  near(axes.ac, 0.005);
});
test('quantiles interpolate at (n-1)p', () => {
  near(quantile([0, 10, 20, 30], 0.25), 7.5);
  near(quantile([0, 10, 20, 30], 0.75), 22.5);
});
test('31 second synthetic example has independent streams and deliberately nonmonotonic responses', () => {
  const s = createDampingExample();
  assert.equal(s.data_origin, 'synthetic_test');
  assert.equal(s.raw.accelerometer.length, 3100);
  assert.equal(s.raw.gyroscope.length, 1550);
  assert.equal(s.features.length, 291);
  near(s.baseline.accel_ac_rms_g, 0.002);
  assert.equal(s.baseline.available_at_ms, 8000);
  assert.equal(s.baseline.frame_ids.length, 11);
  near(phase(s, 'pinch_low').accel_reduction_pct.median, 40);
  near(phase(s, 'pinch_medium').accel_reduction_pct.median, -30);
  near(phase(s, 'pinch_higher').accel_reduction_pct.median, 60);
  for (const id of ['pinch_low', 'pinch_medium', 'pinch_higher'])
    assert.equal(phase(s, id).accel_ac_rms_g.expected_frames, 11);
  const f = s.features.find((f) => f.window_end_ms === 17000);
  assert.equal(f.accel.sample_count, 200);
  assert.equal(f.gyro.sample_count, 100);
  near(f.gyro.rms_magnitude_rad_s, 0.1);
  near(f.gyro.ac_rms_rad_s, 0);
  assert.equal('force_model' in s, false);
  assert.equal('force_estimate' in s.summary, false);
});
test('motor-off and transition frames retain reduction but transitions are excluded from stable summaries', () => {
  const s = createDampingExample();
  const off = s.features.find((f) => f.window_end_ms === 3000),
    transition = s.features.find((f) => f.window_end_ms === 19000);
  assert.equal(off.context, 'motor_off');
  near(off.accel.reduction_pct, 90);
  assert.equal(transition.context, 'phase_transition');
  assert.equal(transition.summary_eligible, false);
  assert.ok(transition.accel.reduction_pct !== null);
  assert.equal(s.features.find((f) => f.window_end_ms === 8000).phase_id_at_end, 'light_ref');
  assert.deepEqual(s.features.find((f) => f.window_end_ms === 8100).included_phase_ids, [
    'light_ref',
    'pinch_low',
  ]);
});
test('all later contact phases keep the original baseline and raw outputs', () => {
  const s = createDampingExample();
  s.raw.accelerometer.forEach((v) => {
    if (v.phase_id === 'light_recovery') v.x *= 2;
  });
  const r = reanalyzeDamping(s);
  near(r.baseline.accel_ac_rms_g, 0.002);
  near(phase(r, 'light_recovery').accel_reduction_pct.median, -100);
  near(phase(r, 'pinch_medium').accel_reduction_pct.median, -30);
});
test('missing gyro leaves acceleration and reduction valid; zero baseline leaves gyro valid', () => {
  const s = createDampingExample();
  s.raw.gyroscope = [];
  s.device.sensors.gyroscope.available = false;
  const r = reanalyzeDamping(s);
  near(phase(r, 'pinch_low').accel_reduction_pct.median, 40);
  assert.equal(phase(r, 'pinch_low').gyro_rms_magnitude_rad_s.valid, false);
  assert.ok(r.features.every((f) => f.gyro.rms_magnitude_rad_s === null));
  const z = createDampingExample();
  z.raw.accelerometer.forEach((s) => (s.x = 0));
  const zero = reanalyzeDamping(z);
  assert.equal(zero.baseline.valid, false);
  assert.ok(zero.features.every((f) => f.accel.reduction_pct === null));
  assert.ok(zero.features.some((f) => f.gyro.valid));
});
test('per-sensor gap, timestamps and native rates invalidate only affected sensor windows', () => {
  const s = createDampingExample();
  for (const value of [null, NaN, 5000.99]) {
    const raw = structuredClone(s.raw.accelerometer);
    raw[100].sensor_timestamp_s = value;
    assert.equal(sensorWindow(raw, 2000, s.config).quality.valid, false);
  }
  const raw = s.raw.accelerometer.filter((v) => v.t_receive_ms < 900 || v.t_receive_ms > 1200);
  const q = sensorWindow(raw, 2000, s.config).quality;
  assert.ok(q.reasons.includes('sensor_gap'));
  assert.ok(q.reasons.includes('receive_gap'));
  const dup = structuredClone(s.raw.accelerometer);
  dup[100].sensor_timestamp_s = dup[99].sensor_timestamp_s;
  assert.equal(sensorWindow(dup, 2000, s.config).quality.sensor_rate_hz, null);
});
test('baseline CV uses population standard deviation and observation notes preserve numbers', () => {
  const s = createDampingExample();
  s.raw.accelerometer.forEach((v) => {
    if (v.t_receive_ms < 3000) {
      v.phase_id = 'off_pre';
      v.x = Math.SQRT2 * 0.02 * Math.sin((2 * Math.PI * 10 * v.t_receive_ms) / 1000);
    }
    if (v.t_receive_ms >= 7600 && v.t_receive_ms < 8000) v.x *= 10;
  });
  const before = reanalyzeDamping(s);
  s.observations.extra_contact = true;
  const r = reanalyzeDamping(s),
    values = r.features
      .filter((f) => r.baseline.frame_ids.includes(f.frame_id))
      .map((f) => f.accel.ac_rms_g);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  near(
    r.summary.baseline_cv,
    Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) / mean,
  );
  for (const note of ['weak_motor_response', 'unstable_baseline', 'manual_artifact'])
    assert.ok(r.summary.quality_notes.includes(note));
  assert.deepEqual(r.summary.phases, before.summary.phases);
});
test('insufficient acceleration coverage blanks its summary independently of gyro', () => {
  const s = createDampingExample();
  s.raw.accelerometer = s.raw.accelerometer.filter(
    (v) => v.t_receive_ms < 10000 || v.t_receive_ms >= 12500,
  );
  const r = reanalyzeDamping(s);
  assert.equal(phase(r, 'pinch_low').accel_reduction_pct.valid, false);
  assert.equal(phase(r, 'pinch_low').gyro_rms_magnitude_rad_s.valid, true);
  assert.ok(r.features.some((f) => f.accel.ac_rms_g === null && f.gyro.valid));
});
test('v4 JSON roundtrip reproduces all features, baseline and summaries; source is immutable', () => {
  const s = createDampingExample(),
    original = serializeSession(s),
    r = importDamping(JSON.parse(original));
  assert.equal(serializeSession(s), original);
  assert.equal(r.source_session_id, s.session.id);
  assert.equal(r.data_origin, 'replay');
  assert.notEqual(r.session.id, s.session.id);
  assert.deepEqual(r.features, s.features);
  assert.deepEqual(r.summary, s.summary);
  assert.deepEqual(r.baseline, s.baseline);
  assert.match(sessionFilename(r), /^damping_\d{8}T\d{6}Z_[\w-]+\.json$/);
});
test('legacy 35 second imports stay 35 seconds, retain original data, and have no invented gyroscope', () => {
  const old = createReplay(),
    before = serializeSession(old),
    s = importDamping(old);
  assert.equal(s.session.planned_duration_ms, 35000);
  assert.equal(s.session.actual_duration_ms, 35000);
  assert.equal(s.protocol_version, old.protocol_version);
  assert.equal(s.source_schema_version, '2.0');
  assert.equal(s.raw.gyroscope.length, 0);
  assert.equal(s.device.sensors.gyroscope.available, false);
  assert.equal(s.raw.accelerometer.length, old.raw_samples.length);
  assert.equal(serializeSession(old), before);
  assert.ok(!serializeSession(s).includes('kgf'));
  assert.equal(s.phases[3].target_level, 'pinch');
});
test('malformed replay configs cannot start unbounded analysis', () => {
  const s = createDampingExample();
  for (const bad of [
    {},
    { ...s, config: { ...s.config, hop_ms: 0 } },
    { ...s, session: { ...s.session, actual_duration_ms: Infinity } },
    { ...s, raw: { ...s.raw, gyroscope: [null] } },
  ])
    assert.throws(() => importDamping(bad));
});
test('common cursor selects the same frame; chart retains negative values and breaks only for gaps', () => {
  const s = createDampingExample();
  assert.equal(nearestFrame(s.features, 24024).window_end_ms, 24000);
  const points = [
    { t: 0, value: 40, context: 'steady' },
    { t: 100, value: -30, context: 'phase_transition' },
    { t: 200, value: null, context: 'steady' },
    { t: 300, value: 0, context: 'steady' },
  ];
  const paths = plotSegments(
    points,
    (x) => x,
    (y) => y,
    100,
  );
  assert.ok(paths.some((p) => p.path.includes('-30.00')));
  assert.equal(paths.at(-1).path, 'M300.00 0.00');
});
for (const platform of ['ios', 'android']) {
  test(`${platform}: live 31s collects both sensors, requests one 25s vibration and preserves late end samples`, () => {
    const seed = syntheticDampingSeed();
    seed.data_origin = 'live';
    seed.device.os = platform;
    const r = rig({}, seed, dampingProtocolForPlatform(platform));
    assert.equal(r.controller.start(r.seed), true);
    assert.equal(r.controller.start(r.seed), false);
    r.tick(3000);
    for (let t = 3000; t <= 34050; t += 10) {
      r.sample(t);
      r.sample(t, 'gyroscope');
      if (t % 100 === 0 && t < 34000) r.tick(t);
    }
    r.tick(34050);
    const s = r.finished[0];
    assert.equal(s.session.actual_duration_ms, 31050);
    assert.equal(s.raw.accelerometer.at(-1).t_receive_ms, 31050);
    assert.equal(s.raw.gyroscope.length, s.raw.accelerometer.length);
    assert.equal(s.features.at(-1).window_end_ms, 31000);
    const patterns = r.log.filter((v) => typeof v === 'object');
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].pattern, 25000);
    assert.equal(patterns[0].repeat, false);
    assert.equal(s.device.os, platform);
    assert.equal(
      s.config.vibration_mode,
      platform === 'ios' ? 'ios_core_haptics_continuous' : 'android_continuous',
    );
    assert.equal(s.vibration.api, platform === 'ios' ? 'CoreHaptics' : 'ReactNative.Vibration');
    assert.equal(s.vibration.intensity, platform === 'ios' ? 1.0 : null);
    assert.equal(s.vibration.sharpness, platform === 'ios' ? 0.5 : null);
    assert.equal(s.vibration.pattern, null);
    assert.equal(s.vibration.duration_ms, 25000);
    assert.equal(s.vibration.start_request_ms, platform === 'ios' ? 0 : 3000);
    assert.equal(s.vibration.stop_request_ms, platform === 'ios' ? 31050 : 28000);
    const replay = importDamping(JSON.parse(serializeSession(s)));
    assert.deepEqual(replay.vibration, s.vibration);
    assert.deepEqual(replay.features, s.features);
    assert.equal(r.log.filter((v) => v === 'subscribe:accelerometer').length, 1);
    assert.equal(r.log.filter((v) => v === 'subscribe:gyroscope').length, 1);
    assert.equal(r.timers.size, 0);
    assert.equal(r.listeners.accelerometer.size + r.listeners.gyroscope.size, 0);
    assert.ok(
      r.snapshots
        .find((v) => v.elapsed_ms === 7900)
        .session.features.every((f) => f.accel.reduction_pct === null),
    );
    assert.ok(
      r.snapshots.find((v) => v.elapsed_ms === 8000).session.features[0].accel.reduction_pct !==
        null,
    );
  });
  test(`${platform}: vibration stays off before 3s, runs once through phase changes, and stops at 28s`, () => {
    const r = rig({}, syntheticDampingSeed(), dampingProtocolForPlatform(platform));
    r.controller.start(r.seed);
    r.tick(3000); // End of preparation; measurement time is now zero.
    r.tick(5999);
    const nativeSchedule = platform === 'ios';
    assert.equal(r.log.filter((v) => typeof v === 'object').length, nativeSchedule ? 1 : 0);
    r.tick(6000);
    const command = r.log.find((v) => typeof v === 'object');
    assert.equal(command.pattern, 25000);
    assert.equal(command.repeat, false);
    assert.equal(command.now + (command.delay_ms ?? 0), 6000);
    for (const time of [11000, 16000, 21000, 26000, 30999]) r.tick(time);
    assert.equal(r.log.filter((v) => typeof v === 'object').length, 1);
    assert.equal(r.log.includes('cancel'), false);
    r.tick(31000);
    const s = r.controller.getSnapshot().session;
    assert.equal(s.vibration.scheduled_end_ms, 28000);
    assert.equal(r.log.filter((v) => v === 'cancel').length, nativeSchedule ? 0 : 1);
    assert.equal(r.controller.getSnapshot().stage, 'recording');
    r.tick(34000);
    assert.equal(r.finished[0].session.status, 'completed');
    assert.equal(r.finished[0].session.actual_duration_ms, 31000);
    assert.equal(r.log.filter((v) => typeof v === 'object').length, 1);
    assert.equal(r.log.filter((v) => v === 'cancel').length, 1);
  });
}
test('Android late requests use only remaining time; expired requests abort without starting', () => {
  for (const elapsed of [3350, 27999, 28000, 30000]) {
    const r = rig({}, syntheticDampingSeed(), dampingProtocolForPlatform('android'));
    r.controller.start(r.seed);
    r.tick(3000);
    r.tick(3000 + elapsed);
    const commands = r.log.filter((v) => typeof v === 'object');
    if (elapsed < 28000) {
      assert.deepEqual(commands, [
        { pattern: 28000 - elapsed, repeat: false, now: 3000 + elapsed },
      ]);
      r.tick(31000);
    } else {
      assert.deepEqual(commands, []);
      assert.equal(r.finished[0].session.status, 'aborted');
    }
    assert.equal(r.log.filter((v) => v === 'cancel').length, 1);
    r.controller.stop();
  }
});

test('delayed actual cue assigns raw samples and stable summaries to actual boundaries', () => {
  const r = rig();
  r.controller.start(r.seed);
  r.tick(3000);
  r.tick(6000);
  r.tick(10000);
  r.sample(11200);
  assert.equal(r.controller.getSnapshot().session.raw.accelerometer.at(-1).phase_id, 'light_ref');
  r.tick(11500);
  r.sample(11510);
  const s = r.controller.getSnapshot().session;
  assert.equal(s.phases.find((p) => p.phase_id === 'light_ref').actual_end_ms, 8500);
  assert.equal(s.phases.find((p) => p.phase_id === 'pinch_low').actual_start_ms, 8500);
  assert.equal(s.raw.accelerometer.at(-1).phase_id, 'pinch_low');
  assert.equal(phaseAtActual(s.phases, 8200).phase_id, 'light_ref');
  assert.equal(s.baseline.available_at_ms, 8500);
  r.controller.stop();
});
for (const platform of ['ios', 'android']) {
  for (const reason of platform === 'android'
    ? ['app_state:background', 'android_back']
    : ['app_state:background']) {
    test(`${platform} ${reason}: abort cancels before cleanup and preserves samples`, () => {
      const r = rig({}, syntheticDampingSeed(), dampingProtocolForPlatform(platform));
      r.controller.start(r.seed);
      r.tick(3000);
      const callback = [...r.listeners.gyroscope][0];
      r.tick(6000);
      r.sample(6010);
      r.sample(6010, 'gyroscope');
      r.log.length = 0;
      r.controller.stop('aborted', reason);
      assert.deepEqual(r.log.slice(0, 4), [
        'cancel',
        'unsubscribe:accelerometer',
        'unsubscribe:gyroscope',
        'timer_clear',
      ]);
      assert.equal(r.finished[0].session.status, 'aborted');
      assert.equal(r.finished[0].session.abort_reason, reason);
      assert.equal(r.finished[0].raw.gyroscope.length, 1);
      callback({ x: 0, y: 0, z: 10, timestamp: 9999 });
      assert.equal(r.finished[0].raw.gyroscope.length, 1);
    });
  }
}
test('gyro subscription failure is tolerated but motor scheduling failure aborts', () => {
  const r = rig({
    subscribe: (sensor, cb) => {
      if (sensor === 'gyroscope') throw Error('unavailable');
      return () => {};
    },
    scheduleHaptics: () => {
      throw Error('motor error');
    },
  });
  r.controller.start(r.seed);
  r.tick(3000);
  r.tick(9000);
  assert.equal(r.controller.getSnapshot().stage, 'saving');
  r.tick(13000);
  r.controller.stop();
  const s = r.finished[0];
  assert.equal(s.device.sensors.gyroscope.available, false);
  assert.equal(s.vibration.start_succeeded, false);
  assert.ok(s.events.some((e) => e.type === 'vibration_start_failed'));
  assert.ok(s.summary.quality_notes.includes('vibration_start_failed'));
});
test('timestamp reset is recorded without dropping raw sample or filling the gap', () => {
  const r = rig();
  r.controller.start(r.seed);
  r.tick(3000);
  r.sample(3010);
  r.sample(3020, 'accelerometer', { timestamp: 1 });
  r.controller.stop();
  const s = r.finished[0];
  assert.equal(s.raw.accelerometer.length, 2);
  assert.equal(s.raw.accelerometer[1].valid, false);
  assert.ok(s.events.some((e) => e.type === 'timestamp_reset'));
  assert.equal(s.summary.sensors.accelerometer.sensor_rate_hz, null);
});
test('countdown cancellation produces no record and releases the timer', () => {
  const r = rig();
  r.controller.start(r.seed);
  r.tick(1000);
  r.controller.stop();
  assert.equal(r.finished.length, 0);
  assert.equal(r.timers.size, 0);
  assert.equal(r.controller.getSnapshot().stage, 'ready');
});

test('31s contract: seven contiguous phases, 291 frames, 11/6 summary windows and 8s baseline', () => {
  const s = createDampingExample();
  assert.equal(s.schema_version, '4.0');
  assert.equal(s.session.planned_duration_ms, 31000);
  assert.equal(s.protocol_version, 'expo_desk_pinch_continuous_31s_v1');
  assert.equal(s.analysis_version, 'accel_ac_rms_2s_continuous_31s_v1');
  assert.deepEqual(
    s.phases.map((p) => [p.phase_id, p.planned_start_ms, p.planned_end_ms]),
    [
      ['off_pre', 0, 3000],
      ['light_ref', 3000, 8000],
      ['pinch_low', 8000, 13000],
      ['pinch_medium', 13000, 18000],
      ['pinch_higher', 18000, 23000],
      ['light_recovery', 23000, 28000],
      ['off_post', 28000, 31000],
    ],
  );
  assert.equal(s.config.countdown_ms, 3000);
  assert.equal(s.features.length, 291);
  assert.equal(s.features[0].window_end_ms, 2000);
  assert.equal(s.features.at(-1).window_end_ms, 31000);
  assert.equal(s.baseline.source_start_ms, 5000);
  assert.equal(s.baseline.source_end_ms, 8000);
  assert.equal(s.baseline.available_at_ms, 8000);
  assert.deepEqual(
    s.summary.phases.map((p) => p.accel_ac_rms_g.expected_frames),
    [6, 11, 11, 11, 11, 11, 6],
  );
  assert.ok(s.summary.phases.every((p) => p.accel_ac_rms_g.valid));
  assert.equal(s.features.find((f) => f.window_end_ms === 5000).context, 'motor_settle');
  assert.equal(s.features.find((f) => f.window_end_ms === 5100).context, 'phase_transition');
  assert.equal(s.features.find((f) => f.window_end_ms === 7000).context, 'steady');
});

test('iOS schedules once before playback; stalled JS cannot extend or restart the native 25s event', () => {
  const r = rig();
  r.controller.start(r.seed);
  r.tick(2999);
  assert.equal(r.listeners.accelerometer.size, 0);
  assert.equal(r.log.filter((v) => typeof v === 'object').length, 0);
  r.tick(3000);
  const v = r.controller.getSnapshot().session.vibration;
  assert.equal(v.schedule_request_ms, 0);
  assert.equal(v.scheduled_start_ms, 3000);
  assert.equal(v.scheduled_end_ms, 28000);
  assert.equal(
    v.native_receipt.native_scheduled_end_ms - v.native_receipt.native_scheduled_start_ms,
    25000,
  );
  r.tick(33000); // Completion arrives late in JS; the native schedule did not move.
  assert.equal(r.controller.getSnapshot().session.vibration.completion_received_ms, 30000);
  assert.equal(r.log.filter((v) => typeof v === 'object').length, 1);
  r.tick(34000);
  assert.equal(r.finished[0].vibration.scheduled_end_ms, 28000);
  assert.ok(r.finished[0].summary.quality_notes.includes('timing_mismatch')); // Skipped visual cues.
});

for (const type of ['engine_stopped', 'engine_reset', 'playback_error']) {
  test(`${type}: abort preserves data, releases resources and ignores later native callbacks`, () => {
    const r = rig();
    r.controller.start(r.seed);
    r.tick(3000);
    r.tick(6000);
    r.sample(6010);
    const cb = [...r.hapticListeners][0];
    r.native(type, 6500);
    const s = r.finished[0];
    assert.equal(s.session.status, 'aborted');
    assert.equal(s.session.abort_reason, `haptic_${type}`);
    assert.equal(s.raw.accelerometer.length, 1);
    assert.equal(s.vibration.native_events[0].native_event_ms, 906500);
    assert.equal(s.vibration.native_events[0].received_ms, 3500);
    assert.equal(s.vibration.hardware_onset_verified, false);
    assert.equal(r.hapticListeners.size, 0);
    assert.equal(r.timers.size, 0);
    cb({ playback_id: s.session.id, type: 'completed', native_event_ms: 999999, detail: null });
    assert.equal(r.finished.length, 1);
    assert.equal(s.vibration.completion_received_ms, null);
  });
}

test('missing native completion or wrong iOS mode cannot produce completed v4 records', () => {
  for (const overrides of [{ subscribeHaptics: () => () => {} }, { scheduleHaptics: undefined }]) {
    const r = rig(overrides);
    r.controller.start(r.seed);
    for (const t of [3000, 6000, 11000, 16000, 21000, 26000, 31000, 34000]) r.tick(t);
    assert.equal(r.finished[0].session.status, 'aborted');
  }
  const r = rig({}, syntheticDampingSeed(), {
    ...DAMPING_PROTOCOL,
    vibration_mode: 'android_continuous',
  });
  r.controller.start(r.seed);
  for (const t of [3000, 6000, 11000, 16000, 21000, 26000, 31000, 34000]) r.tick(t);
  assert.equal(r.finished[0].session.status, 'aborted');
});

test('timing mismatch invalidates formal summaries without erasing baseline, raw data or observed curves', () => {
  const source = createDampingExample();
  source.events.push({
    type: 'timing_mismatch',
    planned_ms: 8000,
    actual_ms: 8251,
    phase_id: 'pinch_low',
    sensor: null,
    detail: 'phase_transition; delta_ms=251',
  });
  const s = reanalyzeDamping(source);
  assert.equal(s.baseline.accel_ac_rms_g, source.baseline.accel_ac_rms_g);
  assert.deepEqual(s.features, source.features);
  assert.deepEqual(s.raw, source.raw);
  assert.ok(
    s.summary.phases.every(
      (p) =>
        !p.accel_reduction_pct.valid && p.accel_reduction_pct.reasons.includes('timing_mismatch'),
    ),
  );
  assert.deepEqual(importDamping(JSON.parse(serializeSession(s))).summary, s.summary);
});

test('250ms cue delay is accepted, 251ms is recorded as timing_mismatch', () => {
  for (const delay of [250, 251]) {
    const r = rig();
    r.controller.start(r.seed);
    r.tick(3000);
    r.tick(6000);
    r.tick(11000 + delay);
    const s = r.controller.getSnapshot().session;
    assert.equal(
      s.events.some((e) => e.type === 'timing_mismatch'),
      delay > 250,
    );
    assert.equal(s.phases[2].actual_start_ms, 8000 + delay);
    r.controller.stop();
  }
});

test('historical 72s v3 imports preserve their own timeline and calculations', () => {
  const oldRows = [
    ['off_pre', 0, 3, 'off'],
    ['motor_settle', 3, 10, 'settle'],
    ['light_ref', 10, 18, 'contact'],
    ['pinch_low', 18, 26, 'low'],
    ['light_after_low', 26, 34, 'contact'],
    ['pinch_medium', 34, 42, 'medium'],
    ['light_after_medium', 42, 50, 'contact'],
    ['pinch_higher', 50, 58, 'higher'],
    ['light_after_higher', 58, 66, 'contact'],
    ['off_post', 66, 72, 'off'],
  ];
  const oldConfig = {
    ...DAMPING_PROTOCOL,
    recording_duration_ms: undefined,
    duration_ms: 72000,
    protocol_version: 'expo_desk_pinch_attenuation_72s_continuous_3_28_v1',
    analysis_version: 'accel_ac_rms_2s_fixed_baseline_v1',
    vibration_mode: 'ios_continuous',
    off_phase_settle_ms: undefined,
    command_late_ms: undefined,
    phases: oldRows.map(([phase_id, start, end, target_level]) => ({
      ...DAMPING_PROTOCOL.phases[0],
      phase_id,
      target_level,
      planned_start_ms: start * 1000,
      planned_end_ms: end * 1000,
    })),
  };
  const old = createDampingExample(oldConfig),
    original = serializeSession(old);
  const s = importDamping(JSON.parse(original));
  assert.equal(s.schema_version, '3.0');
  assert.equal(s.session.planned_duration_ms, 72000);
  assert.equal(s.session.actual_duration_ms, 72000);
  assert.equal(s.phases.length, 10);
  assert.equal(s.features.length, 701);
  assert.deepEqual(s.features, old.features);
  assert.deepEqual(s.summary, old.summary);
  assert.equal(serializeSession(old), original);
  assert.equal(DAMPING_PROTOCOL.recording_duration_ms, 31000);
});

test('unexpected early native completion aborts instead of claiming the full 25s event', () => {
  const r = rig();
  r.controller.start(r.seed);
  r.tick(3000);
  r.tick(6000);
  r.sample(6010);
  r.native('completed', 7000);
  assert.equal(r.finished[0].session.abort_reason, 'haptic_early_completion');
  assert.ok(r.finished[0].summary.quality_notes.includes('timing_mismatch'));
  assert.equal(r.finished[0].raw.accelerometer.length, 1);
});

test('invalid native receipt abort remains an importable partial v4 record', () => {
  const r = rig({ scheduleHaptics: () => ({ playback_id: 'invalid', native_request_ms: NaN }) });
  r.controller.start(r.seed);
  r.tick(3000);
  const s = r.finished[0];
  assert.equal(s.session.status, 'aborted');
  assert.equal(s.vibration.native_receipt, null);
  assert.equal(importDamping(JSON.parse(serializeSession(s))).session.status, 'aborted');
});

test('restored intensity is saved as 1.0 while historical 0.5 records keep their original setting', () => {
  const current = createDampingExample();
  assert.equal(current.vibration.intensity, 1.0);
  assert.equal(current.vibration.settings_id, 'continuous_i1.0_s0.5_v1');
  assert.equal(importDamping(JSON.parse(serializeSession(current))).vibration.intensity, 1.0);
  const previous = createDampingExample({
    ...DAMPING_PROTOCOL,
    haptic_intensity: 0.5,
    haptic_settings_id: 'continuous_i0.5_s0.5_v1',
  });
  const original = serializeSession(previous);
  const replay = importDamping(JSON.parse(original));
  assert.equal(replay.vibration.intensity, 0.5);
  assert.equal(replay.config.haptic_intensity, 0.5);
  assert.equal(replay.vibration.settings_id, 'continuous_i0.5_s0.5_v1');
  assert.equal(serializeSession(previous), original);
});
