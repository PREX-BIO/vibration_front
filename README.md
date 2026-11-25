# Vibration · 진동 신호 감소율 관찰

[31초 수정 명세 v4](agent/DAMPING_MEASUREMENT_SPEC_31S.md)를 구현한 React Native / Expo 앱입니다.
현재 측정 경로는 31초 동안 가속도와 각속도를 함께 기록하고, 고정 기준 대비 가속도 변동의
감소율 `D = 100 × (1 − A / A₀)`를 표시합니다. 음수는 관측 신호 증가를 뜻합니다.
이전 임시 힘 환산과 대표 kgf는 현재 측정 화면·v4 저장 데이터에서 제거했습니다.

## 실행

측정 준비 화면에서 다음 환경을 선택합니다. 선택값은 측정 JSON의 `setup`에 기록되며,
결과 화면과 JSON 불러오기에서도 확인할 수 있습니다. 다시 측정할 때는 선택을 유지합니다.

| 항목        | 선택                                                           | JSON 필드                                                                                          |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 화면 방향   | 화면이 위로 / 아래로                                           | `orientation`: `screen_up_top_away` / `screen_down_top_away`                                       |
| 케이스 재질 | 케이스 없음 / 플라스틱 / 고무                                  | `case_material`: `none` / `plastic` / `rubber`                                                     |
| 받침 종류   | 책상 / 바닥                                                    | `surface_type`: `desk` / `floor`                                                                   |
| 받침 재질   | 목재 / 철재·금속 / 유리 / 석재 / 타일 / 장판 / 콘크리트 / 기타 | `surface_material`: `wood` / `metal` / `glass` / `stone` / `tile` / `vinyl` / `concrete` / `other` |
| 환경 메모   | 기타 재질·특이사항                                             | `note`                                                                                             |

`case_on`은 케이스 재질에서 계산합니다. 이전 필드인 `table_material`은 책상일 때 재질을
기록하고 바닥일 때는 `null`로 남깁니다. 기존 JSON에 없는 케이스 재질은 임의로 채우지 않습니다.
화면이 아래로 향하는 조건은 측정 시작 후 준비 3초 동안 뒤집어 놓도록 안내합니다.
화면은 밝은 중립 배경을 사용하며 감소율은 파랑, 가속도는 청록, 각속도는 주황으로 구분합니다.

Expo SDK **58.0.26**, React Native **0.88.1**, React **19.3.0**을 유지합니다.
Node.js 24 LTS와 npm을 사용합니다.

```sh
npm install
# Android Expo Go에서 QR 코드로 실행
npm start
# iPhone에 연속 진동 모듈을 포함한 앱 빌드·설치
npm run build:ios
# Android도 별도 앱으로 빌드·설치하려면
npm run build:android
# 이전 번들이 남아 있다면
npm run start:clear
```

- **Android:** Expo Go 또는 직접 빌드한 앱에서 측정합니다. 기본 `Vibration.vibrate(25000, false)`가
  하나의 연속 진동을 요청하며, `android.permission.VIBRATE`는 앱 설정에 포함되어 있습니다.
  모든 기기는 기본 방식으로 시작합니다. 진동이 중간에 끊기면 준비 화면에서 **파형 1회**를 선택해 다시 측정합니다.
  별도 앱 빌드에는 Android SDK·JDK와 USB 디버깅을 켠 기기가 필요합니다.
- **iPhone:** 로컬 Core Haptics 모듈을 포함해 빌드한 앱에서 측정합니다. iOS Expo Go에는 해당 모듈이
  없어 연속 진동을 실행할 수 없습니다. 정상 작동하는 Xcode·CocoaPods와 기기 서명이 필요합니다.
  본인 기기 테스트는 무료 Apple 계정의 Personal Team으로 가능하며, 무료 서명은 7일 후 재설치가 필요합니다.
- **웹·시뮬레이터:** **합성 시험 보기**와 **저장한 JSON 불러오기**를 사용합니다.

[React Native 진동 API](https://reactnative.dev/docs/vibration),
[Expo 로컬 모듈 안내](https://docs.expo.dev/modules/get-started/),
[Apple Personal Team 안내](https://developer.apple.com/help/account/basics/about-your-developer-account/)

## Mac·유료 Apple 멤버십 없는 사용자의 iPhone 테스트

레포의 GitHub Actions가 **서명 전 Release IPA**를 만들고, 각 사용자는 Windows 또는 Mac의
[Sideloadly](https://sideloadly.io/)에서 **본인의 무료 Apple 계정**으로 서명·설치합니다.
JavaScript와 로컬 Core Haptics 모듈이 앱에 포함되므로 설치 후 Metro 연결은 필요 없습니다.
Apple 계정·비밀번호·인증서·프로비저닝 프로파일을 GitHub Secrets에 등록할 필요가 없습니다.

### 개발자: 코드 수정부터 IPA 전달까지

1. **자동 빌드 설정을 브랜치에 반영합니다.**
   `.github/workflows/ios-unsigned.yml`은 모든 브랜치의 push에서 실행됩니다.
   `main`, `develop`, `feature/이름`, `fix/이름` 모두 포함하며 문서만 수정해도 빌드합니다.
   태그 push는 자동 빌드 대상이 아닙니다. 기존 브랜치에는 이 변경을 merge 또는 cherry-pick으로
   반영해야 합니다. 새 브랜치는 변경이 포함된 `main`에서 만들면 됩니다.
2. **작업 브랜치에서 코드를 수정하고 검사합니다.**
   파일을 저장하고 `npm run check`를 실행해 타입·테스트·린트·포맷을 확인합니다.
   로컬에서 수정만 한 상태로는 GitHub 빌드에 포함되지 않습니다.
3. **수정한 파일을 커밋하고 작업 브랜치에 push합니다.**
   최초 브랜치 push는 `git push -u origin HEAD`, 이후에는 `git push`를 사용합니다.
   브랜치를 `main`에 합치지 않아도 그 브랜치의 코드로 자동 빌드합니다.
4. **GitHub에서 실행과 브랜치를 확인합니다.**
   [레포 Actions](https://github.com/PREX-BIO/vibration_front/actions) →
   **Build iOS IPA (unsigned)** → **iOS IPA · 브랜치명 · #실행번호**를 선택합니다.
   테스트하려는 브랜치·커밋이 맞는지 확인하고 초록색 성공 표시를 기다립니다.
   같은 브랜치에 연달아 push하면 진행 중이던 이전 빌드를 취소하고 최신 빌드를 실행합니다.
   다른 브랜치의 빌드는 서로 취소하지 않습니다.
5. **성공한 실행의 IPA를 다운로드합니다.**
   실행 화면 아래 **Artifacts → Vibration-iOS-unsigned-실행번호**를 내려받고 ZIP을 풉니다.
   안에 있는 `Vibration-unsigned.ipa`가 설치 파일입니다. `.ipa` 자체는 압축을 풀지 않습니다.
   `Vibration-iOS-logs-실행번호`는 설치 파일이 아닌 문제 확인용 로그입니다.
6. **팀원에게 IPA와 빌드 정보를 함께 전달합니다.**
   브랜치명·실행번호·수정 내용을 같이 전달하면 어떤 버전을 테스트하는지 구분할 수 있습니다.
   Artifacts 직접 다운로드에는 GitHub 로그인과 레포 읽기 권한이 필요합니다.
   GitHub 계정 없는 테스터에게는 소유자가 내려받은 IPA 파일을 전달하면 됩니다.

수동 실행은 **Actions → Build iOS IPA (unsigned) → Run workflow → Branch 선택 → Run workflow**입니다.
버튼이 없으면 워크플로 파일이 기본 브랜치에 올라갔는지 확인합니다.
선택한 브랜치에도 워크플로 파일이 있어야 합니다.
워크플로가 차단되면 레포 **Settings → Actions → General**에서 Actions 및
`actions/checkout`, `actions/setup-node`, `actions/upload-artifact` 실행이 허용되는지 확인합니다.

### 테스터: 최초 설치

1. [Sideloadly 공식 사이트](https://sideloadly.io/)에서 Windows 또는 Mac용 프로그램을 설치합니다.
   Windows는 공식 사이트가 안내하는 웹 설치판 iTunes·iCloud 구성 요소도 설치합니다.
2. 잠금을 해제한 iPhone을 데이터 전송 가능한 USB 케이블로 연결하고 **이 컴퓨터를 신뢰**를 선택합니다.
   Sideloadly의 기기 목록에 iPhone이 표시되는지 확인합니다.
3. Sideloadly에서 iPhone을 선택하고 `Vibration-unsigned.ipa`를 넣습니다.
   본인의 무료 Apple 계정으로 로그인한 뒤 **Start**를 누릅니다. 암호·2단계 인증 요청에 응답하고
   설치 완료를 기다립니다. 팀원마다 자신의 계정으로 설치합니다.
4. iPhone **설정 → 개인정보 보호 및 보안 → 개발자 모드**를 켜고 재시동 안내를 따릅니다.
   **설정 → 일반 → VPN 및 기기 관리**에서 본인 계정의 개발자 앱을 신뢰합니다.
5. **Vibration**을 실행하고 진동 시험·측정을 진행합니다. Expo Go나 `npm start`는 필요 없습니다.

이 파일은 서명 전 IPA이므로 iPhone의 Safari에서 파일을 누르는 것만으로 설치되지는 않습니다.

### 수정한 버전으로 업데이트

1. 새 빌드의 IPA를 다운로드하거나 개발자에게 전달받습니다.
2. Sideloadly에 새 IPA를 넣고 **이전과 같은 Apple 계정·번들 ID**로 **Start**를 누릅니다.
   기존 앱을 삭제하지 않고 덮어 설치합니다. 중요한 측정 기록은 앱의 JSON 공유로 별도 보관합니다.
3. 설치가 끝나면 iPhone에서 Vibration을 다시 실행해 변경 내용을 확인합니다.

현재 배포 방식은 Release IPA이므로 JavaScript·화면 수정도 새 IPA 설치 후 반영됩니다.
브랜치가 달라도 번들 ID는 같으므로, 마지막으로 설치한 빌드가 기존 Vibration 앱을 교체합니다.
자동 갱신을 쓰고 있다면 새 IPA를 설치할 때도 자동 갱신 옵션을 켜 둡니다.
Sideloadly가 갱신 대상으로 보관하는 IPA도 새 버전으로 업데이트됩니다.

### 무료 Apple 계정의 7일 서명 갱신

**설치/재서명 시점부터 약 7일 동안 앱을 실행할 수 있습니다.** 기한이 지나면 다시 서명·설치해야 합니다.
팀원마다 설치한 시각이 다르므로 만료 시점도 다릅니다. 코드가 바뀌지 않았다면 **새 GitHub 빌드는 필요 없습니다.**

수동 갱신은 다음 순서입니다.

1. 이전에 설치한 IPA 파일을 PC에 보관합니다.
2. 만료되기 전, 예를 들어 설치 5~6일 뒤에 iPhone을 PC에 연결합니다.
3. Sideloadly에서 같은 IPA·같은 Apple 계정·같은 번들 ID로 **Start**를 누릅니다.
4. 다시 서명·설치가 완료되면 그 시점부터 다시 약 7일 동안 사용할 수 있습니다.
   이미 만료되어 앱이 열리지 않아도 같은 방법으로 갱신합니다. 앱을 삭제할 필요는 없습니다.

자동 갱신을 사용하려면 Sideloadly의 자동 갱신 옵션을 켜고 설치합니다.
갱신 시에는 **PC가 켜져 있고 잠들지 않아야 하며, Sideloadly Daemon이 실행 중**이어야 합니다.
아이폰도 USB로 연결되어 있거나, 최초 USB 페어링·Wi-Fi 동기화 설정 후 PC와 같은 네트워크에 있어야 합니다.
Windows의 Wi-Fi 동기화는 iTunes의 기기 **요약 → 옵션 → Wi-Fi로 이 iPhone 동기화 → 적용**에서 설정합니다.
Mac은 Finder에서 기기를 선택해 **일반 → Wi-Fi에 연결되어 있을 때 이 iPhone 보기 → 적용**을 사용합니다.
PC가 꺼져 있거나 기기를 찾지 못하면 자동 갱신이 진행되지 않으므로 갱신 성공 여부를 확인합니다.
갱신 후 앱을 사용하는 동안에는 PC 연결이 필요 없습니다.

| 구분                       | 기준 시점                | 7일이 지나면                  | 필요한 작업                                              |
| -------------------------- | ------------------------ | ----------------------------- | -------------------------------------------------------- |
| GitHub Artifacts 보관 기간 | 빌드 결과물 업로드       | GitHub 다운로드 파일이 만료됨 | IPA를 이미 PC에 보관했다면 그대로 사용. 없으면 다시 빌드 |
| 무료 Apple 계정 서명 기간  | 각 기기에 서명·설치/갱신 | 설치된 앱이 실행되지 않음     | 기존 IPA를 다시 서명·설치. 새 빌드는 불필요              |

무료 계정의 동시 사이드로드 앱 수는 3개로 제한됩니다.

### 빌드 환경과 문제 확인

워크플로는 Node.js 24, 표준 `xcode-27` macOS 러너의 Xcode 27.2를 사용합니다.
`npm ci` → `npm run check` → Expo Prebuild → CocoaPods → 서명 없는 Release 빌드 → IPA 포장 순서입니다.
`ios/`는 저장소에 올리지 않고 매번 생성하며, 로컬 모듈과 config plugin을 적용합니다.
Apple 서명은 끄고 실제 기기용 arm64 실행 파일·JS 번들·진동 모듈 등록을 검사합니다.
빌드 실패 시 해당 실행의 실패 단계와 **Vibration-iOS-logs-실행번호**를 확인합니다.
GitHub의 성공 표시는 빌드·포장 성공이며, 각 iPhone의 무료 계정 서명·실행은 별도 확인해야 합니다.

Mac에서 같은 IPA 생성 과정을 확인하려면, 기존 iOS 프로젝트와 Pods가 있는 상태에서 실행합니다.

```sh
npm run build:ios:unsigned
# 결과: .test-build/ios-unsigned/Vibration-unsigned.ipa
```

[GitHub 수동 실행 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[러너 및 사용량 안내](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Sideloadly 설치·갱신 안내](https://sideloadly.io/faq)

## 사용 순서

1. 휴대폰을 책상에 화면이 위로 향하게 놓고, 오른손 검지·엄지를 양옆 중앙에 댑니다.
2. 책상 재질·케이스를 선택하고 **진동 시험 → 네, 느껴졌어요**를 누릅니다.
3. **측정 시작** 후 3초 준비를 거쳐 31초 동안 자동 안내를 따릅니다.
4. 각 5초 동작의 처음 2초는 천천히 힘을 바꾸고, 나머지 3초는 유지합니다.
5. 결과 그래프를 누르거나 드래그해 감소율·가속도·각속도를 같은 분석 창에서 확인합니다.
6. **원본·측정 상세**에서 x/y/z 원본, 축별 평균·RMS, 선택 가능한 0.5초 상세 그래프를 봅니다.
7. **JSON 저장·공유**로 iOS·Android 공유 창을 열고 저장하거나 다른 앱으로 보냅니다. 웹은 JSON 다운로드입니다.

| 기록 시간 | 동작                             |
| --------- | -------------------------------- |
| 0–3초     | 진동 OFF · 접촉 유지             |
| 3–8초     | 진동 ON · 기준 접촉              |
| 8–13초    | 약하게 집기 · 주관적 노력 2/10   |
| 13–18초   | 중간으로 집기 · 주관적 노력 4/10 |
| 18–23초   | 더 세게 집기 · 주관적 노력 6/10  |
| 23–28초   | 힘 풀고 접촉 유지                |
| 28–31초   | 진동 OFF · 종료 기록             |

2/10·4/10·6/10은 주관적 동작 안내입니다. 측정 시각 **0–3초는 꺼짐, 3–28초는 25초 연속 진동,
28초부터는 꺼짐**입니다. iOS는 Core Haptics의 `hapticContinuous`, Android 기본 방식은 진동 API의
단일 재생 시간을 한 번 요청하고 구간이 바뀔 때 재시작하지 않습니다. iOS는 준비한 엔진에 기록 시작 시 3–28초 재생을 미리 예약합니다. Android의 시작 지연은
28초까지 남은 시간만 요청합니다. 두 플랫폼 모두 중단·배경 전환·Android 뒤로 가기 시 취소합니다.
3초 준비 카운트다운은 측정 시각에 포함하지 않습니다. 시작 버튼부터 정상 완료까지는 준비를 합쳐 약 34초입니다.
실제 모터 발생 시각은 검증하지 않으며 진동 띠에는 예약 구간과 엔진 중단 통지 수신 시각을 표시합니다.

Android 준비 화면의 **진동 방식**에서 두 가지 중 하나를 선택합니다.

- **기본 방식 (처음 선택됨):** 25초 재생 시간을 한 번 요청합니다. 기종과 관계없이 이 방식으로 먼저 측정합니다.
- **파형 1회:** 기본 방식에서 진동이 먼저 끊기는 경우 선택합니다. 휴지 0ms로 연결한 25초 분량의 파형을 한 번 전달합니다. 정상 시작 시 `Vibration.vibrate([0, 8000, 0, 8000, 0, 8000, 0, 1000], false)`이며 Android가 전체 파형을 재생합니다.

선택은 측정을 시작할 때 고정되며 측정 도중 자동 전환하지 않습니다. ‘다시 측정’을 누르면 선택한 방식을 유지하므로
파형 1회로 반복 측정할 수 있습니다. 앱을 새로 열면 기본 방식으로 시작합니다. S10e·버디3 기종별 자동 예외,
8초마다 재요청, 무휴지 반복은 새 측정에서 사용하지 않습니다.

두 방식 모두 측정 3초부터 진동을 요청하고 28초에 취소하며 31초에 측정을 마칩니다. 시작이 지연되면 28초까지 남은 시간만
요청합니다. 중단·배경 전환·뒤로 가기·화면 이탈 시에도 취소합니다. 파형 1회는 반복 플래그를 켜지 않고 자체 재생 길이를 갖습니다.
진동 세기는 기존 기본 진폭을 사용합니다. 실제 연속 진동 여부는 기기별로 확인하며, 800ms 진동 시험은 시작 여부만 확인합니다.

Expo Go에서도 파형 1회를 사용할 수 있으며 새 네이티브 모듈 설치는 필요하지 않습니다. React Native의 배열 요청은 Android의
`VibrationEffect.createWaveform`으로 전달됩니다. [React Native Vibration](https://reactnative.dev/docs/vibration),
[Android 파형 API](<https://developer.android.com/reference/android/os/VibrationEffect#createWaveform(long[],%20int)>).

JSON에는 감지 모델(`device.detected_model`)과 실제 요청을 남깁니다. 기본 방식은 `pattern: null`,
파형 1회는 `android_waveform: { mode: "once", segment_ms: 8000, pause_ms: 0 }`과 실제 `pattern`을 저장합니다.
새 측정의 `repeat`는 항상 `false`이며 `duration_ms`는 실제 요청 길이, `duration_s: 25`는 예정 진동 구간입니다.
과거 재요청(`android_renewal`)·무휴지 반복(`android_waveform.mode: "repeat"`) JSON도 당시 설정과 이벤트를 그대로 재생합니다.

iOS intensity는 사용자의 기존 세기 복구 요청에 따라 **1.0**, sharpness는 **0.5**입니다.
현재 세기 설정 ID는 `continuous_i1.0_s0.5_v1`이며, 과거 0.5 기록은 당시 값으로 재생합니다.
엔진 완료·중단·리셋 이벤트와 원래 네이티브 시각, JS 응답 수신 시각을 따로 저장합니다.
네이티브 예약 시각은 요청 앵커로 세션 축에 변환하며 왕복 시간도 남깁니다. 물리적 시작 확인으로 간주하지 않습니다.
엔진 중단·리셋·재생 실패 또는 완료 미확인은 부분 기록으로 종료합니다. 250ms를 넘는 예약·안내 지연은
`timing_mismatch`로 구간 비교를 무효화하지만 계산 가능한 관측 곡선과 원본은 보존합니다.

## 계산·시간·품질

- 두 센서에 각각 10 ms를 요청합니다. 원본 시각은 센서 timestamp(s)와 JS 수신 상대시각(ms)을 함께 저장합니다.
- Android 요청 속도는 100 Hz이므로 200 Hz 초과용 센서 권한은 추가하지 않습니다. 기기별 실제 수신 속도는 별도로 검사합니다.
- 메인 창은 `[t−2000,t)` ms, 갱신은 100 ms입니다. 두 센서는 같은 수신 창에서 독립적으로 계산합니다.
- A는 각 축 평균을 제거한 3축 가속도 AC RMS입니다. JSON은 g, 화면은 mg(가속도 단위)입니다.
- Ω는 평균을 제거하지 않은 각속도 벡터 크기의 RMS입니다. 자이로 AC RMS도 별도로 저장합니다.
- 기준 A₀는 실제 `light_ref` 구간 시작+2초부터 끝까지 완전히 포함된 유효 창 A의 중앙값입니다.
  계획대로 진행하면 5–8초 원본 범위, 창 끝 7–8초의 11개 창이며 8초에 확정합니다.
- OFF 구간은 처음 0.5초만 제외하여 각각 6개 창, 각 5초 동작은 처음 2초를 제외하여 11개 창을 요약합니다.
- 정상 31초 기록의 메인 특징은 창 끝 2–31초, 총 291개입니다.
- 실제 안내 전환 시각으로 원본 구간·창 문맥·요약 범위를 정합니다. 타이머가 건너뛴 안내는 실행된 것처럼 기록하지 않습니다.
- 기준 확정 전에는 A와 Ω를 표시합니다. 확정 후 과거 창도 같은 A₀로 다시 계산하며 이후 접촉 구간에서 재보정하지 않습니다.
- 진동 꺼짐은 회색, 준비·전환은 점선으로 표시합니다. 이 구간도 유효한 산술 감소율과 원본은 보존합니다.
- 감소율을 0–100으로 제한하거나 세 강도의 결과를 강도 순으로 보정하지 않습니다. 대표 감소율 하나로 합치지 않습니다.
- 센서별로 표본 80개, 수신 범위 1800 ms, native 최대 간격 100 ms, 수신 최대 간격 250 ms,
  관측 속도 50 Hz 기준을 적용합니다. 누락 timestamp·중복·역순·비유한 축 값도 검사합니다.
- 자이로가 미지원·권한 없음·누락이어도 유효한 가속도 감소율은 유지합니다. 누락은 null과 이유로 남깁니다.
- 구간별 안정 창이 80% 이상 유효할 때 중앙값·P25·P75를 제공합니다. 분위수는 `(n−1)p` 선형 보간입니다.
- 기준 CV는 모집단 표준편차(`ddof=0`)를 사용합니다. 약한 진동 응답·기준 변동·이동·추가 접촉 메모는 수치를 삭제하지 않습니다.
- 원본 버퍼는 구간 전환 시 초기화하지 않습니다. 100 ms 시계에서 화면에 전달하며 종료 지연 시 실제 종료까지의 원본을 보존합니다.

예를 들어 A₀=2 mg일 때 A=1.2/2/2.6 mg는 각각 +40/0/−30%입니다. 이는 관측 가속도 변동의
비교이며 모터만 분리한 값이나 기계적 감쇠비가 아닙니다.

## 저장·재생

v4 파일은 `damping_YYYYMMDDTHHMMSSZ_<sessionId>.json`입니다.

- `schema_version=4.0`
- `protocol_version=expo_desk_pinch_continuous_31s_v1`
- `analysis_version=accel_ac_rms_2s_continuous_31s_v1`
- `metric_scope=observed_acceleration_variation`, `motor_isolation=not_established`
- 세션 실제/계획 길이, 기기·센서 지원/권한, 자세·환경, 전체 분석 설정
- 실제 구간 전환·진동 명령·timestamp reset·누락·중단 이벤트
- 플랫폼에 맞는 `vibration_mode`와 진동 API·요청 시간·실제 요청 성공 여부
- 두 센서 전체 원본, 고정 기준과 사용 frame ID, UI에서 쓰는 2초 특징 배열, 구간별 요약
- 사용자 이동·추가 접촉 관찰(미응답 null)

네이티브는 앱 문서 영역의 `damping-sessions/`에 임시 파일을 쓴 뒤 최종 파일로 이동합니다.
내부 파일 생성 완료와 사용자의 외부 파일 저장 완료를 구분합니다. 공유 취소 후에도 기록은 남습니다.
웹은 큰 원본을 보존하기 위해 IndexedDB에 저장한 뒤 다운로드를 제공합니다.

수동 중단·배경 전환·화면 이탈은 `aborted`와 사유를 기록합니다. 진동 취소를 먼저 시도하고 자신의
센서 구독과 타이머만 정리합니다. 마지막 불완전한 2초 창은 일반 특징으로 만들지 않고 원본만 남깁니다.
준비 카운트다운 취소는 세션 파일을 만들지 않습니다. 프로세스 강제 종료 복구는 포함하지 않습니다.

**JSON 불러오기**는 원본을 덮어쓰지 않고 새 ID의 `replay` 기록을 만듭니다. v3/v4는 저장된 설정과 실제
시각으로 재계산합니다. 이전 v1/v2의 35초 파일은 원래 프로토콜·35초 시간축을 유지하고, 2초 분석을
적용한 별도 결과로 저장합니다. `source_session_id`, 원본 스키마·분석 버전을 남기고 없는 각속도는 만들지 않습니다.
이전 기준 구간이 새 창 조건을 충족하지 않으면 감소율은 비우며 원본·A를 유지합니다.

제공된 이전 실측 파일을 새 분석으로 읽은 예시는 [별도 재생 JSON](artifacts/shared-record-damping-v3.json)에 있습니다.
이 기록은 실제 안내 경계와 2초 창 정렬상 기준에 포함되는 창이 없어 감소율이 null입니다. 이전 v2 재계산
산출물은 변경하지 않았습니다. 새 31초 기록은 v4로 저장합니다. 과거 72초 v3 파일은 자체 시간표와 분석 버전을 유지합니다.

## 코드와 검증

```text
src/config/dampingProtocol.ts  # 31초 시간표·고정 분석 설정
src/types/damping.ts           # v4 원본·특징·요약 계약 및 구버전 호환
src/lib/dampingController.ts   # 두 센서 수집·실제 안내·진동·중단
src/lib/dampingSignal.ts       # 순수 RMS·품질·기준·감소율·분위수
src/lib/dampingReplay.ts       # 합성 시험·v3/v4 재생·이전 파일 변환
src/lib/dampingChart.ts        # 공통 frame 선택·누락/문맥별 그래프 분리
src/components/DampingCharts.tsx # 세 그래프·명령 띠·원본 축 그래프
src/hooks/usePinchSession.ts   # Expo 센서·권한·수명주기·저장
src/lib/continuousVibration.ts # iOS Core Haptics / Android Vibration 연결
src/lib/continuousVibrationDriver.ts # 플랫폼별 연속 진동 준비·실행·취소
modules/continuous-vibration/  # iOS Core Haptics 연속 진동·취소
src/screens/PinchDemoScreen.tsx # 준비·진행·결과·탐색 화면
src/lib/sessionFile*.ts        # 네이티브/웹 저장·내보내기
```

이전 `sessionController.ts`, `signal.ts`, 힘 모델 파일은 기존 기록 호환 및 회귀 테스트용으로 남아 있습니다.
현재 실측은 `DampingController`와 `dampingSignal`을 사용합니다.
iOS 프로토콜은 `ios_core_haptics_continuous` 모드로만 완료 처리합니다. Android는 같은 시간표를
`expo_desk_pinch_continuous_31s_android_v1`로 구분해 저장하며 iOS 측정으로 표시하지 않습니다.

네이티브 모듈 API도 변경했으므로 이번 수정은 Metro 새로고침만으로 적용되지 않습니다.
Xcode의 기존 `ios/Vibration.xcworkspace`에서 iPhone을 선택하고 ⌘R로 다시 빌드·설치하세요.
빌드 스크립트 호환 설정은 로컬 Expo config plugin으로 유지합니다.

```sh
npm run check  # 타입 검사 + 테스트 + ESLint + Prettier
npm run export # iOS·Android·웹 JS 번들 생성
npm run web    # 웹에서 합성 시험·재생 화면 확인
```

현재 검증: 기존 호환 테스트, +40/0/−30% 계산, 31초 두 센서 연속 수집,
실제 전환 지연·종료 지연, 기준 고정, 센서별 누락, 중단 정리, JSON 원본 재계산 일치.
두 플랫폼의 3초 시작·28초 종료, 지연 시작 시 남은 재생 시간, 배경 전환·Android 뒤로 가기 취소를 검사합니다.
모든 Android 기종의 기본 방식 시작, 파형 1회 선택·전환, 연속 재측정, 지연·중단·JSON 재생을 검사합니다.
제거한 시험 선택값이 남아 있어도 기본 방식으로 처리하며, 과거 재요청·무휴지 반복 JSON 호환성도 검사합니다.
합성 시험은 계산 검증용 신호이며 모터의 물리적 응답을 모사하지 않습니다.
실제 iPhone·Android의 연속 진동 체감·센서·권한·네이티브 공유 동작은 직접 확인하지 않았습니다.
