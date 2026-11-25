import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/ActionButton';
import { ContactGuide } from '@/components/ContactGuide';
import { MeasurementSetupForm, SetupChoices } from '@/components/MeasurementSetupForm';
import { DampingCharts, RawSensorPlots } from '@/components/DampingCharts';
import {
  DAMPING_PROTOCOL,
  phaseLabel,
  phaseSettle,
  recordingDuration,
  vibrationInterval,
} from '@/config/dampingProtocol';
import { Colors, type ThemeColors } from '@/constants/theme';
import { usePinchSession } from '@/hooks/usePinchSession';
import { detailFrames, phaseAtActual } from '@/lib/dampingSignal';
import type { DampingSession, FeatureFrame, SensorQuality } from '@/types/damping';
import {
  createMeasurementSetup,
  DEFAULT_MEASUREMENT_ENVIRONMENT,
  describeMeasurementSetup,
} from '@/lib/measurementSetup';

const fmt = (value: number | null | undefined, digits = 3) =>
  value == null ? '—' : Number(value.toPrecision(digits)).toString();
const percent = (v: number | null | undefined) => {
  if (v == null) return '—';
  const rounded = Number(v.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
};
const mg = (v: number | null | undefined) => (v == null ? '—' : fmt(v * 1000, 4));
const LABELS: Record<string, string> = {
  baseline_unavailable: '기준을 만들지 못함',
  zero_baseline: '기준이 0에 가까움',
  weak_motor_response: '진동 응답 구분이 약함',
  unstable_baseline: '기준 신호 변동 큼',
  manual_artifact: '사용자가 이동 또는 추가 접촉을 표시함',
  aborted: '부분 기록',
  vibration_start_failed: '진동 시작 요청 실패',
  vibration_renew_failed: '진동 재요청 실패',
  vibration_stop_failed: '진동 종료 요청 실패',
  insufficient_samples: '표본 부족',
  short_receive_span: '수신 범위 부족',
  invalid_axis: '비유한 센서값',
  invalid_sensor_timestamp: '센서 시각 누락·역순·중복',
  invalid_receive_time: '수신 시각 이상',
  sensor_gap: '센서 간격 초과',
  receive_gap: '수신 간격 초과',
  low_sample_rate: '센서 속도 부족',
  sensor_unavailable: '센서 사용 불가',
  insufficient_valid_windows: '유효 창 80% 미만',
  incomplete_phase: '미완료 구간',
  timing_mismatch: '진동·동작 안내 시간 불일치 · 구간 비교 제외',
};
const reasons = (values: string[]) => values.map((v) => LABELS[v] ?? v).join(' · ');
const CONTEXT = {
  motor_off: '진동 꺼짐',
  motor_settle: '진동 준비',
  phase_transition: '경계·힘 바꾸기 포함',
  steady: '안정 유지 구간',
};

export default function PinchDemoScreen() {
  const colors = Colors.light;
  const flow = usePinchSession();
  const [environment, setEnvironment] = useState(DEFAULT_MEASUREMENT_ENVIRONMENT);
  const [instructions, setInstructions] = useState(false);
  const [device, setDevice] = useState('');
  const [felt, setFelt] = useState<boolean | null>(null),
    [tested, setTested] = useState(false);
  const [details, setDetails] = useState(false),
    [shortWindow, setShortWindow] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { stage, session, elapsed_ms: elapsed } = flow;
  const protocol = session?.config ?? DAMPING_PROTOCOL;
  const duration = recordingDuration(protocol);
  const recording = stage === 'recording',
    result = stage === 'saving' || stage === 'result';
  const phase = session ? phaseAtActual(session.phases, elapsed - (result ? 1e-7 : 0)) : undefined;
  const latest = session?.features.at(-1);
  const defaultFrame =
    session?.features.find(
      (f) =>
        f.window_end_ms ===
        Math.min(
          session.phases.find((p) => p.target_level === 'low')?.planned_end_ms ??
            session.session.actual_duration_ms,
          session.session.actual_duration_ms,
        ),
    ) ?? latest;
  const selected = result
    ? (session?.features.find((f) => f.frame_id === selectedId) ?? defaultFrame)
    : latest && elapsed - latest.window_end_ms < 200
      ? latest
      : undefined;
  const smallFrames = useMemo(
    () => (session && result && shortWindow ? detailFrames(session) : undefined),
    [session, result, shortWindow],
  );
  const androidVibrationStatus =
    flow.androidVibrationPreference === 'waveform_once' ? '파형 1회 선택됨' : '기본 방식 선택됨';
  const title =
    stage === 'ready'
      ? '진동 신호 감소율'
      : stage === 'countdown'
        ? '자세를 잡아 주세요'
        : recording
          ? (phase?.cue ?? '그대로 유지')
          : session?.session.status === 'completed'
            ? '기록을 마쳤습니다'
            : '부분 기록을 보존했습니다';
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        key={stage === 'ready' ? 'ready' : result ? 'result' : 'active'}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.page}>
          <View style={styles.row}>
            <Text style={[styles.brand, { color: colors.text }]}>Vibration</Text>
            <Text
              style={[
                styles.badge,
                { color: colors.secondaryText, backgroundColor: colors.surfaceMuted },
              ]}
            >
              {session?.data_origin === 'synthetic_test'
                ? '합성 시험'
                : session?.data_origin === 'replay'
                  ? session.source_data_origin === 'synthetic_test'
                    ? '합성 기록 재생'
                    : '기록 재생'
                  : stage === 'ready'
                    ? '준비'
                    : '실측'}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
          {stage === 'ready' && (
            <>
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                집는 정도를 바꾸면 가속도 변동이 기준보다 얼마나 줄거나 늘어나는지 관찰합니다.
              </Text>
              <ContactGuide
                colors={colors}
                orientation={environment.orientation}
                surfaceType={environment.surface_type}
              />
              <View
                style={[
                  styles.protocolStrip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.protocolItem}>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>준비</Text>
                  <Text style={[styles.protocolValue, { color: colors.text }]}>
                    {DAMPING_PROTOCOL.countdown_ms / 1000}초
                  </Text>
                </View>
                <View
                  style={[
                    styles.protocolItem,
                    styles.protocolMiddle,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.small, { color: colors.secondaryText }]}>측정</Text>
                  <Text style={[styles.protocolValue, { color: colors.text }]}>
                    {recordingDuration(DAMPING_PROTOCOL) / 1000}초
                  </Text>
                </View>
                <View style={styles.protocolItem}>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>연속 진동</Text>
                  <Text style={[styles.protocolValue, { color: colors.primary }]}>
                    {DAMPING_PROTOCOL.vibration_start_ms / 1000}–
                    {DAMPING_PROTOCOL.vibration_end_ms / 1000}초
                  </Text>
                </View>
              </View>
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                {DAMPING_PROTOCOL.phases
                  .filter((p) => p.target_level !== 'off')
                  .map(phaseLabel)
                  .join(' → ')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: instructions }}
                aria-expanded={instructions}
                onPress={() => setInstructions(!instructions)}
                style={[styles.row, styles.disclosure, { borderColor: colors.border }]}
              >
                <Text style={[styles.label, { color: colors.text }]}>측정 자세와 진행 방법</Text>
                <Text style={[styles.small, { color: colors.primary }]}>
                  {instructions ? '접기' : '펼치기'}
                </Text>
              </Pressable>
              {instructions && (
                <View style={styles.group}>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    각 집기·힘 풀기 구간은{' '}
                    {(DAMPING_PROTOCOL.phases[2].planned_end_ms -
                      DAMPING_PROTOCOL.phases[2].planned_start_ms) /
                      1000}
                    초입니다. 처음 {DAMPING_PROTOCOL.phase_settle_ms / 1000}초에 천천히 힘을 바꾸고
                    나머지는 유지하세요. 약함·중간·더 셈은 주관적 노력 2/10·4/10·6/10 정도이며 최대
                    힘을 요구하지 않습니다.
                  </Text>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    측정 {DAMPING_PROTOCOL.vibration_start_ms / 1000}–
                    {DAMPING_PROTOCOL.vibration_end_ms / 1000}초에 연속 진동합니다. 준비 시간은 측정
                    시간과 별도입니다.
                  </Text>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    오른손 엄지·검지를 양옆 중앙에 두고 접촉을 유지하세요. 전완은 편하게 지지하고
                    다른 손가락·손바닥은 휴대폰에서 떨어뜨립니다. 아래로 누르거나 들어 올리지 말고,
                    불편하면 중단하세요.
                  </Text>
                </View>
              )}
              <Text style={[styles.section, { color: colors.text }]}>측정 환경</Text>
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                지금 측정할 조건을 선택해 주세요. 선택한 환경은 측정 결과와 함께 저장됩니다.
              </Text>
              <MeasurementSetupForm
                value={environment}
                onChange={setEnvironment}
                colors={colors}
                disabled={flow.busy || flow.testing}
              />
              <Text style={[styles.label, { color: colors.text }]}>기기 모델 메모</Text>
              <TextInput
                value={device}
                onChangeText={setDevice}
                maxLength={100}
                placeholder="기기 모델 메모 (선택)"
                accessibilityLabel="기기 모델 메모"
                placeholderTextColor={colors.secondaryText}
                editable={!flow.busy && !flow.testing}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              {Platform.OS === 'android' && (
                <>
                  <Text style={[styles.label, { color: colors.text }]}>진동 방식</Text>
                  <SetupChoices
                    label="진동 방식"
                    options={[
                      { value: 'standard', label: '기본 방식' },
                      { value: 'waveform_once', label: '파형 1회' },
                    ]}
                    value={flow.androidVibrationPreference}
                    onChange={flow.setAndroidVibrationPreference}
                    colors={colors}
                    disabled={flow.busy || flow.testing}
                  />
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    감지 모델: {flow.detectedModel || '확인 불가'} · {androidVibrationStatus}
                  </Text>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    {flow.androidVibrationPreference === 'waveform_once'
                      ? '휴지 없이 연결한 25초 파형을 한 번 재생합니다. 측정 3–28초에 진동합니다.'
                      : '기본 방식으로 먼저 측정해 주세요. 진동이 중간에 끊기면 ‘파형 1회’를 선택해 다시 측정해 주세요.'}
                  </Text>
                </>
              )}
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                {!flow.supportsLive
                  ? '새 측정은 iPhone 또는 Android 휴대폰에서 실행합니다. 이 화면에서는 합성 시험과 저장한 JSON 재생을 사용할 수 있습니다.'
                  : flow.sensor === 'checking'
                    ? '센서 확인 중…'
                    : flow.sensor !== 'available'
                      ? '가속도계를 사용할 수 없습니다. 실제 iPhone 또는 Android 휴대폰에서 열어 주세요.'
                      : `가속도계 사용 가능 · 자이로 ${flow.gyroAccess.available && flow.gyroAccess.permission !== 'denied' ? '사용 가능' : '사용 불가 또는 확인 중 (가속도 측정 가능)'}`}
              </Text>
              <ActionButton
                title={flow.testing ? '진동 시험 중…' : '진동 시험'}
                colors={colors}
                variant="secondary"
                disabled={!flow.supportsLive || flow.testing || flow.busy}
                onPress={() => {
                  setTested(true);
                  setFelt(null);
                  flow.testVibration();
                }}
              />
              {tested && !flow.testing && (
                <>
                  <Text style={[styles.body, { color: colors.text }]}>진동이 느껴졌나요?</Text>
                  <View style={styles.choices}>
                    {[true, false].map((v) => (
                      <ActionButton
                        key={String(v)}
                        title={v ? '네, 느껴졌어요' : '아니요'}
                        selected={felt === v}
                        colors={colors}
                        variant="secondary"
                        onPress={() => setFelt(v)}
                      />
                    ))}
                  </View>
                </>
              )}
              <View style={[styles.setupSummary, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.label, { color: colors.text }]}>이번 측정 조건</Text>
                <Text style={[styles.small, { color: colors.secondaryText }]}>
                  {describeMeasurementSetup(createMeasurementSetup(environment))}
                </Text>
              </View>
              <ActionButton
                title="측정 시작"
                colors={colors}
                disabled={
                  !flow.supportsLive ||
                  flow.sensor !== 'available' ||
                  felt !== true ||
                  flow.testing ||
                  flow.busy
                }
                onPress={() => {
                  setDetails(false);
                  setSelectedId(null);
                  void flow.start(environment, device);
                }}
              />
              {felt !== true && flow.supportsLive && (
                <Text style={[styles.small, { color: colors.secondaryText }]}>
                  진동 시험 후 ‘네, 느껴졌어요’를 선택해 주세요.
                </Text>
              )}
              <ActionButton
                title="합성 시험 보기"
                colors={colors}
                variant="quiet"
                disabled={flow.busy}
                onPress={() => {
                  setSelectedId(null);
                  setDetails(false);
                  flow.showReplay();
                }}
              />
              <ActionButton
                title={flow.busy ? '불러오는 중…' : '저장한 JSON 불러오기'}
                colors={colors}
                variant="quiet"
                disabled={flow.busy}
                onPress={() => {
                  setSelectedId(null);
                  setDetails(false);
                  void flow.importReplay();
                }}
              />
            </>
          )}
          {stage === 'countdown' && (
            <>
              <Text style={[styles.countdown, { color: colors.primary }]}>{flow.countdown}</Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                {environment.orientation === 'screen_down_top_away'
                  ? '지금 화면이 아래로 향하도록 놓고, 힘을 빼고 접촉만 유지하세요.'
                  : '힘 빼고 접촉만 유지하세요. 측정 중에는 화면을 누를 필요가 없습니다.'}
              </Text>
              <ActionButton
                title="준비 취소"
                colors={colors}
                variant="secondary"
                onPress={flow.stop}
              />
            </>
          )}
          {recording && (
            <>
              <Text style={[styles.action, { color: colors.primary }]}>
                {phase && elapsed - phase.actual_start_ms! < phaseSettle(protocol, phase)
                  ? phase.target_level === 'off'
                    ? '그대로 유지'
                    : phase.phase_id === protocol.reference_phase_id
                      ? '진동 안정화'
                      : '힘 바꾸기'
                  : '그대로 유지'}{' '}
                · {Math.max(0, Math.ceil(((phase?.planned_end_ms ?? duration) - elapsed) / 1000))}초
              </Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>
                {phase?.effort_cue}
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: duration / 1000,
                  now: Math.min(duration / 1000, Math.floor(elapsed / 1000)),
                }}
                style={[styles.track, { backgroundColor: colors.border }]}
              >
                <View
                  style={{
                    height: 6,
                    width: `${Math.min(100, (elapsed / duration) * 100)}%`,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                {(elapsed / 1000).toFixed(1)} / {duration / 1000}초 · 두 센서 연속 기록
              </Text>
              <ActionButton
                title="측정 중단"
                colors={colors}
                variant="secondary"
                onPress={flow.stop}
              />
            </>
          )}
          {(recording || result) && session && (
            <>
              {result && (
                <Text style={[styles.body, { color: colors.secondaryText }]}>
                  {session.data_origin === 'synthetic_test'
                    ? '계산과 화면 확인용 합성 신호입니다.'
                    : session.data_origin === 'replay'
                      ? `저장한 ${session.session.planned_duration_ms / 1000}초 기록을 원래 시간축으로 재계산했습니다. 원본은 보존됩니다.`
                      : `${(session.session.actual_duration_ms / 1000).toFixed(1)}초 기록을 저장합니다.`}{' '}
                  서로 다른 집기 강도는 구간별로 비교합니다.
                </Text>
              )}
              {result && (
                <View style={[styles.setupSummary, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.label, { color: colors.text }]}>기록된 측정 환경</Text>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    {describeMeasurementSetup(session.setup)}
                  </Text>
                  {!!session.setup.note && (
                    <Text style={[styles.small, { color: colors.secondaryText }]}>
                      {session.setup.note}
                    </Text>
                  )}
                </View>
              )}
              <FrameCard
                session={session}
                frame={selected}
                colors={colors}
                recording={recording}
                showAxes={details}
              />
              {result && (
                <>
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    그래프를 누르거나 드래그하면 세 그래프와 아래 상세가 같은 분석 창을 표시합니다.
                  </Text>
                  <View style={styles.choices}>
                    <ActionButton
                      title="이전 창"
                      colors={colors}
                      variant="quiet"
                      disabled={!selected || selected.frame_id <= 0}
                      onPress={() => setSelectedId(Math.max(0, (selected?.frame_id ?? 0) - 1))}
                    />
                    <ActionButton
                      title="다음 창"
                      colors={colors}
                      variant="quiet"
                      disabled={!selected || selected.frame_id >= session.features.length - 1}
                      onPress={() =>
                        setSelectedId(
                          Math.min(session.features.length - 1, (selected?.frame_id ?? 0) + 1),
                        )
                      }
                    />
                  </View>
                </>
              )}
              <DampingCharts
                session={session}
                colors={colors}
                cursor={selected}
                onSelect={result ? setSelectedId : undefined}
                detail={smallFrames}
              />
              {recording && elapsed < 2000 && <RawSensorPlots session={session} colors={colors} />}
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                {session.summary.quality_notes.length
                  ? reasons(session.summary.quality_notes)
                  : '진동 발생 시각은 하드웨어에서 확인하지 않습니다.'}
              </Text>
              {result && (
                <>
                  <Text accessibilityRole="header" style={[styles.section, { color: colors.text }]}>
                    구간별 요약
                  </Text>
                  <PhaseTable session={session} colors={colors} />
                  <Text style={[styles.small, { color: colors.secondaryText }]}>
                    안정 구간 안에 완전히 포함되는 2초 창만 요약합니다. 유효 창은 독립 실험 횟수가
                    아닙니다. 메인 기준 A₀는 처음 기준 접촉 구간으로 고정됩니다.
                  </Text>
                  {(['phone_moved', 'extra_contact'] as const).map((field) => (
                    <View key={field} style={styles.group}>
                      <Text style={[styles.body, { color: colors.text }]}>
                        {field === 'phone_moved'
                          ? '휴대폰이 밀리거나 들렸나요?'
                          : '다른 손가락이나 손바닥이 닿았나요?'}
                      </Text>
                      <View style={styles.choices}>
                        {[true, false].map((v) => (
                          <ActionButton
                            key={String(v)}
                            title={v ? '예' : '아니요'}
                            colors={colors}
                            variant="secondary"
                            disabled={flow.busy}
                            selected={session.observations[field] === v}
                            onPress={() => flow.updateObservation(field, v)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: details }}
                    onPress={() => setDetails(!details)}
                    style={[styles.disclosure, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.label, { color: colors.text }]}>
                      원본·측정 상세 {details ? '접기 −' : '보기 +'}
                    </Text>
                  </Pressable>
                  {details && (
                    <>
                      <Text style={[styles.small, { color: colors.secondaryText }]}>
                        원본은 축별 전체 표본을 파일에 보존합니다. 그래프의 표본 축소는 화면에만
                        적용됩니다.
                      </Text>
                      <View style={styles.row}>
                        <Text style={[styles.small, { color: colors.text }]}>
                          0.5초 가속도 상세 그래프 추가
                        </Text>
                        <Switch
                          value={shortWindow}
                          onValueChange={setShortWindow}
                          accessibilityLabel="0.5초 상세 그래프"
                        />
                      </View>
                      <RawSensorPlots
                        session={session}
                        colors={colors}
                        cursor={selected}
                        onSelect={setSelectedId}
                      />
                      <Text
                        selectable
                        style={[styles.small, { color: colors.secondaryText }]}
                      >{`기록 ${session.session.id}\n프로토콜 ${session.protocol_version}\n분석 ${session.analysis_version}\n기준 CV(ddof=0) ${fmt(session.summary.baseline_cv)}\n기준/배경 ${fmt(session.summary.baseline_to_off_pre_ratio)}\n기준 확정 ${fmt(session.baseline.available_at_ms === null ? null : session.baseline.available_at_ms / 1000)}초\n가속도 원본 ${session.raw.accelerometer.length}개 · 자이로 원본 ${session.raw.gyroscope.length}개\n종료 사유 ${session.session.abort_reason ?? '정상 완료'}\n${flow.file?.filename ?? ''}`}</Text>
                    </>
                  )}
                  {flow.busy && <ActivityIndicator color={colors.primary} />}
                  <Text
                    style={[
                      styles.small,
                      { color: flow.saveError ? colors.danger : colors.secondaryText },
                    ]}
                  >
                    {flow.saveError
                      ? `저장 실패: ${flow.saveError}`
                      : flow.busy
                        ? '기록 처리 중…'
                        : flow.file
                          ? Platform.OS === 'web'
                            ? '이 브라우저에 내부 저장 완료'
                            : '앱 내부 파일 생성 완료 · 외부 파일 저장은 공유 시트에서 선택'
                          : '저장 준비 중'}
                  </Text>
                  {flow.saveError && (
                    <ActionButton
                      title="저장 재시도"
                      colors={colors}
                      onPress={flow.retrySave}
                      disabled={flow.busy}
                    />
                  )}
                  <ActionButton
                    title={Platform.OS === 'web' ? 'JSON 다운로드' : 'JSON 저장·공유'}
                    colors={colors}
                    disabled={flow.busy || !flow.file}
                    onPress={() => {
                      void flow.share();
                    }}
                  />
                  <ActionButton
                    title="다시 측정"
                    colors={colors}
                    variant="secondary"
                    disabled={flow.busy || !flow.file}
                    onPress={() => {
                      setSelectedId(null);
                      setDetails(false);
                      setShortWindow(false);
                      flow.reset();
                    }}
                  />
                </>
              )}
            </>
          )}
          {flow.actionError && (
            <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.danger }]}>
              {flow.actionError}
            </Text>
          )}
          <Text style={[styles.footer, { color: colors.secondaryText }]}>
            엄지–검지 · 오른손 ·{' '}
            {(session?.setup.surface_type ?? environment.surface_type) === 'floor'
              ? '바닥'
              : '책상'}{' '}
            지지
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FrameCard({
  session,
  frame,
  colors,
  recording,
  showAxes,
}: {
  session: DampingSession;
  frame?: FeatureFrame;
  colors: ThemeColors;
  recording: boolean;
  showAxes: boolean;
}) {
  const phase = session.phases.find((p) => p.phase_id === frame?.phase_id_at_end);
  const b = session.baseline.accel_ac_rms_g;
  const reference = session.phases.find((p) => p.phase_id === session.config.reference_phase_id)!;
  const collecting =
    !reference.completed &&
    (reference.actual_start_ms !== null ||
      session.session.actual_duration_ms < reference.planned_end_ms);
  const { on, off } = vibrationInterval(session);
  const commandState = !frame
    ? '—'
    : [on, off].some((t) => t !== null && t > frame.window_start_ms && t < frame.window_end_ms)
      ? '진동 명령 경계 포함'
      : on === null || frame.window_end_ms <= on || (off !== null && frame.window_start_ms >= off)
        ? '진동 꺼짐'
        : '연속 진동 예약 구간';
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>기준 대비 진동 신호 감소율 (%)</Text>
      <Text style={[styles.small, { color: colors.secondaryText }]}>
        가속도 변동 기준 · 양수는 감소, 음수는 증가
      </Text>
      <Text style={[styles.value, { color: colors.primary }]}>
        {collecting && recording ? '기준 수집 중' : percent(frame?.accel.reduction_pct)}
      </Text>
      {!collecting && b === null && (
        <Text style={[styles.small, { color: colors.danger }]}>
          기준을 만들지 못했습니다. 자세와 수신 상태를 확인한 뒤 다시 측정해 주세요.
        </Text>
      )}
      <Text style={[styles.small, { color: colors.secondaryText }]}>
        {frame
          ? `${(frame.window_end_ms / 1000).toFixed(1)}초 · ${phase ? phaseLabel(phase) : '—'} · 분석 범위 ${(frame.window_start_ms / 1000).toFixed(1)}–${(frame.window_end_ms / 1000).toFixed(1)}초`
          : '최근 2초의 분석 창 준비 중'}
      </Text>
      <Text style={[styles.body, { color: colors.acceleration }]}>
        A {mg(frame?.accel.ac_rms_g)} mg / A₀ {mg(b)} mg
      </Text>
      <Text style={[styles.body, { color: colors.angularVelocity }]}>
        Ω {fmt(frame?.gyro.rms_magnitude_rad_s, 4)} rad/s
      </Text>
      {frame?.reduction_valid && (
        <Text style={[styles.small, { color: colors.secondaryText }]}>
          계산: (1 − {mg(frame.accel.ac_rms_g)} ÷ {mg(b)}) × 100 ≈{' '}
          {percent(frame.accel.reduction_pct)} (표시값 반올림)
        </Text>
      )}
      {frame && (
        <>
          <Text style={[styles.small, { color: colors.secondaryText }]}>
            {CONTEXT[frame.context]} · {commandState} ·{' '}
            {frame.summary_eligible ? '시간상 요약 대상' : '안정 구간 요약에서 제외'}
          </Text>
          <QualityLine label="가속도" quality={frame.accel} colors={colors} />
          <QualityLine label="각속도" quality={frame.gyro} colors={colors} />
          {!recording && showAxes && (
            <>
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                가속도 축 평균 (g): {frame.accel.mean_g?.map((v) => fmt(v, 4)).join(' / ') ?? '—'}
                {'\n'}축 AC RMS (g):{' '}
                {frame.accel.axis_ac_rms_g?.map((v) => fmt(v, 4)).join(' / ') ?? '—'}
              </Text>
              <Text style={[styles.small, { color: colors.secondaryText }]}>
                자이로 축 평균 (rad/s):{' '}
                {frame.gyro.mean_rad_s?.map((v) => fmt(v, 4)).join(' / ') ?? '—'}
                {'\n'}축 AC RMS (rad/s):{' '}
                {frame.gyro.axis_ac_rms_rad_s?.map((v) => fmt(v, 4)).join(' / ') ?? '—'}
              </Text>
            </>
          )}
        </>
      )}
      {session.baseline.available_at_ms !== null && (
        <Text style={[styles.small, { color: colors.secondaryText }]}>
          기준 확정 후 앞 구간도 같은 A₀로 재계산했습니다. 같은 커서는 같은 수신 시간창이며 센서의
          하드웨어 동기화를 뜻하지 않습니다.
        </Text>
      )}
    </View>
  );
}
function QualityLine({
  label,
  quality: q,
  colors,
}: {
  label: string;
  quality: SensorQuality;
  colors: ThemeColors;
}) {
  return (
    <Text style={[styles.small, { color: colors.secondaryText }]}>
      {label}: {fmt(q.sensor_rate_hz)} Hz · 수신 {fmt(q.receive_rate_hz)} Hz · {q.sample_count}개 ·
      수신 범위 {fmt(q.receive_span_ms, 5)} ms · 최대 간격 센서/수신 {fmt(q.max_sensor_gap_ms)}/
      {fmt(q.max_receive_gap_ms)} ms{q.valid ? '' : ` · ${reasons(q.reasons)}`}
    </Text>
  );
}
function PhaseTable({ session, colors }: { session: DampingSession; colors: ThemeColors }) {
  return (
    <ScrollView horizontal accessibilityLabel="구간 요약 표, 가로로 스크롤 가능">
      <View style={[styles.table, { borderColor: colors.border }]}>
        <View style={[styles.tableRow, { backgroundColor: colors.accentSoft }]}>
          {[
            '구간',
            'D 중앙값 · %',
            'A 중앙값 · mg',
            'Ω 중앙값 · rad/s',
            '유효/예정 창 A·Ω',
            '상태',
          ].map((v) => (
            <Text key={v} style={[styles.cell, { color: colors.text, fontWeight: '600' }]}>
              {v}
            </Text>
          ))}
        </View>
        {session.summary.phases.map((s) => {
          const p = session.phases.find((p) => p.phase_id === s.phase_id)!;
          const a = s.accel_ac_rms_g,
            g = s.gyro_rms_magnitude_rad_s;
          const cells = [
            phaseLabel(p),
            percent(s.accel_reduction_pct.median),
            mg(a.median),
            fmt(g.median, 4),
            `${a.valid_frames}/${a.expected_frames} · ${g.valid_frames}/${g.expected_frames}`,
            !p.completed
              ? '미완료'
              : !a.valid
                ? '가속도 부족'
                : !s.accel_reduction_pct.valid
                  ? '기준 없음'
                  : p.target_level === 'off'
                    ? '진동 꺼짐'
                    : p.target_level === 'settle'
                      ? '준비'
                      : p.phase_id === session.config.reference_phase_id
                        ? '기준'
                        : '안정 구간',
          ];
          return (
            <View
              key={s.phase_id}
              style={[
                styles.tableRow,
                {
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                  backgroundColor: ['low', 'medium', 'higher', 'pinch'].includes(p.target_level)
                    ? colors.accentSoft
                    : colors.surface,
                },
              ]}
            >
              {cells.map((v, i) => (
                <Text key={i} style={[styles.cell, { color: colors.text }]}>
                  {v}
                </Text>
              ))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  page: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  brand: { fontSize: 18, fontWeight: '600' },
  badge: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  title: { fontSize: 28, fontWeight: '600', lineHeight: 40 },
  action: { fontSize: 26, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24 },
  small: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 48, fontSize: 15 },
  countdown: { fontSize: 104, textAlign: 'center', padding: 32, fontVariant: ['tabular-nums'] },
  protocolStrip: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, paddingVertical: 16 },
  protocolItem: { flex: 1, alignItems: 'center', gap: 4 },
  protocolMiddle: { borderLeftWidth: 1, borderRightWidth: 1 },
  protocolValue: { fontSize: 20, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  setupSummary: { padding: 16, borderRadius: 12, gap: 8 },
  track: { height: 6, overflow: 'hidden', borderRadius: 3 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  value: { fontSize: 38, lineHeight: 52, fontWeight: '600', fontVariant: ['tabular-nums'] },
  section: { fontSize: 20, fontWeight: '600', paddingTop: 16 },
  disclosure: { borderBottomWidth: 1, paddingVertical: 16 },
  table: { width: 800, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', minHeight: 52, alignItems: 'center' },
  cell: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    padding: 8,
    fontVariant: ['tabular-nums'],
  },
  footer: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
});
