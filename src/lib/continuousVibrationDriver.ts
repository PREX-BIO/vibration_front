import type { HapticSchedule, HapticReceipt, HapticEvent } from '../types/damping';
import { DAMPING_PROTOCOL } from '../config/dampingProtocol';
import { ANDROID_WAVEFORM_SEGMENT_MS } from './androidVibration';

export type IOSContinuousVibration = {
  apiVersion: number;
  isSupported(): boolean;
  prepare(): void;
  schedule(
    id: string,
    delayMs: number,
    durationMs: number,
    intensity: number,
    sharpness: number,
  ): HapticReceipt;
  addListener(name: 'onHapticEvent', callback: (event: HapticEvent) => void): { remove(): void };
  stop(): void;
};

type AndroidVibration = {
  vibrate(pattern: number | number[], repeat: boolean): void;
  cancel(): void;
};

/** Keep the iOS-only native module optional so Android works in Expo Go as well. */
export function createContinuousVibrationDriver(
  platform: string,
  android: AndroidVibration,
  ios: IOSContinuousVibration | null,
) {
  function requireIOS() {
    if (platform !== 'ios') throw new Error('실제 iPhone 또는 Android 휴대폰에서 실행해 주세요.');
    if (!ios)
      throw new Error(
        'iOS 연속 진동은 Expo Go에서 지원하지 않습니다. Core Haptics 모듈을 포함한 iPhone 앱을 빌드해 실행해 주세요.',
      );
    if (!ios.isSupported()) throw new Error('이 기기는 연속 진동을 지원하지 않습니다.');
    if (ios.apiVersion !== 2)
      throw new Error('31초 측정용 네이티브 모듈로 Xcode에서 앱을 다시 빌드해 주세요.');
    return ios;
  }

  return {
    prepare() {
      if (platform === 'android') return;
      requireIOS().prepare();
    },
    start(
      durationMs: number,
      intensity = DAMPING_PROTOCOL.haptic_intensity!,
      sharpness = DAMPING_PROTOCOL.haptic_sharpness!,
    ) {
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 25000)
        throw new Error('연속 진동 시간은 0초 초과, 25초 이하여야 합니다.');
      if (platform === 'android') {
        // Android's native API uses integer milliseconds; never truncate a late request to 0.
        android.vibrate(Math.ceil(durationMs), false);
      } else {
        requireIOS().schedule(`test-${Date.now()}`, 0, durationMs, intensity, sharpness);
      }
    },
    startWaveform(pattern: number[], repeat: boolean) {
      if (platform !== 'android') throw new Error('파형 시험은 Android에서만 사용할 수 있습니다.');
      if (
        repeat !== false ||
        pattern.length < 2 ||
        pattern.length > 8 ||
        pattern.length % 2 !== 0 ||
        !pattern.every(
          (ms, index) =>
            Number.isInteger(ms) &&
            (index % 2 === 0 ? ms === 0 : ms > 0 && ms <= ANDROID_WAVEFORM_SEGMENT_MS),
        ) ||
        pattern.reduce((sum, ms) => sum + ms, 0) > 25000
      )
        throw new Error('Invalid Android waveform');
      // Live measurements only use finite native waveforms.
      android.vibrate([...pattern], false);
    },
    schedule(request: HapticSchedule) {
      const { playback_id, delay_ms, duration_ms, intensity, sharpness } = request;
      if (
        ![delay_ms, duration_ms, intensity, sharpness].every(Number.isFinite) ||
        delay_ms < 0 ||
        duration_ms <= 0 ||
        duration_ms > 25000 ||
        intensity < 0 ||
        intensity > 1 ||
        sharpness < 0 ||
        sharpness > 1
      )
        throw new Error('Invalid continuous haptic schedule');
      return requireIOS().schedule(playback_id, delay_ms, duration_ms, intensity, sharpness);
    },
    subscribe(callback: (event: HapticEvent) => void) {
      const subscription = requireIOS().addListener('onHapticEvent', callback);
      return () => subscription.remove();
    },
    stop() {
      if (platform === 'android') android.cancel();
      else if (platform === 'ios') ios?.stop();
    },
  };
}
