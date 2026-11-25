import { requireOptionalNativeModule } from 'expo';
import { Platform, Vibration } from 'react-native';

import {
  createContinuousVibrationDriver,
  type IOSContinuousVibration,
} from './continuousVibrationDriver';

const driver = createContinuousVibrationDriver(
  Platform.OS,
  Vibration,
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<IOSContinuousVibration>('ContinuousVibration')
    : null,
);

export const prepareContinuousVibration = driver.prepare;
export const startContinuousVibration = driver.start;
export const stopContinuousVibration = driver.stop;
export const scheduleContinuousVibration = driver.schedule;
export const subscribeContinuousVibration = driver.subscribe;
