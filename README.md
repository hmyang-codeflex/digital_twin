# Flangemaster DB Export

Unity 디지털 트윈(Flangemaster)에서 내보낸 데이터 패키지입니다.
`DigitalTwinEmitter.cs`가 1Hz로 브로드캐스트한 로봇 상태·컨베이어·그리퍼·파츠·볼트 검사 데이터를 MySQL 호환 형식으로 저장합니다.

---

## 파일 목록

| 파일                    | 설명                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `schema.sql`          | DB 생성 + 테이블 DDL.**가장 먼저 실행**                |
| `sessions.csv`        | 세션 메타데이터 (시작·종료 시각, 프레임 수)                 |
| `robot_frames.csv`    | 로봇별 1Hz 상태 (관절각, TCP, 베이스 포즈, 온도, 전력, 토크) |
| `conveyor_frames.csv` | 컨베이어별 1Hz 상태 (속도, 전류)                             |
| `gripper_frames.csv`  | 그리퍼별 1Hz 상태 (파지 여부, 파지력, 열림량)                |
| `gripper_events.csv`  | 그리퍼 grip/release 전환 이벤트                              |
| `parts.csv`           | 워크파츠별 1Hz 위치 및 파지 상태                             |
| `sensor_frames.csv`   | 볼트 홀 검사 센서 1Hz 결과                                   |

---

## 임포트 순서

1. `schema.sql` 실행 → `flangemaster` DB 및 7개 테이블 생성
2. `LOAD DATA LOCAL INFILE`은 MySQL 서버·클라이언트 양쪽에서 기본적으로 비활성화되어 있습니다. 임포트 전에 활성화하세요.

```sql
-- 서버에서 최초 1회 (관리자 권한):
SET GLOBAL local_infile = 1;
```

```
# mysql CLI로 접속할 때 --local-infile=1 옵션 필요:
mysql --local-infile=1 -u <user> -p flangemaster
```

3. 아래 순서대로 임포트 (sessions → 나머지)

```sql
LOAD DATA LOCAL INFILE 'sessions.csv'
  INTO TABLE sessions
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\n'
  IGNORE 1 ROWS;

-- 나머지 CSV도 동일한 패턴으로 테이블명만 바꿔서 임포트
```

pandas 사용 시:

```python
import pandas as pd

robot_frames    = pd.read_csv('robot_frames.csv')
conveyor_frames = pd.read_csv('conveyor_frames.csv')
gripper_frames  = pd.read_csv('gripper_frames.csv')
gripper_events  = pd.read_csv('gripper_events.csv')
parts           = pd.read_csv('parts.csv')
sensor_frames   = pd.read_csv('sensor_frames.csv')

# ts_ms → datetime 변환
robot_frames['dt'] = pd.to_datetime(robot_frames['ts_ms'], unit='ms', utc=True)
```

---

## 스키마 설명

### sessions

| 컬럼        | 타입     | 설명                                     |
| ----------- | -------- | ---------------------------------------- |
| id          | INT PK   | 세션 식별자 (단일 내보내기에서는 항상 1) |
| started_at  | DATETIME | 첫 프레임 타임스탬프 (UTC)               |
| ended_at    | DATETIME | 마지막 프레임 타임스탬프                 |
| frame_count | INT      | 전체 스냅샷 수                           |
| note        | TEXT     | 자유 메모                                |

### robot_frames

1Hz 샘플링. 로봇이 N대이면 프레임당 N행 생성됩니다.

| 컬럼          | 타입    | 설명                                                             |
| ------------- | ------- | ---------------------------------------------------------------- |
| session_id    | INT     | sessions.id 참조                                                 |
| ts_ms         | BIGINT  | Unix 타임스탬프 (밀리초)                                         |
| instance_id   | INT     | Unity GetInstanceID() — 씬 실행 중 유일 키                      |
| robot_name    | VARCHAR | Unity 씬 GameObject 이름                                         |
| model_type    | VARCHAR | 로봇 모델 타입                                                   |
| status        | VARCHAR | `Run` \| `Idle`                                              |
| instr_type    | VARCHAR | 현재 인스트럭션 타입 (`PTP`, `LIN`, `WaitInstruction` 등)  |
| instr_idx     | INT     | Program() 내 인스트럭션 인덱스 (0-based)                         |
| speed_factor  | FLOAT   | 속도 배율 (0–1)                                                 |
| j1–j6        | FLOAT   | 관절각 (°)                                                      |
| tcp_x/y/z     | FLOAT   | TCP 위치 (m, Unity 월드 좌표)                                    |
| tcp_rx/ry/rz  | FLOAT   | TCP 자세 (오일러각, °)                                          |
| base_x/y/z    | FLOAT   | 로봇 베이스 월드 위치 (m)                                        |
| base_qx/y/z/w | FLOAT   | 로봇 베이스 회전 쿼터니언                                        |
| temperature_c | FLOAT   | 가상 관절 온도 (°C). Run +0.06/s, Idle −0.03/s, 범위 25–85°C |
| power_w       | FLOAT   | 가상 소비전력 (W). Run 800–2400W, Idle 120–200W                |
| torque_nm     | FLOAT   | 가상 대표 토크 (Nm). Run 속도 비례 5–120Nm, Idle 0              |

### conveyor_frames

1Hz 샘플링. 컨베이어가 M대이면 프레임당 M행 생성됩니다.

| 컬럼          | 타입       | 설명                                     |
| ------------- | ---------- | ---------------------------------------- |
| session_id    | INT        | sessions.id 참조                         |
| ts_ms         | BIGINT     | Unix 타임스탬프 (밀리초)                 |
| conveyor_name | VARCHAR    | 컨베이어 GameObject 이름                 |
| running       | TINYINT(1) | `1` = 동작 중 / `0` = 정지           |
| speed_ms      | FLOAT      | 벨트 속도 (m/s), 2% 가우시안 노이즈 포함 |
| direction     | VARCHAR    | 이동 방향 축                             |
| friction      | FLOAT      | 표면 마찰 계수                           |
| current_a     | FLOAT      | 가상 모터 전류 (A). 속도 비례 0.8–8.5A  |

### gripper_frames

1Hz 상태 스냅샷. 그리퍼가 K개이면 프레임당 K행 생성됩니다.

| 컬럼         | 타입       | 설명                                                                                  |
| ------------ | ---------- | ------------------------------------------------------------------------------------- |
| session_id   | INT        | sessions.id 참조                                                                      |
| ts_ms        | BIGINT     | Unix 타임스탬프 (밀리초)                                                              |
| gripper_name | VARCHAR    | 그리퍼 GameObject 이름                                                                |
| robot_name   | VARCHAR    | 소속 로봇 이름 (계층상 부모 RobotTask 우선, 없으면 거리 기준 최근접 RobotTask로 폴백) |
| is_gripping  | TINYINT(1) | `1` = 파지 중 / `0` = 해제                                                        |
| gripped_part | VARCHAR    | 파지 중인 파트 이름 (없으면 빈 값)                                                    |
| grip_amount  | FLOAT      | 손가락 열림/닫힘 정도 (0=완전 열림, 1=완전 닫힘)                                      |
| grip_state   | VARCHAR    | `Fixed` \| `Opening` \| `Closing`                                               |
| grip_force   | FLOAT      | 가상 파지력 (N). 파지 시 8–30N, 해제 시 0                                            |

### gripper_events

grip/release 전환 시점만 기록 (이벤트 기반, 1Hz 아님).
`robot_frames`와 `ts_ms`로 조인하면 그립 직전 로봇 자세·온도·전력을 추출할 수 있습니다.

| 컬럼         | 타입    | 설명                            |
| ------------ | ------- | ------------------------------- |
| session_id   | INT     | sessions.id 참조                |
| ts_ms        | BIGINT  | 이벤트 발생 타임스탬프          |
| gripper_name | VARCHAR | 그리퍼 GameObject 이름          |
| robot_name   | VARCHAR | 소속 로봇 이름                  |
| event_type   | VARCHAR | `grip` \| `release`         |
| part_name    | VARCHAR | 파지된 파트 이름 (없으면 빈 값) |

### parts

1Hz 워크파츠 위치 스냅샷.

| 컬럼       | 타입       | 설명                                 |
| ---------- | ---------- | ------------------------------------ |
| session_id | INT        | sessions.id 참조                     |
| ts_ms      | BIGINT     | Unix 타임스탬프 (밀리초)             |
| part_name  | VARCHAR    | 파츠 GameObject 이름                 |
| is_gripped | TINYINT(1) | `1` = 파지 중 / `0` = 자유       |
| gripped_by | VARCHAR    | 파지 중인 그리퍼 이름 (없으면 빈 값) |
| pos_x/y/z  | FLOAT      | 파츠 위치 (m, Unity 월드 좌표)       |

### sensor_frames

`HoleBoltInspector`의 1Hz 평가 결과.

| 컬럼         | 타입       | 설명                                               |
| ------------ | ---------- | -------------------------------------------------- |
| session_id   | INT        | sessions.id 참조                                   |
| ts_ms        | BIGINT     | 스냅샷 타임스탬프                                  |
| sensor_name  | VARCHAR    | 홀 이름 (`hole`, `hole(1)`~`hole(4)`)        |
| bolt_present | TINYINT(1) | `1` = 볼트 감지 / `0` = 미감지                 |
| confidence   | FLOAT      | 감지 신뢰도 (0–1). 현재 Physics 기반 시뮬레이션값 |

---

## 가상 물리량 생성 방식

토크·온도·전력·전류는 실제 센서 없이 Unity C# 수식으로 생성한 시뮬레이션 값입니다.

| 값            | 생성 방식                                                                    |
| ------------- | ---------------------------------------------------------------------------- |
| temperature_c | 이전 값에서 Run +0.06°C/s, Idle −0.03°C/s 누적, 25–85°C 클램프          |
| power_w       | 속도 배율로 목표값(Run 800–2400W / Idle 120–200W) 향해 Lerp, σ=12W 노이즈 |
| torque_nm     | 속도 배율 선형 매핑 5–120Nm, σ=3Nm 노이즈, Idle 시 0                       |
| current_a     | 벨트 속도 비례 0.8–8.5A, σ=0.1A 노이즈                                     |
| grip_force    | 파지 시 grip_amount 기반 8–30N, σ=1.2N 노이즈                              |

---

## 데이터 품질 노트

**grip+release 동시 발생**
같은 `ts_ms`에 동일 그리퍼의 `grip`과 `release`가 함께 나타날 수 있습니다.
1Hz 샘플링 윈도우 안에서 두 전환이 모두 발생한 경우의 아티팩트입니다.

**동명 로봇 중복 행**
씬에 이름이 동일한 `RobotTask`가 여러 개 있으면 `robot_frames`에서 같은 `ts_ms + robot_name` 조합이 여러 행 생성됩니다.
`instance_id`로 구분

**gripper_frames에는 instance_id가 없음**
`robot_frames`와 달리 `gripper_frames`는 `instance_id` 컬럼이 없습니다. 씬에 이름이 같은 `Gripper` 컴포넌트가 여러 개 있으면(예: 동명 로봇에 각각 붙은 그리퍼) CSV만으로는 구분이 불가능하며, `gripper_name` 기준 집계 시 중복 합산될 수 있습니다. 

**confidence 값**
현재 Physics 기반 시뮬레이션값(볼트 감지 시 0.85–0.99)입니다.
실제 비전 모델로 교체 시 값 분포가 달라집니다.
