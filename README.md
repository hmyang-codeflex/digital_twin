# Flangemaster

Unity 디지털 트윈 + 로봇 임포터(Electron/React) 두 개의 제품으로 구성된 산업 로봇 시뮬레이션 프로젝트입니다.

## 제품 구성

| 제품 | 위치 | 설명 |
| --- | --- | --- |
| **디지털 트윈** | `Assets/Scripts/` | Unity 빌드. 로봇 태스크 실행, 볼트 검사·자동 재시도, 트윈 데이터 발행, 게임 화면 내 런타임 설정 편집 UI. |
| **로봇 임포터** | `tools/robot-importer/` | Electron/React 앱. 로봇·워크파츠 임포트, 실시간 모니터링, 데이터 분석, 세션 리포트, 노코드 태스크 시퀀스 빌더. |

두 제품은 파일 스테이징 폴더와 HTTP 통신으로 연동되지만 독립적으로 실행 가능한 별도 프로그램입니다.

---

## 디지털 트윈 — 핵심 구조

- `RobotTask`(추상) → `Program()` 오버라이드로 태스크 정의, Instruction 리스트를 코루틴 실행
- `Instruction`(추상) → `PTP` / `LIN` / `CIRC` / `VerifyRetryInstruction` 등
- `HoleBoltInspector.IsBoltPresent()` → Physics 기반 볼트 검사 (자립적, 외부 서비스 의존 없음)
- `DigitalTwinEmitter` → 로봇/컨베이어/그리퍼/파츠 상태를 1Hz로 HTTP 발행
- `RobotSelectionUI` + `RuntimeFieldEditor` → 게임 화면에서 오브젝트를 클릭해 태스크 설정(재시도 횟수, 작업 위치 Target 등)을 직접 편집

### 코드 규칙

- 새 태스크는 `RobotTask` 상속 후 `Program()` 오버라이드
- `RobotTask` / `Instruction` 베이스 수정 금지 — 새 `Instruction` 서브클래스로 확장
- Preliy.Flange API 사용: `Controller`, `Target`, `Solver`, `Gripper`, `Part`

---

## 로봇 임포터 — 핵심 구조

- `main.js`(Electron) → 스테이징 폴더 관리, 배포/롤백 IPC, 트윈 데이터 수신 HTTP 서버
- `MonitorPanel` → 실시간 트윈 데이터 시각화, 오브젝트 선택 필터
- `LogPanel` / `ReportPanel` → 사이클타임·스텝별 통계·재시도 이력 분석 및 리포트
- `SequenceBuilderPanel` → 코드 없이 로봇 동작 시퀀스(JSON) 구성
- `teachingExport.js` → RAPID/KRL/JBI/KAS 로봇 티칭 코드 및 PLC JSON 추출

---

## GS 인증 참고 — 기능별 검증 상태

인증 신청 시 아래 구분을 참고하세요. "조건부"로 표시된 기능은 사람의 수동 개입이나 특정 전제조건이 있어 자동/독립 동작을 보장하지 않습니다.

### 확실히 동작 (자립적, 외부 서비스 비의존)
- 로봇 모션 오케스트레이션 코어 (RobotTask, PTP, LIN, CIRC)
- 볼트 검사 (HoleBoltInspector — 물리 콜라이더 기반)
- 볼트 검사 + 자동 재시도 (BoltingInspectionTask, VerifyRetryInstruction) — 단, 아래 IBoltInspector 구성에 한함
- 디지털 트윈 데이터 발행/모니터링/데이터 분석/세션 리포트/재시도 이력 추적 (Electron 쪽)
- 게임 화면 내 런타임 태스크 설정 편집 (RuntimeFieldEditor)

### 조건부 — 문서에 전제조건 명시 필요
- **로봇/워크파츠 임포트→배포**: URDF 자동 임포트 후 DH 파라미터 등 일부 값은 사람이 수동 보정해야 합니다.
- **노코드 시퀀스 빌더**: 타겟 이름을 문자열로 정확히 입력해야 하며, 오타 시 실패합니다.
- **로봇 티칭 코드 추출**: 텍스트 변환기로서 완성돼 있으나, 실제 로봇 컨트롤러(가와사키/KUKA/ABB/야스카와)에서의 실기 문법 검증은 이뤄지지 않았습니다.
- **RobotSelectionUI**: realvirtual 애셋(OutlineSelectionManager 등)에 일부 의존하므로, 씬에 해당 컴포넌트가 없으면 하이라이트 기능이 비활성화됩니다.

### 제외 권장 — GS 인증 신청 범위에 포함하지 마세요
- **AiInspector, SceneCaptureInspector**: 외부 AI 서비스(torque_server, Roboflow API)에 의존합니다. 서버가 꺼져 있거나 API 키가 없으면 **무작위(random) 판정**을 반환하므로 "확실히 동작"이라는 인증 기준에 부합하지 않습니다. `BoltingInspectionTask`의 Inspector 슬롯에는 반드시 `HoleBoltInspector`만 연결한 구성으로 인증을 진행하세요.
- **VisionHud**: 실제 판정 로직이 아니라 판정 결과를 시각적으로 "그럴듯하게" 보여주는 연출 전용 UI입니다.

---

## 대용량 파일 안내

`tools/robot-importer/public/models/`의 `.fbx` 모델 중 일부는 GitHub 권장 용량(50MB)을 초과합니다. 앞으로 추가되는 대용량 애셋(`.fbx`, `.glb`, `.gltf`, `.wasm`, `.psd`)은 `.gitattributes`를 통해 Git LFS로 관리되도록 설정돼 있습니다. 단, 이미 커밋된 기존 파일은 이 설정만으로 자동 전환되지 않으며, 필요 시 `git lfs migrate`로 별도 히스토리 재작성이 필요합니다.
