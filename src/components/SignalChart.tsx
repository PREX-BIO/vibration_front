import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PROTOCOL } from '@/config/protocol';
import type { ThemeColors } from '@/constants/theme';
import { chartSegments, chartValue, type ChartField } from '@/lib/chart';
import type { Feature } from '@/types/session';

export function SignalChart({
  features,
  colors,
  metric,
  elapsed = 35000,
  recording = false,
}: {
  features: Feature[];
  colors: ThemeColors;
  metric: ChartField;
  elapsed?: number;
  recording?: boolean;
}) {
  const ratio = metric === 'ratio';
  const force = metric === 'force_kgf';
  const values = features.map((f) => chartValue(f, metric)).filter((v): v is number => v !== null);
  const maximum = force
    ? Math.max(15, ...values)
    : Math.max(ratio ? 1.4 : 0.005, ...values.map((v) => v * 1.15));
  const label = force
    ? '집게힘 · 데모값 (kgf)'
    : ratio
      ? '기준 대비 센서 변동 (배)'
      : '센서 변동 (g RMS)';
  const left = 45,
    right = 349,
    top = 26,
    bottom = 168;
  const x = (ms: number) => left + (ms / PROTOCOL.duration_ms) * (right - left);
  const y = (value: number) => bottom - (value / maximum) * (bottom - top);
  const paths = chartSegments(features, metric, x, y, PROTOCOL.hop_ms);
  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>{label}</Text>
        <Text style={[styles.label, { color: colors.secondaryText }]}>음영: 집기 구간</Text>
      </View>
      <Svg
        width="100%"
        height={218}
        viewBox="0 0 366 208"
        accessibilityRole="image"
        accessibilityLabel={`35초 ${label} 그래프. 세 집기 구간은 음영으로 표시됩니다. 무효한 구간은 선을 끊습니다.`}
      >
        {PROTOCOL.phases
          .filter((p) => p.id.startsWith('pinch_'))
          .map((p) => (
            <Rect
              key={p.id}
              x={x(p.start_ms)}
              y={top}
              width={x(p.end_ms) - x(p.start_ms)}
              height={bottom - top}
              fill={colors.accentSoft}
            />
          ))}
        {[0, maximum / 2, maximum].map((value) => (
          <ViewTick
            key={value}
            value={value}
            y={y(value)}
            left={left}
            right={right}
            colors={colors}
            digits={force ? 1 : ratio ? 2 : 4}
          />
        ))}
        {ratio && (
          <>
            <Line
              x1={left}
              x2={right}
              y1={y(1)}
              y2={y(1)}
              stroke={colors.secondaryText}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <SvgText
              x={right - 3}
              y={y(1) - 5}
              textAnchor="end"
              fill={colors.secondaryText}
              fontSize={10}
            >
              기준 1.00
            </SvgText>
          </>
        )}
        {paths.map((path, i) => (
          <Path
            key={i}
            d={path}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {elapsed < 35000 && (
          <Line
            x1={x(elapsed)}
            x2={x(elapsed)}
            y1={top}
            y2={bottom}
            stroke={colors.secondaryText}
            strokeDasharray="2 4"
          />
        )}
        {[0, 9, 17, 25, 35].map((s) => (
          <SvgText
            key={s}
            x={x(s * 1000)}
            y={191}
            textAnchor="middle"
            fill={colors.secondaryText}
            fontSize={11}
          >
            {s}초
          </SvgText>
        ))}
      </Svg>
      {!values.length && (
        <Text style={[styles.empty, { color: colors.secondaryText }]}>
          {recording ? '표시할 유효 신호를 기다리고 있습니다.' : '표시할 유효값이 없습니다.'}
        </Text>
      )}
    </View>
  );
}

function ViewTick({
  value,
  y,
  left,
  right,
  colors,
  digits,
}: {
  value: number;
  y: number;
  left: number;
  right: number;
  colors: ThemeColors;
  digits: number;
}) {
  return (
    <>
      <Line x1={left} x2={right} y1={y} y2={y} stroke={colors.border} strokeWidth={0.8} />
      <SvgText x={left - 7} y={y + 4} textAnchor="end" fill={colors.secondaryText} fontSize={10}>
        {value.toFixed(digits)}
      </SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  label: { fontSize: 11 },
  empty: { fontSize: 12, textAlign: 'center', paddingBottom: 8 },
});
