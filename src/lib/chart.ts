import type { Feature } from '../types/session';

export type ChartField = 'ratio' | 'rms_g' | 'force_kgf';

export function chartValue(feature: Feature, field: ChartField): number | null {
  if (!feature.valid) return null;
  const value =
    field === 'force_kgf'
      ? feature.force_estimate.valid
        ? feature.force_estimate.value_kgf
        : null
      : feature[field];
  return value !== null && Number.isFinite(value) ? value : null;
}

export function chartSegments(
  features: Feature[],
  field: ChartField,
  x: (time: number) => number,
  y: (value: number) => number,
  hop: number,
): string[] {
  const paths: string[] = [];
  let current = '';
  let previous = -Infinity;
  for (const feature of features) {
    const value = chartValue(feature, field);
    if (value === null) {
      if (current) paths.push(current);
      current = '';
      previous = -Infinity;
      continue;
    }
    if (feature.end_ms - previous > hop && current) {
      paths.push(current);
      current = '';
    }
    current += `${current ? ' L' : 'M'}${x(feature.end_ms).toFixed(2)} ${y(value).toFixed(2)}`;
    previous = feature.end_ms;
  }
  if (current) paths.push(current);
  return paths;
}
