import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { phaseLabel, vibrationInterval } from '@/config/dampingProtocol';
import type { ThemeColors } from '@/constants/theme';
import { nearestFrame, plotSegments, type PlotPoint } from '@/lib/dampingChart';
import type { DampingSession, FeatureFrame, SensorName } from '@/types/damping';

export function TimePlot({
  title,
  points,
  session,
  colors,
  cursor,
  reference,
  onSelect,
  maxGap = 100,
  raw = false,
  lineColor = colors.primary,
}: {
  title: string;
  points: PlotPoint[];
  session: DampingSession;
  colors: ThemeColors;
  cursor?: FeatureFrame;
  reference?: number | null;
  onSelect?: (ms: number) => void;
  maxGap?: number;
  raw?: boolean;
  lineColor?: string;
}) {
  const [width, setWidth] = useState(342);
  const duration = Math.max(
    session.session.planned_duration_ms,
    session.session.actual_duration_ms,
    1,
  );
  const left = 52,
    right = 350,
    top = 14,
    bottom = 138;
  const x = (t: number) => left + (t / duration) * (right - left);
  const values = points.flatMap((p) =>
    p.value !== null && Number.isFinite(p.value) ? [p.value] : [],
  );
  if (reference != null) values.push(reference);
  let low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  const span = high - low || 1;
  if (low < 0) low -= span * 0.08;
  high += span * 0.08;
  const y = (n: number) => bottom - ((n - low) / (high - low)) * (bottom - top);
  const segments = plotSegments(points, x, y, maxGap);
  const select = (locationX: number) =>
    onSelect?.(
      Math.max(
        0,
        Math.min(duration, (((locationX / width) * 366 - left) / (right - left)) * duration),
      ),
    );
  return (
    <View style={[styles.plot, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: lineColor }]}>{title}</Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !!onSelect}
        onMoveShouldSetResponder={() => !!onSelect}
        onResponderGrant={(e) => select(e.nativeEvent.locationX)}
        onResponderMove={(e) => select(e.nativeEvent.locationX)}
        accessibilityRole={onSelect ? 'adjustable' : 'image'}
        accessibilityLabel={`${title}. ${onSelect ? '누르거나 드래그해 같은 시간창을 선택합니다.' : '시간에 따른 관측값.'}`}
        accessibilityActions={
          onSelect
            ? [
                { name: 'increment', label: '다음 창' },
                { name: 'decrement', label: '이전 창' },
              ]
            : undefined
        }
        onAccessibilityAction={(e) =>
          onSelect?.(
            (cursor?.window_end_ms ?? 0) + (e.nativeEvent.actionName === 'increment' ? 100 : -100),
          )
        }
      >
        <Svg width="100%" height={178} viewBox="0 0 366 170" pointerEvents="none">
          {session.phases
            .filter((p) => p.actual_start_ms !== null)
            .map((p) => (
              <Rect
                key={p.phase_id}
                x={x(p.actual_start_ms!)}
                y={top}
                width={Math.max(
                  0,
                  x(p.actual_end_ms ?? session.session.actual_duration_ms) - x(p.actual_start_ms!),
                )}
                height={bottom - top}
                fill={
                  p.target_level === 'off'
                    ? colors.surfaceMuted
                    : p.target_level === 'contact'
                      ? colors.surface
                      : colors.accentSoft
                }
                opacity={0.6}
              />
            ))}
          {session.phases
            .filter((p) => p.actual_start_ms !== null)
            .map((p) => (
              <Line
                key={`b-${p.phase_id}`}
                x1={x(p.actual_start_ms!)}
                x2={x(p.actual_start_ms!)}
                y1={top}
                y2={bottom}
                stroke={colors.border}
                strokeWidth={0.6}
              />
            ))}
          {[low, (low + high) / 2, high].map((tick, i) => (
            <ViewTick key={i} value={tick} x={left} y={y(tick)} colors={colors} />
          ))}
          {low < 0 && (
            <SvgText
              x={left - 5}
              y={y(0) + 3}
              fill={colors.secondaryText}
              fontSize={11}
              textAnchor="end"
            >
              0
            </SvgText>
          )}
          {low <= 0 && high >= 0 && (
            <Line
              x1={left}
              x2={right}
              y1={y(0)}
              y2={y(0)}
              stroke={colors.secondaryText}
              strokeWidth={0.8}
            />
          )}
          {reference != null && (
            <>
              <Line
                x1={left}
                x2={right}
                y1={y(reference)}
                y2={y(reference)}
                stroke={colors.danger}
                strokeDasharray="4 3"
              />
              <SvgText
                x={right}
                y={Math.max(12, y(reference) - 4)}
                fill={colors.danger}
                textAnchor="end"
                fontSize={11}
              >
                고정 기준 A₀
              </SvgText>
            </>
          )}
          {cursor && (
            <Rect
              x={x(cursor.window_start_ms)}
              y={top}
              width={x(cursor.window_end_ms) - x(cursor.window_start_ms)}
              height={bottom - top}
              fill={colors.primary}
              opacity={0.1}
            />
          )}
          {segments.map((segment, i) => (
            <Path
              key={i}
              d={segment.path}
              fill="none"
              stroke={segment.context === 'motor_off' && !raw ? colors.secondaryText : lineColor}
              strokeWidth={2}
              strokeDasharray={
                !raw && ['phase_transition', 'motor_settle'].includes(segment.context)
                  ? '4 3'
                  : undefined
              }
            />
          ))}
          <Line
            x1={x(cursor?.window_end_ms ?? session.session.actual_duration_ms)}
            x2={x(cursor?.window_end_ms ?? session.session.actual_duration_ms)}
            y1={top}
            y2={bottom}
            stroke={colors.danger}
            strokeWidth={1}
          />
          {[0, duration / 4, duration / 2, (duration * 3) / 4, duration].map((t) => (
            <SvgText
              key={t}
              x={x(t)}
              y={159}
              fill={colors.secondaryText}
              fontSize={11}
              textAnchor="middle"
            >
              {(t / 1000).toFixed(t % 1000 ? 1 : 0)}초
            </SvgText>
          ))}
        </Svg>
      </View>
      {!values.length && (
        <Text style={[styles.small, { color: colors.secondaryText }]}>
          유효값 없음 · 누락은 선을 끊어 표시
        </Text>
      )}
    </View>
  );
}
function ViewTick({
  value,
  x,
  y,
  colors,
}: {
  value: number;
  x: number;
  y: number;
  colors: ThemeColors;
}) {
  return (
    <>
      <Line x1={x} x2={350} y1={y} y2={y} stroke={colors.border} strokeWidth={0.6} />
      <SvgText x={x - 5} y={y + 3} fill={colors.secondaryText} fontSize={11} textAnchor="end">
        {value === 0 ? '0' : Number(value.toPrecision(3)).toString()}
      </SvgText>
    </>
  );
}

export function DampingCharts({
  session,
  colors,
  cursor,
  onSelect,
  detail,
}: {
  session: DampingSession;
  colors: ThemeColors;
  cursor?: FeatureFrame;
  onSelect?: (id: number) => void;
  detail?: FeatureFrame[];
}) {
  const select = onSelect
    ? (time: number) => {
        const frame = nearestFrame(session.features, time);
        if (frame) onSelect(frame.frame_id);
      }
    : undefined;
  const points = (read: (f: FeatureFrame) => number | null, frames = session.features) =>
    frames.map((f) => ({ t: f.window_end_ms, value: read(f), context: f.context }));
  return (
    <View style={styles.group}>
      <TimePlot
        title="기준 대비 진동 신호 감소율 (%)"
        session={session}
        colors={colors}
        cursor={cursor}
        onSelect={select}
        points={points((f) => f.accel.reduction_pct)}
      />
      <TimePlot
        title="가속도 변동 A · mg (가속도 단위)"
        lineColor={colors.acceleration}
        session={session}
        colors={colors}
        cursor={cursor}
        onSelect={select}
        reference={
          session.baseline.accel_ac_rms_g === null ? null : session.baseline.accel_ac_rms_g * 1000
        }
        points={points((f) => (f.accel.ac_rms_g === null ? null : f.accel.ac_rms_g * 1000))}
      />
      <TimePlot
        title="각속도 크기 Ω · rad/s"
        lineColor={colors.angularVelocity}
        session={session}
        colors={colors}
        cursor={cursor}
        onSelect={select}
        points={points((f) => f.gyro.rms_magnitude_rad_s)}
      />
      <CommandTimeline session={session} colors={colors} />
      <Text style={[styles.small, { color: colors.secondaryText }]}>
        회색: 진동 꺼짐 · 점선: 준비/전환 · 음영: 집기 · 누락: 선 끊김
      </Text>
      {detail && (
        <TimePlot
          title="상세 0.5초 가속도 AC RMS · mg"
          lineColor={colors.acceleration}
          session={session}
          colors={colors}
          cursor={cursor}
          onSelect={select}
          points={points(
            (f) => (f.accel.ac_rms_g === null ? null : f.accel.ac_rms_g * 1000),
            detail,
          )}
        />
      )}
    </View>
  );
}
function CommandTimeline({ session, colors }: { session: DampingSession; colors: ThemeColors }) {
  const duration = Math.max(
    session.session.planned_duration_ms,
    session.session.actual_duration_ms,
  );
  const x = (n: number) => 52 + (n / duration) * 298;
  const { on, off } = vibrationInterval(session);
  const interruptions = (session.vibration.native_events ?? []).filter((e) =>
    ['engine_stopped', 'engine_reset', 'playback_error'].includes(e.type),
  );
  return (
    <View>
      <Text style={[styles.small, { color: colors.secondaryText }]}>
        동작 / 연속 진동 예약 · 엔진 상태
      </Text>
      <Svg width="100%" height={55} viewBox="0 0 366 55">
        {session.phases
          .filter((p) => p.actual_start_ms !== null)
          .map((p, i) => (
            <Rect
              key={p.phase_id}
              x={x(p.actual_start_ms!)}
              y={4}
              width={Math.max(
                0,
                x(p.actual_end_ms ?? session.session.actual_duration_ms) - x(p.actual_start_ms!),
              )}
              height={12}
              fill={i % 2 ? colors.primary : colors.border}
            />
          ))}
        <Rect x={52} y={24} width={298} height={9} fill={colors.border} />
        {on !== null && session.vibration.start_succeeded && (
          <Rect
            x={x(on)}
            y={24}
            width={Math.max(
              0,
              x(Math.min(off ?? session.session.actual_duration_ms, duration)) - x(on),
            )}
            height={9}
            fill={colors.primary}
          />
        )}
        {interruptions.map((e, i) => (
          <Line
            key={`engine-${i}`}
            x1={x(e.received_ms)}
            x2={x(e.received_ms)}
            y1={20}
            y2={37}
            stroke={colors.danger}
            strokeWidth={2}
          />
        ))}
        <SvgText x={52} y={49} fontSize={10} fill={colors.secondaryText}>
          예약·명령 시간 · 물리적 모터 시작은 미검증
        </SvgText>
      </Svg>
      {interruptions.length > 0 && (
        <Text style={[styles.small, { color: colors.danger }]}>
          엔진 중단·오류 통지 수신:{' '}
          {interruptions.map((e) => `${(e.received_ms / 1000).toFixed(1)}초`).join(', ')}
        </Text>
      )}
      <Text style={[styles.small, { color: colors.secondaryText }]}>
        {session.phases
          .filter((p) => p.actual_start_ms !== null)
          .map((p) => `${(p.actual_start_ms! / 1000).toFixed(1)}초 ${phaseLabel(p)}`)
          .join(' · ')}
      </Text>
    </View>
  );
}

export function RawSensorPlots({
  session,
  colors,
  cursor,
  onSelect,
}: {
  session: DampingSession;
  colors: ThemeColors;
  cursor?: FeatureFrame;
  onSelect?: (id: number) => void;
}) {
  const series = useMemo(
    () =>
      (['accelerometer', 'gyroscope'] as SensorName[]).flatMap((sensor) =>
        (['x', 'y', 'z'] as const).map((axis) => {
          // Only rendering is thinned. Invalid samples and gap boundaries are retained; raw storage is untouched.
          const raw = session.raw[sensor],
            stride = Math.max(1, Math.floor(raw.length / 1400));
          const points = raw
            .filter(
              (s, i) =>
                i % stride === 0 ||
                !s.valid ||
                (i > 0 && s.t_receive_ms - raw[i - 1].t_receive_ms > 250),
            )
            .map((s) => ({
              t: s.t_receive_ms,
              value: s.valid ? s[axis] : null,
              context: 'steady' as const,
            }));
          return {
            title: `${sensor === 'accelerometer' ? '가속도' : '각속도'} 원본 ${axis} · ${sensor === 'accelerometer' ? 'g' : 'rad/s'}`,
            points,
            maxGap: 250,
          };
        }),
      ),
    [session],
  );
  return (
    <View style={styles.group}>
      {series.map((series) => (
        <TimePlot
          key={series.title}
          {...series}
          lineColor={
            series.title.startsWith('가속도') ? colors.acceleration : colors.angularVelocity
          }
          session={session}
          colors={colors}
          cursor={cursor}
          raw
          onSelect={
            onSelect
              ? (time) => {
                  const frame = nearestFrame(session.features, time);
                  if (frame) onSelect(frame.frame_id);
                }
              : undefined
          }
        />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 16 },
  plot: { gap: 8, padding: 12, borderWidth: 1, borderRadius: 12 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 20 },
});
