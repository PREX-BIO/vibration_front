const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  protocolForPlatform,
  supportsLiveMeasurement,
} = require('../.test-build/config/protocol.js');
const { buildVibrationRequest } = require('../.test-build/lib/vibration.js');

test('iOS and Android can start live collection; browser cannot', () => {
  assert.equal(supportsLiveMeasurement('ios'), true);
  assert.equal(supportsLiveMeasurement('android'), true);
  assert.equal(supportsLiveMeasurement('web'), false);
});

test('Android retains its duration command and original protocol version', () => {
  const config = protocolForPlatform('android');
  assert.equal(config.protocol_version, 'expo_desk_pinch_v1');
  assert.deepEqual(buildVibrationRequest(config, 30000), { pattern: 30000, repeat: false });
  assert.deepEqual(buildVibrationRequest(config, 29650), { pattern: 29650, repeat: false });
});

test('iOS uses finite delay arrays with no Android duration or endless repetition', () => {
  const config = protocolForPlatform('ios');
  assert.notEqual(config.protocol_version, protocolForPlatform('android').protocol_version);
  for (const duration of [30000, 29650, 1000, 500]) {
    const request = buildVibrationRequest(config, duration);
    assert.equal(request.repeat, false);
    assert.equal(request.pattern[0], 0);
    assert.ok(request.pattern.slice(1).every((value) => value === 1000));
    const lastPulseStart = request.pattern.reduce((total, value) => total + value, 0);
    assert.ok(lastPulseStart + config.ios_pulse_tail_guard_ms <= duration);
  }
});

test('invalid or too-short iOS windows never issue a vibration command', () => {
  const config = protocolForPlatform('ios');
  for (const duration of [0, -1, NaN, Infinity, 499]) {
    assert.equal(buildVibrationRequest(config, duration), null);
  }
});
