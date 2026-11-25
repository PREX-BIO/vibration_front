# 03. 센서 특징과 kgf 출력의 데이터 계약

## 1. 첫 데모의 측정값

첫 구현은 **500 ms 동안의 3축 가속도 변동 크기**를 계산합니다. 일정한 중력 성분을 창별 평균 제거로 줄이고, 가볍게 접촉했을 때의 값과 비교합니다.

이 계산으로 만든 비율은 **집게힘 데모 모델의 입력**입니다. 이 문서는 센서 특징을 정의하고, kgf 변환은 [07](07_FORCE_ESTIMATION_DEMO.md)의 임시 회귀식으로 수행합니다. 주 화면은 집게힘 데모값, RMS·비율은 상세 정보로 표시합니다.

## 2. 고정 설정

| 키 | 값 | 의미 |
|---|---:|---|
| `protocol_version` | `expo_desk_pinch_ios_pulsed_v1` | 시간표 버전 |
| `analysis_version` | `accel_ac_rms_v1` | 계산 버전 |
| `requested_interval_ms` | 10 | 센서 업데이트 요청 간격 |
| `window_ms` | 500 | 계산 창 |
| `hop_ms` | 100 | 계산·화면 갱신 간격 |
| `min_samples` | 20 | 한 창의 최소 표본 수 |
| `min_sample_span_ms` | 400 | 한 창의 첫·끝 JS 수신시각 사이 최소 길이 |
| `max_gap_ms` | 100 | 허용할 센서·수신 간격의 초기 상한 |
| `min_sensor_rate_hz` | 50 | 해당 창의 실제 센서 속도 하한 |
| `phase_exclusion_ms` | 1000 | 구간 시작 뒤 요약 제외 시간 |
| `min_valid_window_fraction` | 0.80 | 기준·구간 요약에 필요한 유효 창 비율 |
| `numeric_epsilon_g` | 0.000000001 | 0에 가까운 값으로 나누기 방지 |
| `weak_motor_ratio` | 1.20 | 배경과 차이가 작다는 상세 메모 기준 |
| `baseline_cv_note` | 0.30 | 기준 흔들림 상세 메모 기준 |
| `command_late_ms` | 250 | 안내·진동 요청 지연 표시 기준 |

이는 **첫 데모의 설정값**입니다. 힘 추정의 정확도나 생리학적 판정 기준이 아닙니다. 설정 전체를 JSON에 저장하고 수치를 변경하면 버전을 갱신합니다.

## 3. 변동 크기

창 `W`에 들어온 가속도 벡터를 `a_i=(x_i,y_i,z_i)`라 합니다. Expo 원본 단위 `g`를 그대로 사용합니다.

\[
\bar{\mathbf a}_W=\frac1N\sum_{i=1}^{N}\mathbf a_i
\]

\[
A_W=\sqrt{
\frac1N\sum_{i=1}^{N}
\left[(x_i-\bar x)^2+(y_i-\bar y)^2+(z_i-\bar z)^2\right]
}
\]

`A_W`가 **측정된 동적 가속도의 RMS 크기**입니다. 원본 벡터의 크기에서 단순히 1 g를 빼는 계산은 사용하지 않습니다.

창은 JS 수신 상대시간의 `[t−500,t)` ms이고, `t=500,600,…,35000`입니다. 계산 시점이 늦으면 마지막 완료된 창부터 따라잡되 같은 창을 두 번 추가하지 않습니다.

## 4. 기준값과 비율

[6,9)초 안에 완전히 포함되는 유효 창들의 RMS 중앙값을 기준으로 정합니다.

\[
B=\operatorname{median}(A_W\mid W\subset[6,9))
,\qquad
r_W=\frac{A_W}{B}
\]

기준이 준비되기 전에는 RMS를 수집하고, 9초 이후 비율을 표시합니다. 기준 창의 80% 이상이 유효하고 `B>numeric_epsilon_g`여야 합니다.

| 값 | 의미 |
|---:|---|
| 1.00 | 기준과 같은 센서 변동 크기 |
| 0.80 | 기준의 80% |
| 1.20 | 기준의 120% |

값을 0–1로 자르지 않습니다. 힘의 백분율이나 점수로 바꾸지 않습니다. 진동이 꺼진 구간과 진동 시작 전이 구간의 비율은 그래프에서 비워 둡니다.

꺼짐 기준은 [1,3)초의 RMS 중앙값 `B_off`입니다. `B/B_off`도 상세에 저장합니다. 1.20 미만이면 `weak_motor_response` 메모를 남깁니다. `B_off`가 거의 0이면 이 비교값은 `null`입니다.

기준 창들의 `CV=표본 표준편차/평균`가 0.30을 넘으면 `unstable_baseline` 메모를 남깁니다. 이 메모들은 관찰값을 숨기기 위한 규칙이 아닙니다. 결과 상세에서 해석 조건으로 보여줍니다.

## 5. 반복 구간 요약

각 구간 시작 뒤 1초를 제외하고, 남은 구간 안에 완전히 포함되는 유효 창을 사용합니다.

\[
R_j=\operatorname{median}(r_W\mid {\rm pinch}_j),\quad
L_j=\operatorname{median}(r_W\mid {\rm preceding\ light}_j)
\]
\[
\Delta_j=R_j-L_j
\]

| 반복 | 집기 | 비교 기준 |
|---|---|---|
| 1 | `pinch_1` | `baseline` |
| 2 | `pinch_2` | `light_1` |
| 3 | `pinch_3` | `light_2` |

`light_3`는 마지막 회복값으로 따로 저장합니다. Δ가 음수이면 집기 구간의 센서 변동이 비교 기준보다 작았다는 뜻입니다. 이 차이를 힘의 차이라고 해석하지 않습니다.

집기 또는 비교 기준의 유효 창이 80% 미만이면 해당 구간 중앙값과 Δ 비교는 `null`입니다. 유효한 세 Δ가 모두 있을 때만 전체 Δ 중앙값을 생성합니다.

집게힘 데모 출력은 집기 구간의 `R_j`를 사용하므로, 직전 완화 구간만 무효인 경우에도 `R_j`와 최초 기준이 유효하면 계산할 수 있습니다. `trial.valid`는 기존의 Δ 비교 유효성, `trial.force_estimate.valid`는 힘 데모 계산 유효성으로 구분합니다.

## 6. 간단한 품질 처리

센서 timestamp가 `s_i`초일 때 실제 속도는 다음과 같이 계산합니다.

\[
f_{\rm sensor}=1/\operatorname{median}(s_i-s_{i-1})
\]

JS 수신 속도는 수신시각 차이로 별도 계산합니다. 센서 timestamp와 `performance.now()`는 원점을 같다고 가정하지 않습니다.

| 상황 | 처리 |
|---|---|
| 표본 20개 미만·수신 시간 범위 400 ms 미만 | 창 무효 |
| 센서 timestamp 없음·역순·중복 | 해당 창의 비율을 비우고 원본 보존 |
| 실제 센서 속도 50 Hz 미만 | 창 무효, `low_sample_rate` |
| 센서 간격 또는 JS 수신 간격 100 ms 초과 | 창 무효, `sample_gap` |
| 인접 센서 간격과 JS 수신 간격 차이가 100 ms 초과 | 창 무효, `delivery_jitter` |
| 유한수가 아닌 축 값 | 창 무효 |
| 기준값 부재·0에 가까운 기준 | 비율 `null` |
| 구간 경계를 걸친 창 | `phase_id=transition`, 구간 요약에서 제외 |
| 250 ms 초과 안내·진동 요청 지연 | 관련 구간 요약 무효, `command_late` |
| 사용자의 중단 | 부분 원본·특징·데모값 보존, 세 반복 대표값 미완료 |
| 사용자가 밀림·들림을 표시 | 값 보존, `manual_artifact` 메모 |

한 창에 간격 이상이 걸쳤는지는 해당 창 안의 표본과 직전 표본도 함께 확인합니다. 빈 구간을 보간해 매끈한 성공 그래프로 만들지 않습니다.

## 7. kgf 연결 규칙

`ratio`가 유효하면 [07](07_FORCE_ESTIMATION_DEMO.md)의 `predictForce`를 호출합니다. 관측 메모인 `weak_motor_response`, `unstable_baseline`, `manual_artifact` 자체는 데모 계산을 막지 않습니다. 기준 부재·비유한수·무효 창은 `force_estimate.value_kgf=null`로 처리합니다.

강한 입력에서 표시 상한에 도달하더라도 입력 비율과 범위 처리 전 출력은 그대로 보존합니다. 0–15 kgf 범위 처리는 모델 출력에만 적용합니다.

## 8. 한 JSON 파일로 저장

`pinch_<시각>_<짧은ID>.json`에 원본·특징·모델·결과를 함께 저장합니다. 스키마 버전은 **2.0**입니다.

| 상위 필드 | 내용 |
|---|---|
| `schema_version` | `2.0` |
| `session_id`, `status`, `started_at_utc` | 기존 기록 식별·상태·시각 |
| `data_origin` | `live`, `replay`, `manual_feature` |
| `platform`, `runtime` | 현재 실측은 `ios`, `expo_go` |
| `protocol_version` | `expo_desk_pinch_ios_pulsed_v1` |
| `analysis_version` | `accel_ac_rms_v1` |
| `phase_assignment` | `js_receive_time` |
| `force_model` | 07의 모델 설정 전체 스냅샷 |
| `config` | 센서·시간표·진동 설정 |
| `raw_samples`, `events`, `features` | 기존 원본·이벤트·특징 |
| `summary` | 기존 진단·구간 결과와 대표 데모값 |
| `observations` | 밀림·추가 접촉·메모 |

`config`에 `vibration_mode=ios_pulsed`, `ios_pulse_interval_ms=1000`, `ios_pulse_tail_guard_ms=500`을 포함하고 실제 사용한 패턴도 남깁니다. 펄스별 실제 발생 시각이 없으면 이를 추정해 실측 시각 필드에 넣지 않습니다.

### 원본과 특징

| 배열 | 필드 |
|---|---|
| `raw_samples` | `index`, `sensor_timestamp_s`, `received_relative_ms`, `x_g`, `y_g`, `z_g`, `phase_id` |
| `events` | `type`, `planned_ms`, `actual_ms`, `phase_id`, `detail` |
| `features` | `start_ms`, `end_ms`, `phase_id`, `sample_count`, `rms_g`, `ratio`, `valid`, `reasons`, **`force_estimate`** |
| `summary.trials` | `trial`, `pinch_ratio`, `preceding_light_ratio`, `delta`, `valid`, `reasons`, **`force_estimate`** |

특징·반복의 `force_estimate` 형식:

~~~json
{
  "value_kgf": 4.0,
  "raw_kgf": 4.0,
  "kind": "demo",
  "model_id": "demo_ac_ratio_linear_v1",
  "clamped": false,
  "valid": true,
  "reasons": []
}
~~~

이는 구조 예시입니다. 무효 입력에서는 두 kgf 필드를 `null`로 두고 `valid=false`로 기록합니다.

### 최종 대표값

`summary.force_estimate`에는 `value_kgf`, `kind`, `model_id`, `aggregation`, `valid`, `reasons`를 저장합니다. `aggregation`은 `median_of_three_trial_estimates`입니다. 세 반복의 범위 처리 후 kgf 중앙값을 사용합니다.

UI의 대표 숫자는 **`summary.force_estimate.value_kgf`**를 읽습니다. `median_trial_delta`는 상세의 센서 변화 지표로 유지합니다.

### v1 기록 호환

v1의 `summary.pinch_force_kgf=null`은 당시 힘 모델을 연결하지 않았다는 뜻입니다. 그 null을 v2 UI의 결과로 계속 연결하지 않습니다.

이전 기록을 재생할 때는 비율에서 데모값을 계산해 새 결과로 만듭니다. `data_origin=replay`와 `source_session_id`를 남기고, 원래 실측 JSON은 수정하지 않습니다. 수동 입력 시험은 `manual_feature`로 구분합니다.

`data_origin=live`와 `force_estimate.kind=demo`는 함께 존재할 수 있습니다. 전자는 센서 출처, 후자는 출력 모델의 성격입니다.

## 9. 저장·재계산

UI 반올림 전의 수치를 저장합니다. 같은 원본·특징·모델 설정이면 재계산 결과가 같아야 합니다. 모델 설정은 측정 시작 시 고정하며 저장 후 다른 계수로 몰래 다시 계산하지 않습니다.
