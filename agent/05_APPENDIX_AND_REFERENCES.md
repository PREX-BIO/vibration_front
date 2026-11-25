# 05. 설계 가정, 후속 단계와 근거

## A. 이번 데모에서 채택한 방법

휴대폰에 진동을 주고 집기 동작에 따른 센서 반응을 관찰한다는 출발점은 VFE를 참고합니다. 첫 Expo 데모에서는 가속도 변동의 RMS를 사용해 수집·표시·저장 흐름부터 확인합니다.

**「Smartphone Vibrometric Force Estimation for Grip Related Strength Measurements」**에 따르면, 저자들은 Pixel 4의 IMU 신호와 기준 힘 센서를 함께 기록해 회귀 모델을 학습했습니다. 현재 확인한 v2 본문에는 엄지와 검지를 휴대폰 양옆에 둔다는 설명이 있으며, 검지 아래 힘 센서를 사용합니다.[^vfe]

따라서 문헌을 “엄지–검지 사용 여부를 전혀 알 수 없는 자료”로만 정리하지 않습니다. 다만 우리가 정의한 **책상에 놓은 상태의 중앙 접점**, 이번 RMS 계산, Expo 실행 조건의 성능은 별도 검증 대상입니다.

논문의 주파수 대역 처리·학습 모델·오차 수치를 이번 간단한 앱의 성능으로 가져오지 않습니다. 이 문서에서 정한 시간표·설정값은 자체 설계입니다.

## B. 신호를 어떻게 해석할 것인가

| 요인 | 이번 데모에서 할 일 | 후속 검증 |
|---|---|---|
| 책상 접촉 | 같은 재질·위치·케이스 상태 기록 | 표면에 따라 반응이 얼마나 달라지는지 |
| 손 움직임 | 책상 지지, 접점 유지, 구간 첫 1초 제외 | 가속도 변화 중 움직임 성분 분리 |
| 센서 속도 | 요청 100 Hz, 실제 속도 저장 | 더 높은 속도에서 결과 비교 |
| 진동 명령 | 같은 시간·명령 유지 | 실제 모터 동작·기종별 차이 확인 |
| JS 전달 지연 | 센서 시각·수신 시각을 모두 저장 | 공통 기준시계로 정밀 정렬 |
| 사용자 집기 | 안내와 세 반복의 기록 | 기준 힘과 동시 측정 |
| 갑작스러운 앱 종료 | 정상 종료·수동 중단에서 저장 | 필요해지면 중간 저장·복구 추가 |

책상은 손으로 기기를 지탱하는 부담을 줄이기 위한 조건입니다. 책상 자체도 진동을 바꾸므로 “책상에 두면 잡음이 제거된다”는 전제를 사용하지 않습니다.

### 100 Hz 데모의 한계

100 Hz로 받은 표본은 50 Hz를 넘는 실제 성분을 원래 주파수대로 표현할 수 없습니다. 그래서 첫 버전의 RMS는 **수집된 표본의 변동 크기**입니다. 특정 모터 주파수의 진폭을 정확히 분리했다고 주장하지 않습니다.

화면에 변화가 나타나더라도 실제 힘과의 대응을 바로 의미하지 않습니다. 반대로 변화가 작으면 센서 속도·기기·접촉 조건을 점검할 기록을 얻은 것입니다. 첫 데모에서는 이 한계를 감추기 위해 신호를 증폭하거나 안내에 맞춰 값을 생성하지 않습니다.

## C. Expo Go와 개발 빌드의 구분

| 항목 | Expo Go에서 확인 | 개발 빌드가 필요할 수 있는 경우 |
|---|---|---|
| 가속도·그래프·파일 공유 | 기본 데모 구현 | 사용 라이브러리의 네이티브 구성이 달라짐 |
| 100 Hz 요청 | 실제 수집 속도 관찰 | 호스트 환경에서 필요한 구성이 제공되지 않음 |
| 200 Hz 초과 요청 | 지원을 가정하지 않음 | 고속 센서 권한을 포함한 앱 바이너리 필요 |
| Android 연속 진동 | 실제 기기의 진동 시험 | 권한·네이티브 제어를 별도로 구성 |
| iOS 진동 | 동일 프로토콜 적용을 보류 | 별도의 구동 방식과 검증 필요 |

Expo Go는 고정된 네이티브 앱이며 개발 빌드는 프로젝트 구성에 맞는 앱입니다.[^devbuild] Android의 200 Hz 초과 센서 수집에는 관련 권한 구성이 필요합니다.[^sensors] 어느 환경에서도 요청 속도가 실제 속도를 보장하지 않습니다.

## D. 이후 집게힘으로 연결하는 방법

지금 확보하는 값은 센서 특징 `x`입니다. 기준 힘 `F`를 동시에 기록한 데이터가 생기면 모델 `g`를 학습합니다.

\[
x=\{\text{센서 진폭, 기준 대비 비율, 기기·접촉 조건 등}\}
\]
\[
\hat F=g_\theta(x),\qquad
\hat F_{\rm kgf}=\hat F_{\rm N}/9.80665
\]

학습용 힘은 **한쪽 접점의 압축력**처럼 측정 대상을 먼저 정의합니다. 양쪽에 서로 마주 보는 힘이 있다고 두 값을 단순히 더해 두 배로 만들지 않습니다.

| 단계 | 할 일 |
|---|---|
| 1. 기준 장비 | 휴대폰 접점에서 힘을 함께 기록할 수 있는 보정된 힘 센서 준비 |
| 2. 조건 기록 | 센서 삽입 두께·접점·책상·기종을 일관되게 유지 |
| 3. 동시 취득 | 기준 힘과 휴대폰 신호를 같은 동작에서 수집 |
| 4. 시간 정렬 | 시계 오프셋·지연을 확인하고 정렬 방법을 고정 |
| 5. 모델 학습 | 작은 회귀 모델부터 비교 |
| 6. 평가 | 사람·세션 단위로 분리한 데이터에서 오차와 반복성을 평가 |

같은 세션의 인접 창을 학습·평가에 섞으면 성능이 과대평가될 수 있으므로 분할 단위는 사람·세션으로 잡습니다. 기준 센서를 넣은 상태와 제거한 상태의 접촉 조건 차이도 검증합니다.

집게힘에서 최대 파지 압박력으로 가는 별도 모델은 이 데모 이후의 연구 범위입니다. 집기 동작의 순서나 “세게 집으세요” 안내 문구는 기준 힘 데이터가 아닙니다.

## E. 출처와 적용 범위

아래 자료는 2026-11-18 확인했습니다. SDK별 API 차이는 실제 프로젝트의 설치 버전 문서에서 다시 확인합니다.

| 자료 | 이 설계에서 참고한 내용 |
|---|---|
| VFE 논문[^vfe] | 휴대폰 진동·IMU와 기준 힘을 연결하는 방법론 |
| Expo Accelerometer[^accel] | 가속도 API, g 단위, 초 단위 timestamp, Expo Go 지원 |
| Expo Sensors[^sensors] | 고속 센서 권한 구성 |
| React Native Vibration[^vibration] | Android·iOS의 진동 시간 지정 차이 |
| Expo development builds FAQ[^devbuild] | Expo Go와 별도 네이티브 구성의 차이 |
| Expo FileSystem[^files] | 기기 파일 저장 |
| Expo Sharing[^sharing] | 파일 공유 |
| Expo SVG[^svg] | 단순 도식·그래프 |
| Expo KeepAwake[^awake] | 측정 화면 유지 |

[^vfe]: Smartphone Vibrometric Force Estimation for Grip Related Strength Measurements — https://arxiv.org/html/2512.03186v2.
[^accel]: Accelerometer — https://docs.expo.dev/versions/latest/sdk/accelerometer/.
[^sensors]: Sensors — https://docs.expo.dev/versions/latest/sdk/sensors/.
[^vibration]: Vibration — https://reactnative.dev/docs/vibration.
[^devbuild]: Development builds FAQ — https://docs.expo.dev/develop/development-builds/faq/.
[^files]: FileSystem — https://docs.expo.dev/versions/latest/sdk/filesystem/.
[^sharing]: Sharing — https://docs.expo.dev/versions/latest/sdk/sharing/.
[^svg]: react-native-svg — https://docs.expo.dev/versions/latest/sdk/svg/.
[^awake]: KeepAwake — https://docs.expo.dev/versions/latest/sdk/keep-awake/.
