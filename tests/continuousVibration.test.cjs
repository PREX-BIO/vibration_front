const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createContinuousVibrationDriver,
} = require('../.test-build/lib/continuousVibrationDriver.js');
const {
  supportsDampingMeasurement,
  dampingProtocolForPlatform,
  DAMPING_PROTOCOL,
} = require('../.test-build/config/dampingProtocol.js');

function devices() {
  const log = [];
  return {
    log,
    android: {
      vibrate: (...args) => log.push(['android.start', ...args]),
      cancel: () => log.push(['android.stop']),
    },
    ios: {
      apiVersion: 2,
      isSupported: () => true,
      prepare: () => log.push(['ios.prepare']),
      schedule: (_id, delay, ms, intensity, sharpness) =>
        log.push(['ios.schedule', delay, ms, intensity, sharpness]),
      addListener: () => ({ remove() {} }),
      stop: () => log.push(['ios.stop']),
    },
  };
}

test('Android accepts live measurement without requiring the iOS native module', () => {
  const d = devices();
  const output = createContinuousVibrationDriver('android', d.android, null);
  output.prepare();
  assert.deepEqual(d.log, []);
  output.start(25000);
  output.stop();
  assert.deepEqual(d.log, [['android.start', 25000, false], ['android.stop']]);
});

test('Android test and late requests use finite one-shot durations, including sub-millisecond remainders', () => {
  const d = devices();
  const output = createContinuousVibrationDriver('android', d.android, d.ios);
  output.prepare();
  for (const duration of [800, 24650, 0.2]) {
    output.start(duration);
    output.stop();
  }
  assert.deepEqual(d.log, [
    ['android.start', 800, false],
    ['android.stop'],
    ['android.start', 24650, false],
    ['android.stop'],
    ['android.start', 1, false],
    ['android.stop'],
  ]);
});

test('iOS exclusively uses Core Haptics for preparation, playback and cancellation', () => {
  const d = devices();
  const output = createContinuousVibrationDriver('ios', d.android, d.ios);
  output.prepare();
  output.start(25000);
  output.stop();
  assert.deepEqual(d.log, [['ios.prepare'], ['ios.schedule', 0, 25000, 1.0, 0.5], ['ios.stop']]);
});

test('iOS Expo Go and unsupported hardware give an error without falling back to pulses', () => {
  const d = devices();
  for (const [native, message] of [
    [null, /iOS.*Expo Go/],
    [{ ...d.ios, isSupported: () => false }, /기기는 연속 진동/],
  ]) {
    const output = createContinuousVibrationDriver('ios', d.android, native);
    assert.throws(() => output.prepare(), message);
    assert.throws(() => output.start(25000), message);
  }
  createContinuousVibrationDriver('ios', d.android, null).stop();
  assert.deepEqual(d.log, []);
});

test('both platforms reject invalid durations before issuing native commands', () => {
  for (const platform of ['ios', 'android']) {
    const d = devices();
    const output = createContinuousVibrationDriver(platform, d.android, d.ios);
    for (const ms of [0, -1, NaN, Infinity, 25001]) assert.throws(() => output.start(ms), /25초/);
    assert.deepEqual(d.log, []);
  }
});

test('web cannot start real measurement or vibration', () => {
  const d = devices();
  const output = createContinuousVibrationDriver('web', d.android, d.ios);
  assert.equal(supportsDampingMeasurement('web'), false);
  assert.throws(() => output.prepare(), /휴대폰/);
  assert.throws(() => output.start(800), /휴대폰/);
  output.stop();
  assert.deepEqual(d.log, []);
});

test('live platform selection preserves the shared 3–28s protocol and the original config', () => {
  const before = structuredClone(DAMPING_PROTOCOL);
  for (const platform of ['ios', 'android']) {
    assert.equal(supportsDampingMeasurement(platform), true);
    const config = dampingProtocolForPlatform(platform);
    assert.equal(
      config.vibration_mode,
      platform === 'ios' ? 'ios_core_haptics_continuous' : 'android_continuous',
    );
    assert.equal(config.vibration_start_ms, 3000);
    assert.equal(config.vibration_end_ms, 28000);
    assert.equal(config.ios_pulse_interval_ms, null);
    assert.deepEqual(
      {
        ...config,
        vibration_mode: before.vibration_mode,
        protocol_version: before.protocol_version,
      },
      before,
    );
  }
  assert.deepEqual(DAMPING_PROTOCOL, before);
});

test('old iOS binary requires reinstall rather than silently using the previous API', () => {
  const d = devices();
  const output = createContinuousVibrationDriver('ios', d.android, {
    ...d.ios,
    apiVersion: undefined,
  });
  assert.throws(() => output.prepare(), /다시 빌드/);
  assert.deepEqual(d.log, []);
});

test('iOS scheduling passes the fixed settings and removes only its own event listener', () => {
  const d = devices();
  let callback,
    removed = false;
  const native = {
    ...d.ios,
    schedule: (...args) => {
      d.log.push(args);
      return { playback_id: args[0] };
    },
    addListener: (name, cb) => {
      assert.equal(name, 'onHapticEvent');
      callback = cb;
      return {
        remove: () => {
          removed = true;
        },
      };
    },
  };
  const output = createContinuousVibrationDriver('ios', d.android, native);
  const events = [],
    remove = output.subscribe((e) => events.push(e));
  const receipt = output.schedule({
    playback_id: 'session',
    delay_ms: 3000,
    duration_ms: 25000,
    intensity: DAMPING_PROTOCOL.haptic_intensity,
    sharpness: DAMPING_PROTOCOL.haptic_sharpness,
  });
  assert.deepEqual(d.log, [['session', 3000, 25000, 1.0, 0.5]]);
  assert.equal(receipt.playback_id, 'session');
  callback({ type: 'engine_reset' });
  assert.deepEqual(events, [{ type: 'engine_reset' }]);
  remove();
  assert.equal(removed, true);
});
