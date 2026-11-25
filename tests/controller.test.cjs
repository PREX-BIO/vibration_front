const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SessionController } = require('../.test-build/lib/sessionController.js');
const { protocolForPlatform } = require('../.test-build/config/protocol.js');
const { buildVibrationRequest } = require('../.test-build/lib/vibration.js');

const seed = () => ({
  session_id: `test-${Math.random()}`,
  data_origin: 'live',
  platform: 'android',
  runtime: 'expo_go',
  app_version: '0.1.0',
  expo_sdk_version: '58.0.0',
  device_model_note: 'fake sensor port',
  environment: { table_material: 'wood', case_on: false, note: '' },
});
function rig(overrides = {}, config, model) {
  let now = 0;
  const timers = new Set(),
    subscribers = new Set(),
    finished = [],
    log = [];
  let timerCallback, sampleCallback;
  const controller = new SessionController(
    {
      now: () => now,
      utcNow: () => new Date(now).toISOString(),
      every(callback) {
        timerCallback = callback;
        timers.add(callback);
        return () => {
          log.push('timer_clear');
          timers.delete(callback);
        };
      },
      subscribe(callback, interval) {
        assert.equal(interval, 10);
        sampleCallback = callback;
        subscribers.add(callback);
        return () => {
          log.push('unsubscribe');
          subscribers.delete(callback);
        };
      },
      vibrate(duration) {
        log.push(['vibrate', now, duration]);
      },
      cancelVibration() {
        log.push('cancel');
      },
      onUpdate() {},
      onFinish(session) {
        finished.push(session);
      },
      ...overrides,
    },
    config,
    model,
  );
  return {
    controller,
    timers,
    subscribers,
    finished,
    log,
    tick(ms) {
      now = ms;
      [...timers].forEach((callback) => callback());
    },
    sample(ms) {
      now = ms;
      [...subscribers].forEach((callback) =>
        callback({
          x: 0.02 * Math.sin((2 * Math.PI * ms) / 100),
          y: 0,
          z: 1,
          timestamp: 9000 + ms / 1000,
        }),
      );
    },
    get timerCallback() {
      return timerCallback;
    },
    get sampleCallback() {
      return sampleCallback;
    },
  };
}
test('rapid starts create one timer and one sensor subscription', () => {
  const r = rig();
  assert.equal(r.controller.start(seed()), true);
  assert.equal(r.controller.start(seed()), false);
  assert.equal(r.timers.size, 1);
  assert.equal(r.subscribers.size, 0);
  r.tick(2999);
  assert.equal(r.controller.getSnapshot().stage, 'countdown');
  r.tick(3000);
  assert.equal(r.subscribers.size, 1);
  r.controller.stop();
  assert.equal(r.subscribers.size, 0);
  assert.equal(r.timers.size, 0);
});
test('countdown cancellation returns to ready without fabricating a record', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(1000);
  r.controller.stop();
  assert.equal(r.controller.getSnapshot().stage, 'ready');
  assert.equal(r.finished.length, 0);
  assert.equal(r.timers.size, 0);
  assert.equal(r.subscribers.size, 0);
});
test('continuous vibration is requested once at t=3, cancelled at t=33, completes at t=35', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(3000);
  for (let time = 3000; time <= 38000; time += 10) {
    r.sample(time);
    if (time % 100 === 0) r.tick(time);
  }
  assert.deepEqual(r.log.filter(Array.isArray), [['vibrate', 6000, 30000]]);
  const session = r.finished[0];
  assert.equal(session.status, 'completed');
  assert.equal(session.raw_samples.length, 3500);
  assert.equal(session.features.length, 346);
  assert.equal(session.events.find((e) => e.type === 'vibration_start_request').actual_ms, 3000);
  assert.equal(session.events.find((e) => e.type === 'vibration_cancel_request').actual_ms, 33000);
  assert.equal(session.events.filter((e) => e.type === 'phase_cue').length, 10);
  assert.equal(r.timers.size, 0);
  assert.equal(r.subscribers.size, 0);
});
test('late vibration requests only the remaining time until t=33', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(3000);
  r.tick(6350);
  assert.deepEqual(r.log.filter(Array.isArray), [['vibrate', 6350, 29650]]);
  r.controller.stop();
});
test('timer catch-up produces each completed window once', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(3000);
  for (let t = 3000; t < 5100; t += 10) r.sample(t);
  r.tick(5100);
  r.tick(5100);
  const ends = r.controller.getSnapshot().session.features.map((f) => f.end_ms);
  assert.equal(ends.length, 17);
  assert.equal(new Set(ends).size, 17);
  r.controller.stop();
});
test('manual/background stop cancels vibration before resource cleanup and preserves partial samples', () => {
  for (const reason of ['user_stop', 'app_state:background', 'screen_leave']) {
    const r = rig();
    r.controller.start(seed());
    r.tick(3000);
    r.sample(3010);
    r.tick(6100);
    r.log.length = 0;
    r.controller.stop('cancelled', reason);
    assert.deepEqual(r.log.slice(0, 3), ['cancel', 'unsubscribe', 'timer_clear']);
    assert.equal(r.finished[0].status, 'cancelled');
    assert.equal(r.finished[0].raw_samples.length, 1);
    assert.equal(r.finished[0].events.at(-1).detail, reason);
    assert.equal(r.timers.size, 0);
    assert.equal(r.subscribers.size, 0);
  }
});
test('callbacks from a previous session cannot change the next one', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(3000);
  const oldSample = r.sampleCallback,
    oldTimer = r.timerCallback;
  r.controller.stop();
  r.controller.settle(r.finished[0]);
  r.controller.reset();
  r.controller.start(seed());
  r.tick(6000);
  oldSample({ x: 1, y: 2, z: 3, timestamp: 100 });
  oldTimer();
  assert.equal(r.controller.getSnapshot().session.raw_samples.length, 0);
  r.controller.dispose();
});
test('subscription failures produce an error result and release the timer', () => {
  const r = rig({
    subscribe() {
      throw new Error('sensor unavailable');
    },
  });
  r.controller.start(seed());
  r.tick(3000);
  assert.equal(r.finished[0].status, 'error');
  assert.equal(r.timers.size, 0);
});
test('dispose stops an active record once and prevents later callbacks', () => {
  const r = rig();
  r.controller.start(seed());
  r.tick(3000);
  const late = r.sampleCallback;
  r.controller.dispose();
  r.controller.dispose();
  late({ x: 1, y: 1, z: 1, timestamp: 1 });
  assert.equal(r.finished.length, 1);
  assert.equal(r.finished[0].raw_samples.length, 0);
  assert.equal(r.timers.size, 0);
  assert.equal(r.subscribers.size, 0);
});
test('native cleanup errors do not discard the partial record', () => {
  const r = rig({
    subscribe() {
      return () => {
        throw new Error('remove failure');
      };
    },
  });
  r.controller.start(seed());
  r.tick(3000);
  r.controller.stop();
  assert.equal(r.finished.length, 1);
  assert.equal(r.timers.size, 0);
});

test('iPhone records live sensor samples with a separately labeled finite pulse protocol', () => {
  const config = protocolForPlatform('ios');
  const requests = [];
  const r = rig(
    {
      vibrate(duration) {
        requests.push(buildVibrationRequest(config, duration));
      },
    },
    config,
  );
  r.controller.start({ ...seed(), platform: 'ios' });
  r.tick(3000);
  for (let time = 3000; time <= 38000; time += 10) {
    r.sample(time);
    if (time % 100 === 0) r.tick(time);
  }
  const session = r.finished[0];
  assert.equal(session.platform, 'ios');
  assert.equal(session.data_origin, 'live');
  assert.equal(session.status, 'completed');
  assert.equal(session.protocol_version, 'expo_desk_pinch_ios_pulsed_v1');
  assert.equal(session.config.vibration_mode, 'ios_pulsed');
  assert.equal(session.raw_samples.length, 3500);
  assert.equal(requests.length, 1);
  assert.equal(session.schema_version, '2.0');
  assert.equal(session.force_model.kind, 'demo');
  assert.equal(session.summary.force_estimate.valid, true);
  assert.ok(Math.abs(session.summary.force_estimate.value_kgf - 1) < 1e-9);
  assert.equal(requests[0].repeat, false);
  assert.equal(requests[0].pattern.length, 30);
  const event = session.events.find((e) => e.type === 'vibration_start_request');
  assert.deepEqual(JSON.parse(event.detail), requests[0]);
  assert.equal(session.events.find((e) => e.type === 'vibration_cancel_request').actual_ms, 33000);
  assert.equal(r.timers.size, 0);
  assert.equal(r.subscribers.size, 0);
});

test('model is snapshotted at Start before countdown and remains fixed through live updates and save', () => {
  const { DEMO_FORCE_MODEL } = require('../.test-build/config/demoForceModel.js');
  const model = structuredClone(DEMO_FORCE_MODEL);
  const r = rig({}, protocolForPlatform('ios'), model);
  r.controller.start({ ...seed(), platform: 'ios' });
  model.coefficients[0] = 99;
  model.intercept = 80;
  r.tick(3000);
  for (let time = 3000; time <= 38000; time += 10) {
    r.sample(time);
    if (time % 100 === 0) r.tick(time);
    const session = r.controller.getSnapshot().session;
    if (time === 11900)
      assert.ok(session.features.every((f) => f.force_estimate.value_kgf === null));
    if (time === 15000) {
      assert.equal(session.features.at(-1).force_estimate.valid, true);
      assert.ok(Math.abs(session.features.at(-1).force_estimate.value_kgf - 1) < 1e-9);
    }
  }
  const session = r.finished[0];
  assert.equal(session.force_model.intercept, 1);
  assert.deepEqual(session.force_model.coefficients, [5]);
  assert.ok(Object.isFrozen(session.force_model.coefficients));
  assert.ok(Math.abs(session.summary.force_estimate.value_kgf - 1) < 1e-9);
});

test('iOS background interruption cancels pending pulses and preserves its partial record', () => {
  const r = rig({}, protocolForPlatform('ios'));
  r.controller.start({ ...seed(), platform: 'ios' });
  r.tick(3000);
  r.sample(3010);
  r.tick(6000);
  r.log.length = 0;
  r.controller.stop('cancelled', 'app_state:inactive');
  assert.deepEqual(r.log.slice(0, 3), ['cancel', 'unsubscribe', 'timer_clear']);
  assert.equal(r.finished[0].raw_samples.length, 1);
  assert.equal(r.finished[0].status, 'cancelled');
});

test('iOS skips a late start when insufficient time remains for a system pulse', () => {
  const r = rig({}, protocolForPlatform('ios'));
  r.controller.start({ ...seed(), platform: 'ios' });
  r.tick(3000);
  r.tick(35800);
  r.tick(38000);
  assert.equal(r.log.filter(Array.isArray).length, 0);
  assert.ok(r.finished[0].events.some((e) => e.type === 'vibration_start_skipped'));
  assert.ok(r.finished[0].summary.quality_notes.includes('command_late'));
});
