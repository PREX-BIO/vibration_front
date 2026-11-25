const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_ANDROID_VIBRATION_PREFERENCE,
  resolveAndroidVibrationPreference,
  selectAndroidWaveformMode,
  buildAndroidWaveformRequest,
} = require('../.test-build/lib/androidVibration.js');

test('default and stale experimental selections resolve to standard; waveform once requires selection', () => {
  assert.equal(DEFAULT_ANDROID_VIBRATION_PREFERENCE, 'standard');
  for (const value of [undefined, null, '', 'auto', 'renewed', 'waveform_repeat', 'standard']) {
    assert.equal(resolveAndroidVibrationPreference(value), 'standard');
    assert.equal(selectAndroidWaveformMode('android', value), null);
  }
  assert.equal(resolveAndroidVibrationPreference('waveform_once'), 'waveform_once');
  assert.equal(selectAndroidWaveformMode('android', 'waveform_once'), 'once');
  for (const platform of ['ios', 'web'])
    assert.equal(selectAndroidWaveformMode(platform, 'waveform_once'), null);
});

test('finite waveform has zero OFF durations and covers exactly the requested remaining interval', () => {
  assert.deepEqual(buildAndroidWaveformRequest('once', 25000), {
    pattern: [0, 8000, 0, 8000, 0, 8000, 0, 1000],
    repeat: false,
  });
  assert.deepEqual(buildAndroidWaveformRequest('once', 24650), {
    pattern: [0, 8000, 0, 8000, 0, 8000, 0, 650],
    repeat: false,
  });
  for (const ms of [0.2, 800, 8000, 8001, 24650, 25000]) {
    const request = buildAndroidWaveformRequest('once', ms);
    assert.equal(
      request.pattern.reduce((sum, v) => sum + v, 0),
      Math.ceil(ms),
    );
    assert.equal(request.repeat, false);
    assert.ok(request.pattern.every((v, i) => (i % 2 === 0 ? v === 0 : v > 0 && v <= 8000)));
  }
  for (const ms of [0, -1, NaN, Infinity, 25001])
    assert.equal(buildAndroidWaveformRequest('once', ms), null);
});

test('historical repeated waveform requests can still be reconstructed for JSON validation', () => {
  assert.deepEqual(buildAndroidWaveformRequest('repeat', 25000), {
    pattern: [0, 8000],
    repeat: true,
  });
  assert.deepEqual(buildAndroidWaveformRequest('repeat', 0.2), { pattern: [0, 1], repeat: false });
});
