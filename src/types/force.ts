export type ForceModel = {
  model_id: string;
  kind: 'demo';
  training_status: 'placeholder';
  feature_schema_id: 'accel_rms_ratio_v1';
  compatible_protocols: readonly string[];
  feature_order: readonly ['accel_rms_ratio'];
  mean: readonly number[];
  scale: readonly number[];
  coefficients: readonly number[];
  intercept: number;
  output_unit: 'kgf';
  output_min: number;
  output_max: number;
};

export type ForceEstimate = {
  value_kgf: number | null;
  raw_kgf: number | null;
  kind: 'demo';
  model_id: string;
  clamped: boolean;
  valid: boolean;
  reasons: string[];
};

export type SessionForceEstimate = Pick<
  ForceEstimate,
  'value_kgf' | 'kind' | 'model_id' | 'valid' | 'reasons'
> & { aggregation: 'median_of_three_trial_estimates' };
