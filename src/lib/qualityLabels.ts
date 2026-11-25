import type { QualityReason } from '../types/session';

export const QUALITY_LABELS: Record<QualityReason, string> = {
  insufficient_samples: '표본 수가 부족한 창이 있습니다.',
  short_receive_span: '수신 시간 범위가 짧아 일부 창을 비웠습니다.',
  invalid_axis: '유효하지 않은 가속도 값이 있습니다.',
  invalid_sensor_timestamp: '센서 시각이 없거나 중복·역순인 창이 있습니다.',
  invalid_receive_time: '수신 시각이 유효하지 않은 창이 있습니다.',
  low_sample_rate: '센서 속도가 50 Hz 미만인 창이 있습니다.',
  sample_gap: '표본 간격이 100 ms를 넘는 구간이 있습니다.',
  delivery_jitter: '센서와 수신 간격의 차이가 100 ms를 넘습니다.',
  transition: '단계 경계를 걸친 창은 구간 비교에서 제외합니다.',
  command_late: '안내 또는 진동 요청이 250 ms 넘게 늦어 관련 구간을 비교에서 제외했습니다.',
  insufficient_valid_windows: '구간의 유효 창이 80% 미만입니다.',
  baseline_unavailable: '유효한 기준 신호를 만들지 못했습니다.',
  incomplete_phase: '해당 구간을 끝까지 기록하지 못했습니다.',
  incomplete_session: '35초를 완료하지 않아 전체 세 반복 요약을 만들지 않았습니다.',
  weak_motor_response:
    '진동 켜짐과 꺼짐의 센서 차이가 작았습니다. 실제 진동 발생 여부를 확인하세요.',
  unstable_baseline: '기준 구간의 센서 변동이 고르지 않았습니다.',
  manual_artifact: '휴대폰 밀림·들림 또는 추가 접촉이 표시되었습니다. 값은 그대로 보존했습니다.',
};
