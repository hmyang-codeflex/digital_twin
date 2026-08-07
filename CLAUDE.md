# Flangemaster

Unity 디지털 트윈 프로젝트. Preliy.Flange 기반 산업 로봇 시뮬레이션.

## 핵심 구조

- `RobotTask` (추상) → `Program()` 오버라이드로 태스크 정의, Instruction 리스트를 코루틴 실행
- `Instruction` (추상) → `PTP` / `LIN` / `CIRC` / `VerifyRetryInstruction` 등
- `HoleBoltInspector.IsBoltPresent()` → Physics 기반, 추후 실제 비전으로 교체 가능한 인터페이스
- `GripperEventBridge` → Preliy Gripper + PincherController 래핑
- `VisionHud` → BoltingInspectionTask.Phase를 Scene/Game뷰에 시각화
- `ROS/TrajectoryPlanner` → Unity-ROS TCP Connector, Niryo MoveIt 연동

## 코드 규칙

- 새 태스크는 `RobotTask` 상속 후 `Program()` 오버라이드
- `RobotTask` / `Instruction` 베이스 수정 금지 — 새 `Instruction` 서브클래스로 확장
- `IsPreviewBuild` 플래그 true일 때 로그/검증 출력 금지
- Preliy.Flange API 사용: `Controller`, `Target`, `Solver`, `Gripper`, `Part`
