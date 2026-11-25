const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createMeasurementSetup,
  DEFAULT_MEASUREMENT_ENVIRONMENT,
  describeMeasurementSetup,
} = require('../.test-build/lib/measurementSetup.js');
const { createDampingExample, importDamping } = require('../.test-build/lib/dampingReplay.js');
const { serializeSession } = require('../.test-build/lib/sessionJson.js');

test('face-down floor measurement retains all onboarding choices through JSON export and replay', () => {
  const session = createDampingExample();
  session.setup = createMeasurementSetup({
    orientation: 'screen_down_top_away',
    case_material: 'rubber',
    surface_type: 'floor',
    surface_material: 'tile',
    note: '거실 타일 바닥',
  });
  const exported = JSON.parse(serializeSession(session));
  assert.equal(exported.setup.orientation, 'screen_down_top_away');
  assert.equal(exported.setup.case_material, 'rubber');
  assert.equal(exported.setup.case_on, true);
  assert.equal(exported.setup.surface_type, 'floor');
  assert.equal(exported.setup.surface_material, 'tile');
  assert.equal(exported.setup.table_material, null);
  assert.equal(exported.setup.note, '거실 타일 바닥');
  const replay = importDamping(exported);
  assert.deepEqual(replay.setup, exported.setup);
  assert.deepEqual(replay.raw, session.raw);
  assert.deepEqual(replay.features, session.features);
  assert.match(describeMeasurementSetup(replay.setup), /화면이 아래로.*고무.*바닥 \/ 타일/);
});

test('desk measurements record the selected material and derive case_on consistently', () => {
  for (const case_material of ['none', 'plastic', 'rubber']) {
    const session = createDampingExample();
    session.setup = createMeasurementSetup({
      ...DEFAULT_MEASUREMENT_ENVIRONMENT,
      case_material,
      surface_material: 'metal',
    });
    const saved = JSON.parse(serializeSession(session));
    assert.equal(saved.setup.case_on, case_material !== 'none');
    assert.equal(saved.setup.table_material, 'metal');
    assert.equal(saved.setup.surface_type, 'desk');
    assert.deepEqual(importDamping(saved).setup, session.setup);
  }
});

test('historical records keep missing case and surface metadata instead of inventing selections', () => {
  const session = createDampingExample();
  session.setup.case_on = true;
  const replay = importDamping(JSON.parse(serializeSession(session)));
  assert.deepEqual(replay.setup, session.setup);
  assert.equal(replay.setup.case_material, undefined);
  assert.equal(replay.setup.surface_type, undefined);
  assert.match(describeMeasurementSetup(replay.setup), /케이스 있음 · 재질 미기록/);
});

test('import rejects conflicting or unsupported new environment metadata', () => {
  const session = createDampingExample();
  session.setup = createMeasurementSetup(DEFAULT_MEASUREMENT_ENVIRONMENT);
  for (const patch of [
    { orientation: 'sideways' },
    { case_material: 'rubber', case_on: false },
    { surface_type: 'floor', table_material: 'wood' },
    { surface_type: 'ceiling' },
    { surface_material: 'unsupported' },
  ]) {
    const invalid = JSON.parse(serializeSession(session));
    Object.assign(invalid.setup, patch);
    assert.throws(() => importDamping(invalid), /JSON/);
  }
});
