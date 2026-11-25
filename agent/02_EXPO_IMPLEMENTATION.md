# 02. Expo 앱 구현 구조

## 1. 필요한 패키지

Expo 프로젝트의 기존 SDK에 맞춰 `npx expo install`로 설치합니다. 새 프로젝트라면 설치 시점의 안정 SDK를 사용하고 lockfile을 함께 제출합니다.

| 기능 | 패키지·API |
|---|---|
| UI·상태 | React Native, React, TypeScript |
| 가속도 | `expo-sensors / Accelerometer` |
| 진동 | React Native `Vibration` |
| 간단한 선 그래프·접점 도식 | `react-native-svg` |
| 파일 저장 | `expo-file-system` |
| JSON 공유 | `expo-sharing` |
| 측정 중 화면 유지 | `expo-keep-awake` |

가속도계는 Expo Go에 포함되어 있습니다.[^accel] 차트는 SVG 선 하나로 구성해 가볍게 유지합니다. 기존 프로젝트가 Expo Router를 사용하면 그 구조를 따르고, 새 데모는 한 화면 안의 단계 전환으로 구현해도 됩니다.

## 2. 센서와 진동

### 센서

`Accelerometer.isAvailableAsync()`로 확인하고 `setUpdateInterval(10)`으로 **10 ms 간격, 요청값 기준 100 Hz**부터 시작합니다. 실제 속도는 센서 타임스탬프로 따로 계산합니다. Expo의 가속도값 단위는 `g`이고 `timestamp`는 초입니다.[^accel]

`addListener` 안에서는 원본 표본을 메모리 버퍼에 추가합니다. 매 표본마다 React 상태를 바꾸지 않습니다. 100 ms마다 최근 500 ms의 계산 결과만 화면에 전달합니다.

### 진동

Android에서 `Vibration.vibrate(30_000)`를 사용하고 측정 종료·중단 시 `Vibration.cancel()`을 호출합니다. 진동 시작이 늦으면 예정된 33초 시점까지 남은 시간만 요청합니다.[^vibration]

세기·주파수를 임의의 숫자로 설정하는 기능은 첫 데모에 넣지 않습니다. `expo-haptics`의 클릭 효과를 빠르게 반복해 연속 진동을 흉내 내는 방식도 구현 범위에 포함하지 않습니다.

## 3. Expo Go에서 시작하는 순서

1. 기기와 프로젝트 SDK가 맞는 Expo Go에서 앱을 엽니다.
2. Android 여부, 센서 사용 가능 여부를 확인합니다.
3. 진동 시험 버튼을 누르고 실제 진동을 확인합니다.
4. 한 세션을 기록하고 관측한 표본 속도·간격을 표시합니다.
5. 결과를 JSON으로 저장하고 공유합니다.

Expo Go는 설치된 호스트 앱의 네이티브 구성을 사용합니다. 프로젝트의 `app.json` 권한을 바꿨다고 Expo Go의 네이티브 권한이 바뀌지는 않습니다. 별도의 권한 구성이 필요하면 개발 빌드를 만듭니다.[^devbuild]

Android 앱 자체를 빌드할 때는 `android.permissions`에 `android.permission.VIBRATE`를 선언합니다. **200 Hz 초과 수집**을 후속 실험에 추가할 때는 `android.permission.HIGH_SAMPLING_RATE_SENSORS`와 새 바이너리 빌드를 검토합니다. 권한을 추가해도 실제 속도는 다시 측정합니다.[^sensors]

첫 데모는 100 Hz 요청으로 완성합니다. 고속 수집이나 직접 작성한 네이티브 모듈을 필수 전제로 만들지 않습니다.

## 4. 파일 역할

아래는 권장 역할 구분입니다. 동일 역할을 더 간단하게 합쳐도 됩니다.

| 경로 예시 | 역할 |
|---|---|
| `src/screens/PinchDemoScreen.tsx` | 준비·측정·결과 상태에 맞는 UI |
| `src/hooks/usePinchSession.ts` | 시작, 단계 전환, 종료, 중단 |
| `src/components/SignalChart.tsx` | SVG 그래프, 구간 음영, 빈 구간 |
| `src/components/ContactGuide.tsx` | 책상 위 접점 안내 |
| `src/lib/signal.ts` | 순수 함수 RMS·비율·구간 요약 |
| `src/lib/sessionFile.ts` | JSON 저장과 공유 |
| `src/config/protocol.ts` | 시간표와 계산 설정 |
| `src/types/session.ts` | 원본·이벤트·결과 타입 |

서버 요청 없이 이 앱 안에서 측정 흐름을 완성합니다. 전역 상태 라이브러리·DB·인증은 첫 데모에 필요하지 않습니다.

## 5. 상태와 기준시계

~~~mermaid
stateDiagram-v2
    [*] --> Ready
    Ready --> Countdown: 시작
    Countdown --> Recording: 3초 경과
    Countdown --> Ready: 취소
    Recording --> Saving: 35초 경과
    Recording --> Saving: 중단
    Saving --> Result: 저장 완료
    Saving --> Result: 저장 오류 표시
    Result --> Ready: 다시 측정
~~~

앱 단계와 타이머는 `performance.now()`의 상대시간으로 계산합니다. 반복 타이머의 호출 횟수를 시간으로 삼지 않습니다. 진동 호출과 안내 전환의 실제 앱 시각을 이벤트로 남깁니다.

원본에는 **센서 timestamp와 JS 수신 시각을 모두 보존**합니다. 첫 데모는 UI 단계와 표본의 연결에 JS 수신 시각을 사용하며, 이를 `phase_assignment=js_receive_time`으로 명시합니다. 두 시계의 시작점을 같다고 가정해 직접 빼지 않습니다.

센서 timestamp는 표본 간격·센서 속도 계산에 사용합니다. 전달 지연이 큰 구간은 품질 표시를 남깁니다. 정밀한 센서·기준 힘 시간 정렬은 후속 범위입니다.

## 6. 수집·화면·저장

35초 × 요청 100 Hz는 약 3,500개 표본 규모입니다. 원본은 `useRef` 등의 버퍼에 쌓고 종료 시 JSON으로 저장합니다. 화면 그래프는 100 ms 간격 계산 결과 약 350개만 사용합니다.

- 표본별 `console.log`와 `setState`를 피합니다.
- 중단 시 진동 취소를 먼저 실행하고 구독과 타이머를 해제합니다.
- `AppState`가 `active`를 벗어나면 중단 처리합니다.
- 컴포넌트 해제 시 구독·타이머·진동을 정리합니다.
- 세션 ID로 늦은 콜백을 구별하고 시작 연타를 차단합니다.
- 수집 도중 저장·공유 창을 띄우지 않습니다.
- 표시값이 없는 구간에는 이전 값을 유지하지 않고 그래프를 끊습니다.

정상 종료와 사용자가 누른 중단에서는 현재까지의 기록을 저장합니다. 갑작스러운 프로세스 강제 종료의 복구는 첫 데모의 필수 범위에 포함하지 않습니다.

## 7. 저장과 공유

설치된 Expo SDK에 맞는 FileSystem API로 앱 문서 영역에 JSON을 저장합니다. 사용 중인 SDK의 공식 문서를 확인해 현재 API와 legacy API를 섞지 않습니다.[^files]

공유 버튼에서는 `Sharing.isAvailableAsync()`를 확인하고 `Sharing.shareAsync`로 그 파일을 전달합니다. 공유 취소가 저장 파일 삭제로 이어지지 않게 합니다.[^sharing]

저장에 실패하면 결과를 메모리에 유지하고 재시도 버튼을 보여줍니다. `저장 완료`는 실제 파일 쓰기가 성공한 뒤 표시합니다.

[^accel]: Accelerometer — https://docs.expo.dev/versions/latest/sdk/accelerometer/.
[^vibration]: Vibration — https://reactnative.dev/docs/vibration.
[^devbuild]: Development builds FAQ — https://docs.expo.dev/develop/development-builds/faq/.
[^sensors]: Sensors — https://docs.expo.dev/versions/latest/sdk/sensors/.
[^files]: FileSystem — https://docs.expo.dev/versions/latest/sdk/filesystem/.
[^sharing]: Sharing — https://docs.expo.dev/versions/latest/sdk/sharing/.
