# 02. 현재 Expo 앱에 추가할 구조

## 1. 실행 기준

공유된 기록은 `platform=ios`, `runtime=expo_go`, `expo_sdk_version=58.0.0`입니다. 이 환경에서 동작하는 기존 앱에 힘 출력 단계를 추가합니다. 기존 SDK·패키지 버전·iOS 펄스 진동을 유지합니다.

이번 기능은 TypeScript 계산으로 구현할 수 있습니다. Core Haptics 모듈, 별도 Swift 앱, 서버, 클라우드 추론을 필수 작업으로 추가하지 않습니다.

## 2. 현재 기능과 추가 기능

| 기능 | 구성 |
|---|---|
| 기존 수집 | `expo-sensors / Accelerometer` |
| 기존 진동 | React Native `Vibration`의 iOS 펄스 패턴 |
| 기존 특징 | 500 ms RMS와 기준 대비 비율 |
| **추가 모델** | `demoForceModel.ts`: 임시 계수와 출력 범위 |
| **추가 추론** | `predictForce.ts`: 표준화 → 가중합 → 범위 처리 |
| 표시 | kgf 카드·그래프, `데모값` 표시 |
| 저장·공유 | `expo-file-system`, `expo-sharing` |

iOS의 진동 패턴은 Android의 시간 지정과 다릅니다.[^vibration] 공유된 JSON의 `ios_pulse_interval_ms=1000`, `ios_pulse_tail_guard_ms=500` 및 현재 작동하는 패턴 생성 코드를 유지합니다. 설정된 간격과 실제 모터 발생 시각을 동일하다고 단정하지 않습니다.

## 3. 함수 책임

| 함수·모듈 예시 | 입력 | 출력 |
|---|---|---|
| `computeRms` | 센서 창 | RMS |
| `computeRatio` | RMS, 기준 RMS | `accel_rms_ratio` |
| `loadForceModel` | 설정 | 검증한 모델 스냅샷 |
| `predictForce` | 특징 벡터, 모델 | 원시 kgf·표시 kgf·출처·clamp 여부 |
| `summarizeTrialForce` | 한 집기 구간의 유효 비율 | 해당 반복의 데모값 |
| `summarizeSessionForce` | 세 반복 결과 | 대표 데모값 |
| `saveSession` | 원본·설정·특징·결과 | JSON |

`predictForce`는 Android·iOS API에 의존하지 않는 순수 TypeScript 함수로 작성합니다. 랜덤값, 안내 단계별 고정 힘, 현재 시간을 힘 계산에 넣지 않습니다.

## 4. 구현 순서

1. 기존 결과의 `pinch_ratio`를 [07](07_FORCE_ESTIMATION_DEMO.md)의 임시 모델에 넣습니다.
2. 공유된 JSON 재계산 결과가 `3.8 / 8.2 / 4.1 kgf`로 표시되는지 확인합니다.
3. 같은 함수를 실시간 특징 스트림에 연결합니다.
4. 결과 화면의 대표값과 세 번의 kgf 결과를 연결합니다.
5. 모델 설정과 출력 출처를 JSON에 저장합니다.

이 순서라면 센서 취득을 새로 만들지 않고 결과 출력부터 확인할 수 있습니다.

## 5. 상태·중단·성능

준비 → 기록 → 저장 → 결과의 기존 흐름을 유지합니다. 원본은 버퍼에 모으고 100 ms마다 계산 결과만 UI에 전달합니다. 매 센서 이벤트마다 전체 화면을 다시 그리지 않습니다.

시작할 때 모델 설정을 복사해 세션에 고정합니다. 측정 중 계수를 바꾸지 않습니다. 설정을 변경하면 다음 세션부터 새 모델 ID로 적용합니다.

앱이 배경으로 이동하거나 사용자가 중단하면 진동 패턴·리스너·타이머를 정리하고 확보한 원본과 특징을 저장합니다. 기준이 없는 구간의 kgf는 `null`이며 이전 숫자를 현재 값처럼 계속 표시하지 않습니다.

## 6. 개발용 직접 입력

개발 화면에 비율 `r`를 직접 입력하는 작은 계산기를 둘 수 있습니다. 이 계산기 역시 같은 `predictForce`를 호출합니다.

직접 입력 결과는 `입력값 시험`으로 표시하고 `data_origin=manual_feature`로 구분합니다. 실측 파일에 임의 표본을 섞지 않습니다.

[^vibration]: Vibration — https://reactnative.dev/docs/vibration.
