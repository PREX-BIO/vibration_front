import { phaseAt, PROTOCOL } from '../config/protocol';
import { DEMO_FORCE_MODEL } from '../config/demoForceModel';
import type { ForceModel } from '../types/force';
import type { AnalysisConfig, SignalWindow, Session, SessionEvent } from '../types/session';
import { snapshotForceModel } from './predictForce';
import { analyzeWindow, finite, reanalyze, summarize } from './signal';
import { buildVibrationRequest } from './vibration';

export type SessionSeed = Pick<
  Session,
  | 'session_id'
  | 'data_origin'
  | 'platform'
  | 'runtime'
  | 'app_version'
  | 'expo_sdk_version'
  | 'device_model_note'
  | 'environment'
>;
export type Measurement = { x: number; y: number; z: number; timestamp?: number };
export type Snapshot = {
  stage: 'ready' | 'countdown' | 'recording' | 'saving' | 'result';
  elapsed_ms: number;
  countdown: number;
  session: Session | null;
};
export type SessionPorts = {
  now: () => number;
  utcNow: () => string;
  every: (callback: () => void, ms: number) => () => void;
  subscribe: (callback: (sample: Measurement) => void, interval: number) => () => void;
  vibrate: (duration: number) => void;
  cancelVibration: () => void;
  onUpdate: (snapshot: Snapshot) => void;
  onFinish: (session: Session) => void;
};

export function createSession(
  seed: SessionSeed,
  started: string,
  config = PROTOCOL,
  model = DEMO_FORCE_MODEL,
): Session {
  const forceModel = snapshotForceModel(model);
  return {
    ...seed,
    schema_version: '2.0',
    force_model: forceModel,
    status: 'recording',
    protocol_version: config.protocol_version,
    analysis_version: config.analysis_version,
    started_at_utc: started,
    ended_at_utc: null,
    duration_ms: 0,
    posture_id: 'thumb_index',
    hand: 'right',
    phase_assignment: 'js_receive_time',
    environment: { ...seed.environment },
    config: JSON.parse(JSON.stringify(config)) as AnalysisConfig,
    raw_samples: [],
    events: [],
    features: [],
    summary: summarize([], [], [], config, 0, false, false, forceModel).summary,
    observations: { phone_moved: null, extra_contact: null, note: '' },
  };
}

/** Owns all live resources. React only receives a snapshot on the 100 ms clock. */
export class SessionController {
  private snapshot: Snapshot = { stage: 'ready', elapsed_ms: 0, countdown: 3, session: null };
  private seed: SessionSeed | null = null;
  private generation = 0;
  private countdownStart = 0;
  private recordStart = 0;
  private stopTimer: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private nextWindow = 500;
  private nextPhase = 0;
  private motorStarted = false;
  private motorCancelled = false;
  private windows: SignalWindow[] = [];
  private forceModel: ForceModel = DEMO_FORCE_MODEL;

  constructor(
    private ports: SessionPorts,
    private config = PROTOCOL,
    private model = DEMO_FORCE_MODEL,
  ) {}

  getSnapshot() {
    return this.snapshot;
  }

  start(seed: SessionSeed): boolean {
    if (this.snapshot.stage !== 'ready') return false;
    this.forceModel = snapshotForceModel(this.model);
    this.generation++;
    this.seed = seed;
    this.countdownStart = this.ports.now();
    this.snapshot = {
      stage: 'countdown',
      elapsed_ms: 0,
      countdown: Math.ceil(this.config.countdown_ms / 1000),
      session: null,
    };
    this.emit();
    const generation = this.generation;
    this.stopTimer = this.ports.every(() => {
      if (generation === this.generation) this.tick();
    }, this.config.hop_ms);
    return true;
  }

  private emit() {
    this.ports.onUpdate({ ...this.snapshot });
  }

  private event(
    type: SessionEvent['type'],
    planned: number,
    actual: number,
    detail: string | null = null,
    phase = phaseAt(Math.min(actual, this.config.duration_ms - 1), this.config)?.id ?? null,
  ) {
    this.snapshot.session?.events.push({
      type,
      planned_ms: planned,
      actual_ms: actual,
      phase_id: phase,
      detail,
    });
  }

  private begin() {
    this.recordStart = this.ports.now();
    this.nextWindow = this.config.window_ms;
    this.nextPhase = 0;
    this.motorStarted = false;
    this.motorCancelled = false;
    this.windows = [];
    this.snapshot = {
      stage: 'recording',
      elapsed_ms: 0,
      countdown: 0,
      session: createSession(this.seed!, this.ports.utcNow(), this.config, this.forceModel),
    };
    this.event('record_start', 0, 0);
    const generation = this.generation;
    try {
      this.unsubscribe = this.ports.subscribe((measurement) => {
        if (generation !== this.generation || this.snapshot.stage !== 'recording') return;
        const ms = this.ports.now() - this.recordStart;
        const phase = phaseAt(ms, this.config);
        if (!phase) return;
        const session = this.snapshot.session!;
        session.raw_samples.push({
          index: session.raw_samples.length,
          sensor_timestamp_s: finite(measurement.timestamp) ? measurement.timestamp : null,
          received_relative_ms: ms,
          x_g: finite(measurement.x) ? measurement.x : null,
          y_g: finite(measurement.y) ? measurement.y : null,
          z_g: finite(measurement.z) ? measurement.z : null,
          phase_id: phase.id,
        });
      }, this.config.requested_interval_ms);
    } catch (error) {
      this.stop('error', String(error));
    }
  }

  private tick() {
    if (this.snapshot.stage === 'countdown') {
      const remaining = this.config.countdown_ms - (this.ports.now() - this.countdownStart);
      if (remaining > 0) {
        this.snapshot.countdown = Math.ceil(remaining / 1000);
        this.emit();
        return;
      }
      this.begin();
    }
    if (this.snapshot.stage !== 'recording') return;
    const elapsed = this.ports.now() - this.recordStart;
    try {
      while (
        this.nextPhase < this.config.phases.length &&
        this.config.phases[this.nextPhase].start_ms <= elapsed
      ) {
        const phase = this.config.phases[this.nextPhase++];
        this.event(
          'phase_cue',
          phase.start_ms,
          elapsed,
          elapsed >= phase.end_ms ? 'skipped: cue interval already ended' : phase.cue,
          phase.id,
        );
      }
      if (
        !this.motorStarted &&
        elapsed >= this.config.vibration_start_ms &&
        elapsed < this.config.vibration_end_ms
      ) {
        this.motorStarted = true;
        const remaining = this.config.vibration_end_ms - elapsed;
        const request = buildVibrationRequest(this.config, remaining);
        if (request) {
          this.event(
            'vibration_start_request',
            this.config.vibration_start_ms,
            elapsed,
            JSON.stringify(request),
          );
          this.ports.vibrate(remaining);
        } else {
          this.event(
            'vibration_start_skipped',
            this.config.vibration_start_ms,
            elapsed,
            'Not enough time remains for a system pulse.',
          );
        }
      }
      if (!this.motorCancelled && elapsed >= this.config.vibration_end_ms) {
        this.ports.cancelVibration();
        this.motorCancelled = true;
        this.event('vibration_cancel_request', this.config.vibration_end_ms, elapsed);
      }
    } catch (error) {
      this.stop('error', String(error));
      return;
    }
    if (elapsed >= this.config.duration_ms) {
      this.stop('completed', 'protocol_complete');
      return;
    }
    const session = this.snapshot.session!;
    while (this.nextWindow <= elapsed) {
      this.windows.push(analyzeWindow(session.raw_samples, this.nextWindow, this.config));
      this.nextWindow += this.config.hop_ms;
    }
    Object.assign(
      session,
      summarize(
        session.raw_samples,
        this.windows,
        session.events,
        this.config,
        elapsed,
        false,
        false,
        session.force_model,
      ),
    );
    session.duration_ms = elapsed;
    this.snapshot.elapsed_ms = elapsed;
    this.emit();
  }

  private release() {
    // Cancellation is always attempted first; another cleanup failure must not skip it.
    try {
      this.ports.cancelVibration();
    } catch {
      /* Preserve the record even if native cancellation fails. */
    }
    try {
      this.unsubscribe?.();
    } catch {
      /* Continue cleanup and preserve partial data. */
    }
    this.unsubscribe = null;
    try {
      this.stopTimer?.();
    } catch {
      /* Generation invalidates a queued callback. */
    }
    this.stopTimer = null;
    this.generation++;
  }

  stop(status: 'completed' | 'cancelled' | 'error' = 'cancelled', reason = 'user_stop') {
    const stage = this.snapshot.stage;
    if (stage !== 'countdown' && stage !== 'recording') return;
    const actual = stage === 'recording' ? this.ports.now() - this.recordStart : 0;
    this.release();
    if (stage === 'countdown') {
      this.snapshot = { stage: 'ready', elapsed_ms: 0, countdown: 3, session: null };
      this.emit();
      return;
    }
    if (!this.motorCancelled)
      this.event(
        'vibration_cancel_request',
        Math.min(actual, this.config.vibration_end_ms),
        actual,
        reason,
      );
    this.event('record_stop', this.config.duration_ms, actual, reason);
    const session = reanalyze({
      ...this.snapshot.session!,
      status,
      duration_ms: Math.min(actual, this.config.duration_ms),
      ended_at_utc: this.ports.utcNow(),
    });
    this.snapshot = { stage: 'saving', elapsed_ms: session.duration_ms, countdown: 0, session };
    this.emit();
    this.ports.onFinish(session);
  }

  settle(session: Session) {
    if (
      this.snapshot.stage !== 'saving' ||
      this.snapshot.session?.session_id !== session.session_id
    )
      return;
    this.snapshot = { ...this.snapshot, stage: 'result', session };
    this.emit();
  }

  reset() {
    if (this.snapshot.stage !== 'result') return;
    this.snapshot = { stage: 'ready', elapsed_ms: 0, countdown: 3, session: null };
    this.emit();
  }

  dispose() {
    this.stop('cancelled', 'screen_leave');
    this.release();
  }
}
