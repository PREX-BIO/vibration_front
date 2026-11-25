# 05. 논문 근거와 데모의 경계

## A. 논문에서 확인한 변환 과정

**「Smartphone Vibrometric Force Estimation for Grip Related Strength Measurements」**의 절대 힘 모델은 다음 구조입니다.[^vfe]

| 단계 | 논문의 방법 |
|---|---|
| 기준 데이터 | Pixel 4 신호와 검지 접점의 힘 센서를 함께 기록 |
| 신호 처리 | 136 Hz 중심·10 Hz 폭의 4차 Butterworth 대역통과, 진폭 포락선 추출 |
| 특징 | 가속도·자이로 6축과 각 3축의 크기 특징 |
| 모델 | StandardScaler 후 Ridge 회귀 |
| 힘 단위 | 절대 힘을 lb로 변환해 모델링 |
| 평가 | 세션을 분리한 교차 검증 |

확인한 HTML·PDF 본문에는 앱에 바로 넣을 **학습된 가중치, 절편, 표준화 평균·스케일의 수치 묶음**이 제시되어 있지 않습니다. 따라서 이번 전달물은 모델 구조를 참고하고 시연 계수는 별도로 정의합니다. 공개된 모든 저장소에 계수가 없다는 의미로 확대하지 않습니다.

## B. 이번 데모에서 정한 부분

| 항목 | 출처·성격 |
|---|---|
| 특징에서 회귀식으로 힘을 예측하는 구조 | 논문 참고 |
| 현재 가속도 RMS 비율 한 개 사용 | 기존 아이폰 앱을 활용하는 자체 설계 |
| 가중치 5, 절편 1, 평균 1, 스케일 1 | 사용자 요청에 따라 정한 임시 값 |
| 0–15 kgf 표시 범위 | 데모 화면용 범위 |
| 세 번의 중앙값 표시 | 자체 UI·요약 설계 |

현재 RMS가 증가할 때 출력이 증가하도록 양의 가중치를 정했습니다. 이는 **데모의 입력·출력 동작을 정한 것**이며, 진동 감쇠의 물리법칙이나 검증된 힘의 방향을 주장하는 것이 아닙니다.

가볍게 접촉한 기준에 1 kgf를 부여하는 것도 시연용 가정입니다. 현재 앱의 기준 정규화만으로 개인별 절대 힘의 기준이 생기는 것은 아닙니다.

## C. 현재 신호의 해석

현재 앱은 iOS 펄스 진동과 약 100 Hz 가속도 표본을 사용합니다. 500 ms RMS에는 진동 외의 움직임도 포함됩니다. 100 Hz 표본에서 논문의 136 Hz 대역 처리를 그대로 재현할 수 없으므로 해당 필터를 복사해 넣지 않습니다.

`weak_motor_response`는 현재 데이터의 해석 메모로 보존합니다. 이번 데모에서는 계산 가능한 센서 특징에 임시 모델을 적용해 kgf를 보여줍니다. 모델의 검증 여부는 `kind=demo`로 구분합니다.

맥에서 Core Haptics를 연결하는 별도 개발 빌드는 연속 진동을 연구할 때 검토할 수 있습니다. **이번 보완의 완료 조건은 현재 Expo Go 앱에서 임시 모델 출력까지 연결하는 것**입니다.

## D. 실제 모델로 교체할 때

후속 실험에서 실제 접점 힘과 센서 특징을 함께 모아 모델을 학습합니다. 학습된 모델에는 가중치뿐 아니라 특징 순서·단위·표준화 값·기기와 자세 조건도 함께 저장합니다.

현재의 한 특징을 계속 사용할지, 원본 진폭·다른 센서·펄스별 특징을 추가할지는 그 데이터로 결정합니다. 논문처럼 다른 특징 구성을 선택하면 특징 추출부도 함께 바뀌어야 합니다. 가중치 파일만 바꾸면 모든 기기·자세에 맞는 것은 아닙니다.

개인·세션을 분리해 성능을 검증한 이후에만 `trained` 모델로 표시합니다. 현재의 임시 숫자를 학습용 정답으로 되먹이지 않습니다.

## E. 참고문헌

[^vfe]: Smartphone Vibrometric Force Estimation for Grip Related Strength Measurements — https://arxiv.org/html/2512.03186v2. 방법: II-A 및 II-B, PDF: https://arxiv.org/pdf/2512.03186v2.
[^ridge]: Ridge — https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html.
[^scaler]: StandardScaler — https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html.

회귀식의 일반적 형태와 표준화는 Ridge[^ridge]와 StandardScaler[^scaler] 공식 문서를 함께 참고했습니다. 논문은 방법론, 모델 설정 파일은 우리 데모의 값을 기록하는 자료입니다.
