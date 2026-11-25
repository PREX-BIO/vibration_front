import { phaseAt, protocolForPlatform } from '../config/protocol';
import type { SessionEvent } from '../types/session';
import { createSession } from './sessionController';
import { reanalyze } from './signal';

/** Deterministic, synthetic 10 Hz fixture. Never used by the live sensor path. */
export function createReplay() {
  const config = protocolForPlatform('ios');
  const started = new Date().toISOString();
  const session = createSession(
    {
      session_id: `replay-${Date.now().toString(36)}`,
      data_origin: 'replay',
      platform: 'synthetic',
      runtime: null,
      app_version: null,
      expo_sdk_version: '58.0.0',
      device_model_note: '10 Hz 합성 신호. 휴대폰 실측이나 모터 주파수가 아닙니다.',
      environment: { table_material: 'wood', case_on: false, note: '화면·계산 검증용 예시' },
    },
    started,
    config,
  );
  for (let ms = 0; ms < config.duration_ms; ms += 10) {
    const phase = phaseAt(ms, config)!;
    const amplitude = !phase.vibration ? 0.002 : phase.id.startsWith('pinch_') ? 0.016 : 0.02;
    session.raw_samples.push({
      index: ms / 10,
      sensor_timestamp_s: 8000 + ms / 1000,
      received_relative_ms: ms,
      x_g: amplitude * Math.sin((2 * Math.PI * 10 * ms) / 1000),
      y_g: 0,
      z_g: 1,
      phase_id: phase.id,
    });
  }
  session.events = [
    {
      type: 'record_start',
      planned_ms: 0,
      actual_ms: 0,
      phase_id: 'off_start',
      detail: 'synthetic replay',
    },
    ...config.phases.map((p) => ({
      type: 'phase_cue' as const,
      planned_ms: p.start_ms,
      actual_ms: p.start_ms,
      phase_id: p.id,
      detail: p.cue,
    })),
    {
      type: 'vibration_start_request',
      planned_ms: 3000,
      actual_ms: 3000,
      phase_id: 'motor_settle',
      detail: 'synthetic event; no motor command',
    },
    {
      type: 'vibration_cancel_request',
      planned_ms: 33000,
      actual_ms: 33000,
      phase_id: 'off_end',
      detail: 'synthetic event; no motor command',
    },
    {
      type: 'record_stop',
      planned_ms: 35000,
      actual_ms: 35000,
      phase_id: 'off_end',
      detail: 'synthetic replay complete',
    },
  ] satisfies SessionEvent[];
  session.events.sort((a, b) => a.actual_ms - b.actual_ms);
  return reanalyze({
    ...session,
    status: 'completed',
    duration_ms: 35000,
    ended_at_utc: new Date(Date.parse(started) + 35000).toISOString(),
  });
}
