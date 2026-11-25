import type { FeatureFrame } from '../types/damping';
export type PlotPoint = { t: number; value: number | null; context: FeatureFrame['context'] };
export function nearestFrame(frames: FeatureFrame[], ms: number): FeatureFrame | undefined {
  return frames.reduce<FeatureFrame | undefined>(
    (best, f) =>
      !best || Math.abs(f.window_end_ms - ms) < Math.abs(best.window_end_ms - ms) ? f : best,
    undefined,
  );
}
export function plotSegments(
  points: PlotPoint[],
  x: (n: number) => number,
  y: (n: number) => number,
  maxGap: number,
) {
  const segments: { path: string; context: FeatureFrame['context'] }[] = [];
  let path = '',
    context: FeatureFrame['context'] = 'steady',
    previous: PlotPoint | null = null;
  const flush = () => {
    if (path) segments.push({ path, context });
    path = '';
  };
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value)) {
      flush();
      previous = null;
      continue;
    }
    if (previous && (point.t - previous.t > maxGap + 1e-6 || point.context !== context)) {
      flush();
      // A style boundary is continuous data; missing data is never bridged.
      if (point.t - previous.t <= maxGap + 1e-6)
        path = `M${x(previous.t).toFixed(2)} ${y(previous.value!).toFixed(2)}`;
    }
    context = point.context;
    path += `${path ? ' L' : 'M'}${x(point.t).toFixed(2)} ${y(point.value).toFixed(2)}`;
    previous = point;
  }
  flush();
  return segments;
}
