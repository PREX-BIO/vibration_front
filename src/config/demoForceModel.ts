import type { ForceModel } from '../types/force';

/** Fixed demonstration parameters supplied by the v2 spec; not trained coefficients. */
export const DEMO_FORCE_MODEL: ForceModel = {
  model_id: 'demo_ac_ratio_linear_v1',
  kind: 'demo',
  training_status: 'placeholder',
  feature_schema_id: 'accel_rms_ratio_v1',
  compatible_protocols: ['expo_desk_pinch_ios_pulsed_v1'],
  feature_order: ['accel_rms_ratio'],
  mean: [1.0],
  scale: [1.0],
  coefficients: [5.0],
  intercept: 1.0,
  output_unit: 'kgf',
  output_min: 0.0,
  output_max: 15.0,
};
