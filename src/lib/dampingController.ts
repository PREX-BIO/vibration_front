import { DAMPING_PROTOCOL, phaseSettle, recordingDuration } from '../config/dampingProtocol';
import type {
  DampingConfig,
  DampingSession,
  FeatureFrame,
  SensorName,
  HapticSchedule,
  HapticReceipt,
  HapticEvent,
} from '../types/damping';
import {
  analyzeDampingWindow,
  isFiniteNumber,
  reanalyzeDamping,
  summarizeDamping,
} from './dampingSignal';
import { buildVibrationRequest } from './vibration';

export type DampingSeed = Pick<DampingSession, 'data_origin' | 'device' | 'setup'> & { id: string };
export type DampingSnapshot = {
  stage: 'ready' | 'countdown' | 'recording' | 'saving' | 'result';
  elapsed_ms: number;
  countdown: number;
  session: DampingSession | null;
};
export const DAMPING_INITIAL: DampingSnapshot = {
  stage: 'ready',
  elapsed_ms: 0,
  countdown: DAMPING_PROTOCOL.countdown_ms / 1000,
  session: null,
};
type Measurement = { x: number; y: number; z: number; timestamp?: number };
export type DampingPorts = {
  now: () => number;
  utcNow: () => string;
  every: (callback: () => void, ms: number) => () => void;
  subscribe: (
    sensor: SensorName,
    callback: (sample: Measurement) => void,
    interval: number,
  ) => () => void;
  vibrate: (pattern: number | number[], repeat: false) => void;
  cancelVibration: () => void;
  scheduleHaptics?: (request: HapticSchedule) => HapticReceipt;
  subscribeHaptics?: (callback: (event: HapticEvent) => void) => () => void;
  onUpdate: (snapshot: DampingSnapshot) => void;
  onFinish: (session: DampingSession) => void;
};

export function createDampingSession(
  seed: DampingSeed,
  utc: string,
  config = DAMPING_PROTOCOL,
): DampingSession {
  const cloned = JSON.parse(JSON.stringify(config)) as DampingConfig;
  const emptyStats = {
    sample_count: 0,
    invalid_samples: 0,
    invalid_frames: 0,
    sensor_rate_hz: null,
    receive_rate_hz: null,
    gap_events: 0,
    timestamp_resets: 0,
  };
  return {
    schema_version: config.analysis_version === 'accel_ac_rms_2s_fixed_baseline_v1' ? '3.0' : '4.0',
    protocol_version: config.protocol_version,
    analysis_version: config.analysis_version,
    metric_scope: 'observed_acceleration_variation',
    motor_isolation: 'not_established',
    data_origin: seed.data_origin,
    session: {
      id: seed.id,
      started_at_utc: utc,
      ended_at_utc: null,
      planned_duration_ms: recordingDuration(config),
      actual_duration_ms: 0,
      status: 'recording',
      abort_reason: null,
    },
    device: JSON.parse(JSON.stringify(seed.device)),
    setup: { ...seed.setup },
    config: cloned,
    vibration: {
      api:
        config.vibration_mode.startsWith('ios_') && config.vibration_mode !== 'ios_pulsed'
          ? 'CoreHaptics'
          : 'ReactNative.Vibration',
      duration_ms: null,
      duration_s: config.vibration_duration_ms != null ? config.vibration_duration_ms / 1000 : null,
      intensity:
        config.vibration_mode === 'ios_core_haptics_continuous' ? config.haptic_intensity : null,
      sharpness:
        config.vibration_mode === 'ios_core_haptics_continuous' ? config.haptic_sharpness : null,
      settings_id:
        config.vibration_mode === 'ios_core_haptics_continuous'
          ? (config.haptic_settings_id ?? null)
          : null,
      event_type:
        config.vibration_mode === 'ios_core_haptics_continuous'
          ? 'hapticContinuous'
          : config.vibration_mode === 'android_continuous'
            ? 'android_continuous'
            : undefined,
      schedule_request_ms: null,
      response_received_ms: null,
      scheduled_start_ms: null,
      scheduled_end_ms: null,
      completion_received_ms: null,
      native_receipt: null,
      native_events: [],
      stop_response_received_ms: null,
      pattern: null,
      repeat: false,
      interval_ms: config.ios_pulse_interval_ms,
      start_request_ms: null,
      stop_request_ms: null,
      start_succeeded: null,
      stop_succeeded: null,
      hardware_onset_verified: false,
    },
    phases: cloned.phases.map((p) => ({ ...p })),
    events: [],
    raw: { units: { accelerometer: 'g', gyroscope: 'rad/s' }, accelerometer: [], gyroscope: [] },
    baseline: {
      baseline_id: `${config.reference_phase_id}_1`,
      accel_ac_rms_g: null,
      source_start_ms: null,
      source_end_ms: null,
      frame_ids: [],
      available_at_ms: null,
      valid: false,
      reasons: ['baseline_unavailable'],
    },
    features: [],
    summary: {
      phases: [],
      off_pre: null,
      off_post: null,
      baseline_cv: null,
      baseline_to_off_pre_ratio: null,
      quality_notes: [],
      sensors: { accelerometer: { ...emptyStats }, gyroscope: { ...emptyStats } },
    },
    observations: { phone_moved: null, extra_contact: null, note: '' },
  };
}

export class DampingController {
  private snapshot = { ...DAMPING_INITIAL };
  private seed: DampingSeed | null = null;
  private generation = 0;
  private countdownStart = 0;
  private recordStart = 0;
  private stopTimer: (() => void) | null = null;
  private subscriptions: (() => void)[] = [];
  private phaseIndex = 0;
  private nextWindow = DAMPING_PROTOCOL.window_ms;
  private windows: FeatureFrame[] = [];
  private vibrationAttempted = false;
  private vibrationCancelled = false;
  private finishing = false;
  constructor(
    private ports: DampingPorts,
    private config = DAMPING_PROTOCOL,
  ) {}
  getSnapshot() {
    return this.snapshot;
  }
  private emit() {
    this.ports.onUpdate({ ...this.snapshot });
  }
  private event(
    type: string,
    actual: number,
    planned: number | null = null,
    detail: string | null = null,
    sensor: SensorName | null = null,
  ) {
    const s = this.snapshot.session;
    s?.events.push({
      type,
      actual_ms: actual,
      planned_ms: planned,
      phase_id: s.phases[this.phaseIndex]?.phase_id ?? null,
      detail,
      sensor,
    });
  }
  start(seed: DampingSeed) {
    if (this.snapshot.stage !== 'ready') return false;
    this.config = JSON.parse(JSON.stringify(this.config)) as DampingConfig;
    this.seed = JSON.parse(JSON.stringify(seed));
    this.countdownStart = this.ports.now();
    this.generation++;
    this.snapshot = {
      ...DAMPING_INITIAL,
      countdown: Math.ceil(this.config.countdown_ms / 1000),
      stage: 'countdown',
    };
    this.emit();
    const generation = this.generation;
    this.stopTimer = this.ports.every(() => {
      if (generation === this.generation) this.tick();
    }, this.config.hop_ms);
    return true;
  }
  private begin() {
    this.recordStart = this.ports.now();
    this.phaseIndex = 0;
    this.nextWindow = this.config.window_ms;
    this.windows = [];
    this.vibrationAttempted = false;
    this.vibrationCancelled = false;
    this.finishing = false;
    const s = createDampingSession(this.seed!, this.ports.utcNow(), this.config);
    s.phases[0].actual_start_ms = 0;
    s.phases[0].summary_start_ms = phaseSettle(this.config, s.phases[0]);
    this.snapshot = { stage: 'recording', elapsed_ms: 0, countdown: 0, session: s };
    this.event('record_start', 0, 0);
    this.event('phase_transition', 0, 0, s.phases[0].cue);
    const generation = this.generation;
    for (const sensor of ['accelerometer', 'gyroscope'] as const) {
      const access = s.device.sensors[sensor];
      if (access.available === false || access.permission === 'denied') {
        this.event('sensor_unavailable', 0, null, access.permission, sensor);
        continue;
      }
      try {
        const unsubscribe = this.ports.subscribe(
          sensor,
          (measurement) => {
            if (generation !== this.generation || this.snapshot.stage !== 'recording') return;
            const session = this.snapshot.session!,
              raw = session.raw[sensor];
            const ms = this.ports.now() - this.recordStart,
              previous = raw.at(-1);
            const timestamp = isFiniteNumber(measurement.timestamp) ? measurement.timestamp : null;
            const reasons: string[] = [];
            if (![measurement.x, measurement.y, measurement.z].every(isFiniteNumber))
              reasons.push('invalid_axis');
            if (timestamp === null) reasons.push('invalid_sensor_timestamp');
            if (timestamp !== null && previous?.sensor_timestamp_s != null) {
              const gap = (timestamp - previous.sensor_timestamp_s) * 1000;
              if (gap <= 0) {
                reasons.push('invalid_sensor_timestamp');
                this.event(
                  gap < 0 ? 'timestamp_reset' : 'timestamp_duplicate',
                  ms,
                  null,
                  `previous=${previous.sensor_timestamp_s}; current=${timestamp}`,
                  sensor,
                );
              }
              if (gap > this.config.max_sensor_gap_ms)
                this.event('sensor_gap', ms, null, `native_gap_ms=${gap}`, sensor);
            }
            if (previous && ms - previous.t_receive_ms > this.config.max_receive_gap_ms)
              this.event(
                'sensor_gap',
                ms,
                null,
                `receive_gap_ms=${ms - previous.t_receive_ms}`,
                sensor,
              );
            raw.push({
              sample_id: raw.length,
              sensor_timestamp_s: timestamp,
              t_receive_ms: ms,
              x: isFiniteNumber(measurement.x) ? measurement.x : null,
              y: isFiniteNumber(measurement.y) ? measurement.y : null,
              z: isFiniteNumber(measurement.z) ? measurement.z : null,
              phase_id: session.phases[this.phaseIndex].phase_id,
              valid: reasons.length === 0,
              reasons,
            });
          },
          sensor === 'accelerometer'
            ? this.config.requested_accel_interval_ms
            : this.config.requested_gyro_interval_ms,
        );
        this.subscriptions.push(unsubscribe);
      } catch (error) {
        s.device.sensors[sensor].available = false;
        this.event('sensor_subscription_failed', 0, null, String(error), sensor);
        if (sensor === 'accelerometer') {
          this.stop('aborted', 'accelerometer_subscription_failed');
          return;
        }
      }
    }
    if (this.config.vibration_mode === 'ios_core_haptics_continuous') {
      this.vibrationAttempted = true;
      try {
        if (!this.ports.scheduleHaptics || !this.ports.subscribeHaptics)
          throw new Error(
            '31초 측정용 네이티브 모듈이 필요합니다. Xcode에서 앱을 다시 빌드해 주세요.',
          );
        this.subscriptions.push(
          this.ports.subscribeHaptics((event) => {
            if (generation === this.generation) this.onHapticEvent(event);
          }),
        );
        const requested = this.ports.now() - this.recordStart;
        s.vibration.schedule_request_ms = requested;
        s.vibration.start_request_ms = requested;
        const receipt = this.ports.scheduleHaptics({
          playback_id: s.session.id,
          delay_ms: Math.max(0, this.config.vibration_start_ms - requested),
          duration_ms: this.config.vibration_duration_ms!,
          intensity: this.config.haptic_intensity!,
          sharpness: this.config.haptic_sharpness!,
        });
        const received = this.ports.now() - this.recordStart;
        s.vibration.response_received_ms = received;
        if (
          !receipt ||
          receipt.playback_id !== s.session.id ||
          ![
            receipt.native_request_ms,
            receipt.native_response_ms,
            receipt.native_scheduled_start_ms,
            receipt.native_scheduled_end_ms,
          ].every(isFiniteNumber)
        )
          throw new Error('Invalid native haptic schedule response');
        s.vibration.native_receipt = receipt;
        // Bridge the native clock by its request anchor, retaining both raw clocks and RTT.
        s.vibration.scheduled_start_ms =
          requested + receipt.native_scheduled_start_ms - receipt.native_request_ms;
        s.vibration.scheduled_end_ms =
          requested + receipt.native_scheduled_end_ms - receipt.native_request_ms;
        s.vibration.duration_ms =
          receipt.native_scheduled_end_ms - receipt.native_scheduled_start_ms;
        if (Math.abs(s.vibration.duration_ms - this.config.vibration_duration_ms!) > 1)
          throw new Error('Native haptic duration does not match the protocol');
        s.vibration.start_succeeded = true;
        this.event(
          'vibration_scheduled',
          requested,
          this.config.vibration_start_ms,
          JSON.stringify(receipt),
        );
        this.event(
          'vibration_schedule_response',
          received,
          null,
          `round_trip_ms=${received - requested}`,
        );
        this.checkTiming(
          s.vibration.scheduled_start_ms,
          this.config.vibration_start_ms,
          'vibration_start',
        );
        this.checkTiming(
          s.vibration.scheduled_end_ms,
          this.config.vibration_end_ms,
          'vibration_end',
        );
        if (received - requested > this.config.command_late_ms!)
          this.event('timing_mismatch', received, null, 'native_schedule_clock_uncertainty');
      } catch (error) {
        s.vibration.start_succeeded = false;
        this.event(
          'vibration_start_failed',
          this.ports.now() - this.recordStart,
          this.config.vibration_start_ms,
          String(error),
        );
        this.stop('aborted', 'vibration_start_failed');
      }
    }
  }
  private checkTiming(actual: number, planned: number, detail: string) {
    if (
      this.config.command_late_ms != null &&
      Math.abs(actual - planned) > this.config.command_late_ms
    )
      this.event('timing_mismatch', actual, planned, `${detail}; delta_ms=${actual - planned}`);
  }
  private onHapticEvent(event: HapticEvent) {
    const s = this.snapshot.session;
    if (
      this.snapshot.stage !== 'recording' ||
      this.finishing ||
      !s ||
      event.playback_id !== s.session.id
    )
      return;
    const received = this.ports.now() - this.recordStart;
    s.vibration.native_events!.push({ ...event, received_ms: received });
    this.event(`haptic_${event.type}`, received, null, JSON.stringify(event));
    if (event.type === 'completed') {
      s.vibration.completion_received_ms = received;
      const expected = s.vibration.native_receipt?.native_scheduled_end_ms;
      if (expected != null && event.native_event_ms < expected - this.config.command_late_ms!) {
        this.event(
          'timing_mismatch',
          received,
          this.config.vibration_end_ms,
          'native_completion_before_scheduled_end',
        );
        this.stop('aborted', 'haptic_early_completion');
      }
      return; // A notification arrival time is not the physical motor-off time.
    }
    if (event.type !== 'stopped' || event.detail !== 'requested')
      this.stop('aborted', `haptic_${event.type}`);
  }
  private cancelMotor(ms: number) {
    if (this.vibrationCancelled) return;
    this.vibrationCancelled = true;
    const s = this.snapshot.session!;
    s.vibration.stop_request_ms = ms;
    try {
      this.ports.cancelVibration();
      s.vibration.stop_response_received_ms = this.ports.now() - this.recordStart;
      s.vibration.stop_succeeded = true;
      this.event('vibration_cancel_request', ms, this.config.vibration_end_ms);
    } catch (error) {
      s.vibration.stop_succeeded = false;
      this.event('vibration_cancel_failed', ms, this.config.vibration_end_ms, String(error));
    }
  }
  private tick() {
    if (this.snapshot.stage === 'countdown') {
      const left = this.config.countdown_ms - (this.ports.now() - this.countdownStart);
      if (left > 0) {
        this.snapshot.countdown = Math.ceil(left / 1000);
        this.emit();
        return;
      }
      this.begin();
    }
    if (this.snapshot.stage !== 'recording') return;
    const elapsed = this.ports.now() - this.recordStart,
      s = this.snapshot.session!;
    // Only the cue actually displayed becomes an active phase. Skipped cues get no fabricated interval.
    let next = s.phases.findIndex(
      (p) => elapsed >= p.planned_start_ms && elapsed < p.planned_end_ms,
    );
    if (next < 0) next = s.phases.length - 1;
    if (next !== this.phaseIndex && elapsed < recordingDuration(this.config)) {
      const previous = s.phases[this.phaseIndex];
      previous.actual_end_ms = elapsed;
      previous.summary_end_ms = elapsed;
      previous.completed = true;
      for (let i = this.phaseIndex + 1; i < next; i++)
        this.event('phase_skipped', elapsed, s.phases[i].planned_start_ms, s.phases[i].phase_id);
      this.phaseIndex = next;
      const phase = s.phases[next];
      phase.actual_start_ms = elapsed;
      phase.summary_start_ms = elapsed + phaseSettle(this.config, phase);
      this.event('phase_transition', elapsed, phase.planned_start_ms, phase.cue);
      this.checkTiming(elapsed, phase.planned_start_ms, 'phase_transition');
    }
    if (!this.vibrationAttempted && elapsed >= this.config.vibration_start_ms) {
      this.vibrationAttempted = true;
      const request = buildVibrationRequest(this.config, this.config.vibration_end_ms - elapsed);
      if (request) {
        s.vibration.pattern = Array.isArray(request.pattern) ? request.pattern : null;
        s.vibration.duration_ms = typeof request.pattern === 'number' ? request.pattern : null;
        s.vibration.start_request_ms = elapsed;
        try {
          this.ports.vibrate(request.pattern, false);
          s.vibration.response_received_ms = this.ports.now() - this.recordStart;
          s.vibration.scheduled_start_ms = elapsed;
          s.vibration.scheduled_end_ms = this.config.vibration_end_ms;
          s.vibration.start_succeeded = true;
          this.checkTiming(elapsed, this.config.vibration_start_ms, 'vibration_start');
          this.event(
            'vibration_start_request',
            elapsed,
            this.config.vibration_start_ms,
            JSON.stringify(request),
          );
        } catch (error) {
          s.vibration.start_succeeded = false;
          this.event(
            'vibration_start_failed',
            elapsed,
            this.config.vibration_start_ms,
            String(error),
          );
          this.stop('aborted', 'vibration_start_failed');
          return;
        }
      } else {
        s.vibration.start_succeeded = false;
        this.event('vibration_start_skipped', elapsed, this.config.vibration_start_ms);
        this.stop('aborted', 'vibration_start_skipped');
        return;
      }
    }
    // iOS ends on its native schedule; allow its completion event to arrive before cleanup.
    if (
      elapsed >= this.config.vibration_end_ms &&
      this.config.vibration_mode !== 'ios_core_haptics_continuous'
    ) {
      if (!this.vibrationCancelled)
        this.checkTiming(elapsed, this.config.vibration_end_ms, 'vibration_stop');
      this.cancelMotor(elapsed);
    }
    if (elapsed >= recordingDuration(this.config)) {
      for (let i = this.phaseIndex + 1; i < s.phases.length; i++)
        this.event('phase_skipped', elapsed, s.phases[i].planned_start_ms, s.phases[i].phase_id);
      this.checkTiming(elapsed, recordingDuration(this.config), 'record_stop');
      this.stop('completed', null);
      return;
    }
    s.session.actual_duration_ms = elapsed;
    while (this.nextWindow <= elapsed) {
      this.windows.push(analyzeDampingWindow(s, this.nextWindow));
      this.nextWindow += this.config.hop_ms;
    }
    this.snapshot.session = summarizeDamping(s, this.windows);
    this.snapshot.elapsed_ms = elapsed;
    this.emit();
  }
  private release() {
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch {
        /* Preserve the record. */
      }
    }
    this.subscriptions = [];
    try {
      this.stopTimer?.();
    } catch {
      /* Generation protects queued callbacks. */
    }
    this.stopTimer = null;
    this.generation++;
  }
  stop(status: 'completed' | 'aborted' = 'aborted', reason: string | null = 'user_stop') {
    if (this.snapshot.stage === 'countdown') {
      try {
        this.ports.cancelVibration();
      } catch {
        /* No record yet. */
      }
      this.release();
      this.snapshot = { ...DAMPING_INITIAL };
      this.emit();
      return;
    }
    if (this.snapshot.stage !== 'recording' || this.finishing) return;
    this.finishing = true;
    const ms = this.ports.now() - this.recordStart,
      s = this.snapshot.session!;
    if (status === 'completed' && s.schema_version === '4.0') {
      const ios = this.config.protocol_version === 'expo_desk_pinch_continuous_31s_v1';
      if (
        ios &&
        (this.config.vibration_mode !== 'ios_core_haptics_continuous' ||
          !s.vibration.start_succeeded ||
          s.vibration.completion_received_ms == null)
      ) {
        status = 'aborted';
        reason = 'haptic_completion_unconfirmed';
      }
    }
    this.cancelMotor(ms);
    this.release();
    for (const sensor of ['accelerometer', 'gyroscope'] as const) {
      const last = s.raw[sensor].at(-1);
      if (
        s.device.sensors[sensor].available &&
        (!last || ms - last.t_receive_ms > this.config.max_receive_gap_ms)
      )
        this.event(
          'sensor_stream_missing',
          ms,
          null,
          `last_receive_ms=${last?.t_receive_ms ?? 'none'}`,
          sensor,
        );
    }
    const phase = s.phases[this.phaseIndex];
    phase.actual_end_ms = ms;
    phase.summary_end_ms = ms;
    phase.completed = status === 'completed' && this.phaseIndex === s.phases.length - 1;
    this.event(
      status === 'aborted' ? 'record_aborted' : 'record_stop',
      ms,
      recordingDuration(this.config),
      reason,
    );
    s.session = {
      ...s.session,
      actual_duration_ms: ms,
      status,
      abort_reason: reason,
      ended_at_utc: this.ports.utcNow(),
    };
    const session = reanalyzeDamping(s);
    this.snapshot = { stage: 'saving', elapsed_ms: ms, countdown: 0, session };
    this.emit();
    this.ports.onFinish(session);
  }
  settle(session: DampingSession) {
    if (
      this.snapshot.stage !== 'saving' ||
      this.snapshot.session?.session.id !== session.session.id
    )
      return;
    this.snapshot = { ...this.snapshot, stage: 'result', session };
    this.emit();
  }
  reset() {
    if (this.snapshot.stage === 'result') {
      this.snapshot = { ...DAMPING_INITIAL };
      this.emit();
    }
  }
  dispose() {
    this.stop('aborted', 'screen_leave');
    this.release();
  }
}
