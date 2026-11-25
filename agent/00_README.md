# Expo 집기 반응 데모 — 설계·구현 전달 문서

**버전:** 1.0 · **작성일:** 2026-11-18  
**구현:** React Native + Expo + TypeScript · **실측 우선 기기:** Android 휴대폰

## 만들려는 데모

휴대폰을 단단한 책상에 놓고 엄지와 검지로 양옆 중앙을 집습니다. 앱에서 진동을 주고, 집기와 힘을 낮추는 동작에 따라 **휴대폰 센서 신호가 어떻게 변하는지** 그래프로 확인합니다.

시작 버튼을 누른 뒤 3초 동안 자세를 잡고 35초간 측정합니다. 결과 화면에서 세 번의 집기 구간을 비교하고, 원본과 결과가 담긴 JSON 파일을 공유합니다. 계산과 저장은 앱 안에서 처리합니다.

## 범위

| 항목 | 첫 데모에서 구현 |
|---|---|
| 앱 | Expo + React Native + TypeScript |
| 실행 | Android 실기기의 Expo Go에서 먼저 시험 |
| 자세 | 책상 위 오른손 엄지–검지 집기 한 가지 |
| 센서 | `expo-sensors`의 가속도계 하나 |
| 진동 | React Native `Vibration` |
| 계산 | 짧은 구간의 가속도 변동 크기와 기준 대비 비율 |
| 화면 | 준비 → 측정 → 결과 |
| 내보내기 | 원본·설정·결과를 담은 JSON 한 파일 |
| 개발 범위 | 화면, 센서, 계산, 저장·공유를 하나의 앱에서 완성 |

첫 버전의 그래프는 **센서 반응 데모**입니다. N·kgf 단위 집게힘은 기준 힘 데이터를 확보한 뒤 후속 모델로 연결합니다. 지금은 안내에 맞춰 집고 풀었을 때 실제 기록이 달라지는지 확인합니다.

## 읽는 순서

| 파일 | 내용 |
|---|---|
| [01_DEMO_AND_PROTOCOL.md](01_DEMO_AND_PROTOCOL.md) | 자세, 시간표, 화면 구성 |
| [02_EXPO_IMPLEMENTATION.md](02_EXPO_IMPLEMENTATION.md) | Expo 패키지, 파일 역할, 실행·중단 처리 |
| [03_SIGNAL_AND_DATA.md](03_SIGNAL_AND_DATA.md) | 계산식, 품질 처리, JSON 형식 |
| [04_ACCEPTANCE.md](04_ACCEPTANCE.md) | 구현 순서, 테스트, 완료 기준 |
| [05_APPENDIX_AND_REFERENCES.md](05_APPENDIX_AND_REFERENCES.md) | 제약, 후속 힘 모델, 출처 |
| [06_CODING_AGENT_PROMPT.md](06_CODING_AGENT_PROMPT.md) | 구현 에이전트에게 전달할 지시문 |

**사용 방법:** 이 폴더 전체를 코딩 에이전트에게 전달하고 06의 지시문으로 시작합니다. 구현 전에 00–04를 읽도록 했습니다.

## Expo Go와 개발 빌드

| 실행 환경 | 용도 |
|---|---|
| Android Expo Go | 첫 데모의 센서 수집·진동·그래프·파일 공유 시험 |
| Expo development build | 기기에서 네이티브 권한 설정을 바꾸거나 고속 센서 수집을 추가할 때 |
| iPhone | 첫 범위에서는 화면 확인·기록 재생; 동일한 연속 진동 실측은 후속 설계 |
| 에뮬레이터·웹 | 화면·계산 테스트·기록 재생 |

React Native의 진동 시간 지정이 Android와 iOS에서 다르므로 첫 실측은 Android로 잡습니다.[^vibration] Expo Go에서 실제 전달되는 센서 속도를 확인하고, 필요한 경우에만 개발 빌드로 진행합니다. 개발 빌드에서도 Expo·React Native 구조를 유지합니다.[^expo]

## 작업 산출물

이 묶음은 구현 명세입니다. 코딩 에이전트의 제출물은 실행 가능한 Expo 프로젝트, 실행 안내, 수행한 검증 결과입니다. 실기기를 사용할 수 있으면 해당 기기의 예시 기록도 제출합니다.

기존 연구계획서는 배경으로만 연결합니다: [집게힘 악력 추정 연구](https://docs.google.com/document/d/1ZLoLRmX9m61ZPAEIbgkB1laiWtJO6kR50wOGSZwDt5M/edit). 이번 문서의 구현 범위는 첫 자세의 가벼운 데모로 한정했습니다.

[^vibration]: Vibration — https://reactnative.dev/docs/vibration.
[^expo]: Development builds FAQ — https://docs.expo.dev/develop/development-builds/faq/.
