import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';

import { dampingProtocolForPlatform, supportsDampingMeasurement } from '@/config/dampingProtocol';
import {
  prepareContinuousVibration,
  startContinuousVibration,
  stopContinuousVibration,
  scheduleContinuousVibration,
  subscribeContinuousVibration,
} from '@/lib/continuousVibration';
import { createDampingExample, importDamping } from '@/lib/dampingReplay';
import { DampingController, DAMPING_INITIAL, type DampingSnapshot } from '@/lib/dampingController';
import { pickSessionJson, saveSession, shareSession } from '@/lib/sessionFile';
import type { SavedFile } from '@/lib/sessionJson';
import { reanalyzeDamping } from '@/lib/dampingSignal';
import type { DampingSession, SensorAccess } from '@/types/damping';
import type { Environment } from '@/types/session';

const INITIAL: DampingSnapshot = DAMPING_INITIAL;
const supportsLive = supportsDampingMeasurement(Platform.OS);
const protocol = dampingProtocolForPlatform(Platform.OS);

async function sensorAccess(
  sensor: typeof Accelerometer | typeof Gyroscope,
  request = false,
): Promise<SensorAccess> {
  try {
    const available = await sensor.isAvailableAsync();
    let permission = await sensor.getPermissionsAsync();
    if (request && available && permission.status !== 'granted' && permission.canAskAgain)
      permission = await sensor.requestPermissionsAsync();
    return { available, permission: permission.status };
  } catch {
    return { available: false, permission: null };
  }
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function usePinchSession() {
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [sensor, setSensor] = useState<'checking' | 'available' | 'unavailable'>(
    supportsLive ? 'checking' : 'unavailable',
  );
  const [gyroAccess, setGyroAccess] = useState<SensorAccess>({ available: null, permission: null });
  const [file, setFile] = useState<SavedFile | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const controller = useRef<DampingController | null>(null);
  const sessionRef = useRef<DampingSession | null>(null);
  const mounted = useRef(false);
  const operation = useRef(false);
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTest = useCallback(() => {
    const wasTesting = testTimer.current !== null;
    if (testTimer.current) clearTimeout(testTimer.current);
    testTimer.current = null;
    try {
      if (wasTesting) stopContinuousVibration();
    } catch {
      /* The session controller also attempts cancellation. */
    }
    if (mounted.current) setTesting(false);
  }, []);

  const persist = useCallback(async (session: DampingSession) => {
    if (mounted.current) {
      setBusy(true);
      setFile(null);
      setSaveError(null);
    }
    operation.current = true;
    sessionRef.current = session;
    try {
      const saved = await saveSession(session);
      if (mounted.current) setFile(saved);
    } catch (error) {
      if (mounted.current) setSaveError(errorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) {
        setBusy(false);
        setSnapshot((current) => ({ ...current, stage: 'result', session }));
        controller.current?.settle(session);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const instance = new DampingController(
      {
        now: () => performance.now(),
        utcNow: () => new Date().toISOString(),
        every: (callback, ms) => {
          const timer = setInterval(callback, ms);
          return () => clearInterval(timer);
        },
        subscribe: (sensor, callback, interval) => {
          const source = sensor === 'accelerometer' ? Accelerometer : Gyroscope;
          source.setUpdateInterval(interval);
          const subscription = source.addListener(callback);
          return () => subscription.remove();
        },
        vibrate: (duration) => {
          if (typeof duration !== 'number')
            throw new Error('연속 진동에는 재생 시간이 필요합니다.');
          startContinuousVibration(duration);
        },
        cancelVibration: stopContinuousVibration,
        scheduleHaptics: scheduleContinuousVibration,
        subscribeHaptics: subscribeContinuousVibration,
        onUpdate: (next) => {
          if (mounted.current) setSnapshot(next);
        },
        onFinish: (session) => {
          void persist(session);
        },
      },
      protocol,
    );
    controller.current = instance;
    if (supportsLive) {
      void Promise.all([sensorAccess(Accelerometer), sensorAccess(Gyroscope)]).then(
        ([accel, gyro]) => {
          if (!mounted.current) return;
          setSensor(accel.available ? 'available' : 'unavailable');
          setGyroAccess(gyro);
        },
      );
    }
    const stateListener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancelTest();
        instance.stop('aborted', `app_state:${state}`);
      }
    });
    const backListener = BackHandler.addEventListener('hardwareBackPress', () => {
      const stage = instance.getSnapshot().stage;
      if (stage === 'recording' || stage === 'countdown') {
        instance.stop('aborted', 'android_back');
        return true;
      }
      return false;
    });
    return () => {
      mounted.current = false;
      stateListener.remove();
      backListener.remove();
      cancelTest();
      instance.dispose();
    };
  }, [cancelTest, persist]);

  useFocusEffect(
    useCallback(
      () => () => {
        cancelTest();
        controller.current?.stop('aborted', 'screen_leave');
      },
      [cancelTest],
    ),
  );

  const active = snapshot.stage === 'countdown' || snapshot.stage === 'recording';
  useEffect(() => {
    if (!active) return;
    let released = false;
    const tag = `pinch-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    void activateKeepAwakeAsync(tag)
      .then(() => {
        if (released) void deactivateKeepAwake(tag).catch(() => {});
      })
      .catch(() => {
        if (mounted.current)
          setActionError(
            '화면 켜짐을 유지하지 못했습니다. 측정 중 화면이 꺼지지 않도록 해 주세요.',
          );
      });
    return () => {
      released = true;
      void deactivateKeepAwake(tag).catch(() => {});
    };
  }, [active]);

  const start = async (environment: Environment, device: string) => {
    if (
      !supportsLive ||
      sensor !== 'available' ||
      testing ||
      operation.current ||
      snapshot.stage !== 'ready'
    )
      return;
    operation.current = true;
    setBusy(true);
    setActionError(null);
    setSaveError(null);
    setFile(null);
    try {
      const [accel, gyro] = await Promise.all([
        sensorAccess(Accelerometer, true),
        sensorAccess(Gyroscope, true),
      ]);
      if (!mounted.current) return;
      setGyroAccess(gyro);
      if (AppState.currentState !== 'active')
        throw new Error('앱을 화면에 연 상태에서 다시 시작해 주세요.');
      if (!accel.available || accel.permission !== 'granted')
        throw new Error('가속도계 접근 권한을 확인해 주세요.');
      prepareContinuousVibration();
      controller.current?.start({
        id: `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        data_origin: 'live',
        device: {
          model: device || null,
          os: Platform.OS,
          os_version: String(Platform.Version),
          runtime: isRunningInExpoGo() ? 'expo_go' : __DEV__ ? 'development_build' : 'standalone',
          app_version: Constants.expoConfig?.version ?? null,
          expo_version: Constants.expoConfig?.sdkVersion ?? null,
          sensors: { accelerometer: accel, gyroscope: gyro },
        },
        setup: {
          ...environment,
          hand: 'right',
          pinch_type: 'thumb_index',
          orientation: 'screen_up_top_away',
          contact_points: 'right_thumb_left_index_midpoints',
        },
      });
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const testVibration = () => {
    if (!supportsLive || snapshot.stage !== 'ready' || testTimer.current || operation.current)
      return;
    setActionError(null);
    try {
      prepareContinuousVibration();
      startContinuousVibration(800, protocol.haptic_intensity, protocol.haptic_sharpness);
      setTesting(true);
      testTimer.current = setTimeout(cancelTest, 800);
    } catch (error) {
      try {
        stopContinuousVibration();
      } catch {
        /* Report the original test failure. */
      }
      setActionError(errorMessage(error));
    }
  };

  const showReplay = () => {
    if (snapshot.stage !== 'ready' || operation.current) return;
    cancelTest();
    setActionError(null);
    const session = createDampingExample();
    setSnapshot({
      stage: 'saving',
      elapsed_ms: session.session.actual_duration_ms,
      countdown: 0,
      session,
    });
    void persist(session);
  };

  const importReplay = async () => {
    if (snapshot.stage !== 'ready' || operation.current) return;
    operation.current = true;
    cancelTest();
    setBusy(true);
    setActionError(null);
    try {
      const json = await pickSessionJson();
      if (json === null || !mounted.current) return;
      const session = importDamping(JSON.parse(json));
      setSnapshot({
        stage: 'saving',
        elapsed_ms: session.session.actual_duration_ms,
        countdown: 0,
        session,
      });
      await persist(session);
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const updateObservation = (field: 'phone_moved' | 'extra_contact', value: boolean) => {
    if (!sessionRef.current || operation.current) return;
    const updated = reanalyzeDamping({
      ...sessionRef.current,
      observations: { ...sessionRef.current.observations, [field]: value },
    });
    setSnapshot((current) => ({ ...current, session: updated }));
    void persist(updated);
  };

  const share = async () => {
    if (!file || !sessionRef.current || operation.current) return;
    operation.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await shareSession(file, sessionRef.current);
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const reset = () => {
    if (operation.current || !file) return;
    cancelTest();
    controller.current?.reset();
    sessionRef.current = null;
    setSnapshot(INITIAL);
    setFile(null);
    setSaveError(null);
    setActionError(null);
  };

  return {
    ...snapshot,
    supportsLive,
    sensor,
    gyroAccess,
    file,
    saveError,
    actionError,
    busy,
    testing,
    start,
    testVibration,
    showReplay,
    importReplay,
    updateObservation,
    share,
    reset,
    stop: () => controller.current?.stop(),
    retrySave: () => {
      if (sessionRef.current && !operation.current) void persist(sessionRef.current);
    },
  };
}
