import type { ForceEstimate, ForceModel } from '../types/force';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function validateForceModel(value: unknown): value is ForceModel {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.model_id === 'string' &&
    m.model_id.trim().length > 0 &&
    m.kind === 'demo' &&
    m.training_status === 'placeholder' &&
    m.feature_schema_id === 'accel_rms_ratio_v1' &&
    m.output_unit === 'kgf' &&
    Array.isArray(m.compatible_protocols) &&
    m.compatible_protocols.length > 0 &&
    m.compatible_protocols.every((p) => typeof p === 'string' && p.trim().length > 0) &&
    Array.isArray(m.feature_order) &&
    m.feature_order.length === 1 &&
    m.feature_order[0] === 'accel_rms_ratio' &&
    [m.mean, m.scale, m.coefficients].every(
      (v) => Array.isArray(v) && v.length === 1 && v.every(finite),
    ) &&
    (m.scale as number[]).every((s) => s > 0) &&
    finite(m.intercept) &&
    finite(m.output_min) &&
    finite(m.output_max) &&
    m.output_min <= m.output_max
  );
}

/** Copy and freeze at Start; subsequent configuration edits cannot change this session. */
export function snapshotForceModel(value: unknown): ForceModel {
  if (!validateForceModel(value)) throw new Error('데모 모델 설정이 올바르지 않습니다.');
  return Object.freeze({
    ...value,
    compatible_protocols: Object.freeze([...value.compatible_protocols]),
    feature_order: Object.freeze([...value.feature_order]) as readonly ['accel_rms_ratio'],
    mean: Object.freeze([...value.mean]),
    scale: Object.freeze([...value.scale]),
    coefficients: Object.freeze([...value.coefficients]),
  });
}

export function predictForce(
  features: { accel_rms_ratio?: number | null },
  model: ForceModel,
  context: { protocol_version: string; feature_schema_id?: string; reasons?: string[] },
): ForceEstimate {
  const result: ForceEstimate = {
    value_kgf: null,
    raw_kgf: null,
    kind: 'demo',
    model_id: typeof model?.model_id === 'string' ? model.model_id : 'invalid_model',
    clamped: false,
    valid: false,
    reasons: [],
  };
  if (!validateForceModel(model)) return { ...result, reasons: ['invalid_model'] };
  const reasons = [...(context.reasons ?? [])];
  if (!model.compatible_protocols.includes(context.protocol_version))
    reasons.push('incompatible_protocol');
  if ((context.feature_schema_id ?? 'accel_rms_ratio_v1') !== model.feature_schema_id)
    reasons.push('incompatible_feature_schema');
  const ratio = features.accel_rms_ratio;
  if (!finite(ratio)) reasons.push('invalid_feature');
  if (reasons.length) return { ...result, reasons: [...new Set(reasons)] };
  const raw = model.intercept + model.coefficients[0] * ((ratio! - model.mean[0]) / model.scale[0]);
  if (!finite(raw)) return { ...result, reasons: ['nonfinite_prediction'] };
  const value = Math.min(model.output_max, Math.max(model.output_min, raw));
  return { ...result, value_kgf: value, raw_kgf: raw, clamped: value !== raw, valid: true };
}
