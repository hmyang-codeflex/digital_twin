import { downloadZip } from './reportUtils.js';

// ── README ───────────────────────────────────────────────────────
const README_MD = `# Flangemaster DB Export

Data package exported from the Flangemaster Unity Digital Twin.
DigitalTwinEmitter.cs broadcasts robot state, gripper events, and bolt inspection data
at 1 Hz and stores them in MySQL-compatible format (7 tables, 9 files).

---

## Files

| File | Description |
|---|---|
| \`schema.sql\` | DB creation + table DDL. **Run this first.** |
| \`sessions.csv\` | Session metadata (start/end time, frame count) |
| \`robot_frames.csv\` | Robot state at 1 Hz (joints, TCP, base pose, temperature, power, torque) |
| \`conveyor_frames.csv\` | Conveyor state at 1 Hz (speed, current) |
| \`gripper_frames.csv\` | Gripper state at 1 Hz (grip status, force, open amount) |
| \`gripper_events.csv\` | Gripper grip/release transition events |
| \`parts.csv\` | Workpart position and grip status at 1 Hz |
| \`sensor_frames.csv\` | Bolt hole inspection sensor results at 1 Hz |

---

## Import order

1. Run \`schema.sql\` to create the \`flangemaster\` database and all 7 tables.
2. \`LOAD DATA LOCAL INFILE\` is disabled by default on both the MySQL server and client. Enable it before importing:

\`\`\`sql
-- On the server (run once, as admin):
SET GLOBAL local_infile = 1;
\`\`\`

\`\`\`
# When connecting with the mysql CLI, pass --local-infile=1:
mysql --local-infile=1 -u <user> -p flangemaster
\`\`\`

3. Import CSVs in this order: sessions -> robot_frames -> conveyor_frames -> gripper_frames -> gripper_events -> parts -> sensor_frames

\`\`\`sql
LOAD DATA LOCAL INFILE 'sessions.csv'
  INTO TABLE sessions
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
  LINES TERMINATED BY '\\n'
  IGNORE 1 ROWS;

-- Repeat the same pattern for each CSV, changing the table name.
\`\`\`

With pandas:

\`\`\`python
import pandas as pd

robot_frames    = pd.read_csv('robot_frames.csv')
conveyor_frames = pd.read_csv('conveyor_frames.csv')
gripper_frames  = pd.read_csv('gripper_frames.csv')
gripper_events  = pd.read_csv('gripper_events.csv')
parts           = pd.read_csv('parts.csv')
sensor_frames   = pd.read_csv('sensor_frames.csv')

# Convert ts_ms to datetime
robot_frames['dt'] = pd.to_datetime(robot_frames['ts_ms'], unit='ms', utc=True)
\`\`\`

---

## Schema

### sessions

| Column | Type | Description |
|---|---|---|
| id | INT PK | Session ID (always 1 for a single export) |
| started_at | DATETIME | First frame timestamp (UTC) |
| ended_at | DATETIME | Last frame timestamp |
| frame_count | INT | Total snapshot count |
| note | TEXT | Free-form note |

### robot_frames

1 Hz sampling. N robots -> N rows per frame.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Unix timestamp (ms) |
| instance_id | INT | Unity GetInstanceID() -- unique key within a scene run |
| robot_name | VARCHAR | Unity scene GameObject name |
| model_type | VARCHAR | Robot model type |
| status | VARCHAR | Run or Idle |
| instr_type | VARCHAR | Current instruction type (PTP, LIN, WaitInstruction, ...) |
| instr_idx | INT | Instruction index in Program() (0-based) |
| speed_factor | FLOAT | Speed multiplier (0-1) |
| j1-j6 | FLOAT | Joint angles (deg) |
| tcp_x/y/z | FLOAT | TCP position (m, Unity world space) |
| tcp_rx/ry/rz | FLOAT | TCP orientation (Euler angles, deg) |
| base_x/y/z | FLOAT | Robot base world position (m) |
| base_qx/y/z/w | FLOAT | Robot base rotation quaternion |
| temperature_c | FLOAT | Simulated joint temperature (degC). Run +0.06/s, Idle -0.03/s, range 25-85 |
| power_w | FLOAT | Simulated power consumption (W). Run 800-2400 W, Idle 120-200 W |
| torque_nm | FLOAT | Simulated representative torque (Nm). Run speed-proportional 5-120 Nm, Idle 0 |

### conveyor_frames

1 Hz sampling. M conveyors -> M rows per frame.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Unix timestamp (ms) |
| conveyor_name | VARCHAR | Conveyor GameObject name |
| running | TINYINT(1) | 1 = running, 0 = stopped |
| speed_ms | FLOAT | Belt speed (m/s) with 2% Gaussian noise |
| direction | VARCHAR | Movement direction axis |
| friction | FLOAT | Surface friction coefficient |
| current_a | FLOAT | Simulated motor current (A), speed-proportional 0.8-8.5 A |

### gripper_frames

1 Hz snapshot. K grippers -> K rows per frame.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Unix timestamp (ms) |
| gripper_name | VARCHAR | Gripper GameObject name |
| robot_name | VARCHAR | Owning robot name (parent RobotTask in hierarchy; falls back to nearest RobotTask by distance if none) |
| is_gripping | TINYINT(1) | 1 = gripping, 0 = released |
| gripped_part | VARCHAR | Name of gripped part (empty if none) |
| grip_amount | FLOAT | Finger open/close amount (0 = fully open, 1 = fully closed) |
| grip_state | VARCHAR | Fixed, Opening, or Closing |
| grip_force | FLOAT | Simulated grip force (N). 8-30 N when gripping, 0 when released |

### gripper_events

Transition events only (event-driven, not 1 Hz).
JOIN with robot_frames on ts_ms to retrieve robot pose at the moment of grip.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Event timestamp |
| gripper_name | VARCHAR | Gripper GameObject name |
| robot_name | VARCHAR | Owning robot name |
| event_type | VARCHAR | grip or release |
| part_name | VARCHAR | Gripped part name (empty if none) |

### parts

1 Hz workpart position snapshot.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Unix timestamp (ms) |
| part_name | VARCHAR | Part GameObject name |
| is_gripped | TINYINT(1) | 1 = gripped, 0 = free |
| gripped_by | VARCHAR | Gripper name holding the part (empty if free) |
| pos_x/y/z | FLOAT | Part position (m, Unity world space) |

### sensor_frames

HoleBoltInspector evaluation at 1 Hz.

| Column | Type | Description |
|---|---|---|
| session_id | INT | FK -> sessions.id |
| ts_ms | BIGINT | Snapshot timestamp |
| sensor_name | VARCHAR | Hole name (hole, hole(1)-hole(4)) |
| bolt_present | TINYINT(1) | 1 = bolt detected, 0 = not detected |
| confidence | FLOAT | Detection confidence (0-1). Physics-based simulation value. |

---

## Virtual physics generation

Torque, temperature, power, and current are simulation values generated by Unity C# formulas (no real sensors).

| Value | Method |
|---|---|
| temperature_c | Accumulated from previous value: Run +0.06 degC/s, Idle -0.03 degC/s, clamped to 25-85 |
| power_w | Lerps toward target (Run 800-2400 W / Idle 120-200 W) with Gaussian noise sigma=12 W |
| torque_nm | Linear mapping by speed_factor: 5-120 Nm, sigma=3 Nm noise, 0 when Idle |
| current_a | Speed-proportional 0.8-8.5 A, sigma=0.1 A noise |
| grip_force | grip_amount-based 8-30 N when gripping, sigma=1.2 N noise |

---

## Data quality notes

**Simultaneous grip+release events**
A grip and release from the same gripper can appear at the same ts_ms when both transitions
occur within a single 1 Hz sampling window. Normalize with a state machine or keep only the
last event per ts_ms per gripper.

**Duplicate rows for same-named robots**
If the scene contains multiple RobotTask objects with the same name, robot_frames will produce
multiple rows for the same ts_ms + robot_name combination. Use instance_id to distinguish them,
or rename robots in the Unity scene to be unique.

**gripper_frames has no instance_id**
Unlike robot_frames, gripper_frames does not carry an instance_id column. If the scene contains
multiple Gripper components with the same name (e.g. attached to different same-named robots),
their rows cannot be disambiguated from the CSV alone -- aggregating by gripper_name can double-count.
Rename grippers uniquely in the Unity scene if you need per-instance analysis.

**confidence values**
Current values are physics-based simulation outputs (0.85-0.99 when bolt detected).
Distribution will differ when replaced with a real vision model.

---

*Generated by Flangemaster Digital Twin Emitter*
`;

// ── MySQL DDL ────────────────────────────────────────────────────
const SCHEMA_SQL = `-- ============================================================
--  Flangemaster Digital Twin -- MySQL Schema
--  Setup: run this file first, then use LOAD DATA INFILE for CSVs
-- ============================================================

CREATE DATABASE IF NOT EXISTS flangemaster
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flangemaster;

-- Session (one digital twin run)
CREATE TABLE IF NOT EXISTS sessions (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  started_at  DATETIME      NOT NULL,
  ended_at    DATETIME,
  frame_count INT           DEFAULT 0,
  note        TEXT
);

-- Robot state frames (1Hz, main ML feature table)
-- Features:  j1-j6, tcp_x/y/z/rx/ry/rz, speed_factor, temperature_c, power_w, torque_nm
-- Label candidates: status, instr_type, next-frame joint angles
CREATE TABLE IF NOT EXISTS robot_frames (
  id             BIGINT  AUTO_INCREMENT PRIMARY KEY,
  session_id     INT     NOT NULL,
  ts_ms          BIGINT  NOT NULL COMMENT 'unix timestamp ms',
  instance_id    INT     COMMENT 'Unity GetInstanceID() -- unique per scene run',
  robot_name     VARCHAR(100) NOT NULL,
  model_type     VARCHAR(100),
  status         VARCHAR(20)  COMMENT 'Run | Idle',
  instr_type     VARCHAR(50)  COMMENT 'PTP | LIN | WaitInstruction | ...',
  instr_idx      INT,
  speed_factor   FLOAT,
  j1 FLOAT, j2 FLOAT, j3 FLOAT,
  j4 FLOAT, j5 FLOAT, j6 FLOAT,
  tcp_x  FLOAT, tcp_y  FLOAT, tcp_z  FLOAT,
  tcp_rx FLOAT, tcp_ry FLOAT, tcp_rz FLOAT,
  base_x FLOAT, base_y FLOAT, base_z FLOAT,
  base_qx FLOAT, base_qy FLOAT, base_qz FLOAT, base_qw FLOAT,
  temperature_c  FLOAT  COMMENT 'simulated joint temperature (degC)',
  power_w        FLOAT  COMMENT 'simulated power consumption (W)',
  torque_nm      FLOAT  COMMENT 'simulated representative torque (Nm)',
  INDEX idx_session_robot (session_id, robot_name),
  INDEX idx_ts (ts_ms)
);

-- Gripper state frames (1Hz snapshot of each gripper)
CREATE TABLE IF NOT EXISTS gripper_frames (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT    NOT NULL,
  ts_ms        BIGINT NOT NULL,
  gripper_name VARCHAR(100),
  robot_name   VARCHAR(100),
  is_gripping  TINYINT(1),
  gripped_part VARCHAR(100),
  grip_amount  FLOAT  COMMENT '0=fully open, 1=fully closed',
  grip_state   VARCHAR(20) COMMENT 'Fixed | Opening | Closing',
  grip_force   FLOAT  COMMENT 'simulated grip force (N)',
  INDEX idx_session (session_id),
  INDEX idx_ts (ts_ms)
);

-- Workpart positions (1Hz)
CREATE TABLE IF NOT EXISTS parts (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT    NOT NULL,
  ts_ms        BIGINT NOT NULL,
  part_name    VARCHAR(100),
  is_gripped   TINYINT(1),
  gripped_by   VARCHAR(100),
  pos_x FLOAT, pos_y FLOAT, pos_z FLOAT,
  INDEX idx_session (session_id),
  INDEX idx_ts (ts_ms)
);

-- Conveyor state frames (1Hz)
CREATE TABLE IF NOT EXISTS conveyor_frames (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT    NOT NULL,
  ts_ms        BIGINT NOT NULL,
  conveyor_name VARCHAR(100),
  running      TINYINT(1),
  speed_ms     FLOAT  COMMENT 'belt speed (m/s) with noise',
  direction    VARCHAR(20),
  friction     FLOAT,
  current_a    FLOAT  COMMENT 'simulated motor current (A)',
  INDEX idx_session (session_id),
  INDEX idx_ts (ts_ms)
);

-- Gripper events (recorded only on grip/release transitions)
-- JOIN with robot_frames on ts_ms to derive pre-grip pose features
CREATE TABLE IF NOT EXISTS gripper_events (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT    NOT NULL,
  ts_ms        BIGINT NOT NULL,
  gripper_name VARCHAR(100),
  robot_name   VARCHAR(100),
  event_type   VARCHAR(20) COMMENT 'grip | release',
  part_name    VARCHAR(100),
  INDEX idx_session (session_id),
  INDEX idx_ts (ts_ms)
);

-- Bolt inspection sensors (HoleBoltInspector, 1Hz)
CREATE TABLE IF NOT EXISTS sensor_frames (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT    NOT NULL,
  ts_ms        BIGINT NOT NULL,
  sensor_name  VARCHAR(100),
  bolt_present TINYINT(1),
  confidence   FLOAT,
  INDEX idx_session (session_id)
);

-- LOAD DATA example (import CSVs)
-- LOAD DATA LOCAL INFILE 'robot_frames.csv'
--   INTO TABLE robot_frames
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\\n'
--   IGNORE 1 ROWS;
`;

// ── CSV 헬퍼 ────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

// ── 메인 익스포트 ────────────────────────────────────────────────
// log: twinLog 배열 (DigitalTwinEmitter 페이로드)
export function exportTwinZip(log) {
  if (!log.length) return;

  const SID       = 1;
  const startedAt = new Date(log[0]._ts).toISOString().replace('T', ' ').slice(0, 19);
  const endedAt   = new Date(log[log.length - 1]._ts).toISOString().replace('T', ' ').slice(0, 19);
  const dateStr   = new Date(log[0]._ts).toISOString().slice(0, 10).replace(/-/g, '');

  // sessions.csv
  const sessionsCsv = toCsv(
    ['id', 'started_at', 'ended_at', 'frame_count', 'note'],
    [[SID, startedAt, endedAt, log.length, '']]
  );

  // robot_frames.csv
  const rfRows = [];
  for (const snap of log) {
    for (const r of (snap.robots ?? [])) {
      rfRows.push([
        SID, snap._ts,
        r.instanceId ?? '', r.name, r.modelType ?? '', r.status ?? '',
        r.instrType ?? '', r.instructionIdx ?? '', r.speedFactor ?? '',
        r.j1 ?? '', r.j2 ?? '', r.j3 ?? '', r.j4 ?? '', r.j5 ?? '', r.j6 ?? '',
        r.tcpX ?? '', r.tcpY ?? '', r.tcpZ ?? '',
        r.tcpRx ?? '', r.tcpRy ?? '', r.tcpRz ?? '',
        r.baseX ?? '', r.baseY ?? '', r.baseZ ?? '',
        r.baseQx ?? '', r.baseQy ?? '', r.baseQz ?? '', r.baseQw ?? '',
        r.temperatureC ?? '', r.powerW ?? '', r.torqueNm ?? '',
      ]);
    }
  }
  const rfCsv = toCsv(
    ['session_id', 'ts_ms', 'instance_id', 'robot_name', 'model_type', 'status',
     'instr_type', 'instr_idx', 'speed_factor',
     'j1', 'j2', 'j3', 'j4', 'j5', 'j6',
     'tcp_x', 'tcp_y', 'tcp_z', 'tcp_rx', 'tcp_ry', 'tcp_rz',
     'base_x', 'base_y', 'base_z', 'base_qx', 'base_qy', 'base_qz', 'base_qw',
     'temperature_c', 'power_w', 'torque_nm'],
    rfRows
  );

  // conveyor_frames.csv
  const cvRows = [];
  for (const snap of log) {
    for (const c of (snap.conveyors ?? [])) {
      cvRows.push([
        SID, snap._ts,
        c.name ?? '', c.running ? 1 : 0,
        c.speedMs ?? '', c.direction ?? '', c.friction ?? '', c.currentA ?? '',
      ]);
    }
  }
  const cvCsv = toCsv(
    ['session_id', 'ts_ms', 'conveyor_name', 'running', 'speed_ms', 'direction', 'friction', 'current_a'],
    cvRows
  );

  // gripper_frames.csv (1Hz state snapshot)
  const gfRows = [];
  for (const snap of log) {
    for (const g of (snap.grippers ?? [])) {
      gfRows.push([
        SID, snap._ts,
        g.name ?? '', g.robotName ?? '',
        g.isGripping ? 1 : 0, g.grippedPart ?? '',
        g.gripAmount ?? '', g.gripState ?? '', g.gripForce ?? '',
      ]);
    }
  }
  const gfCsv = toCsv(
    ['session_id', 'ts_ms', 'gripper_name', 'robot_name',
     'is_gripping', 'gripped_part', 'grip_amount', 'grip_state', 'grip_force'],
    gfRows
  );

  // parts.csv (1Hz workpart positions)
  const ptRows = [];
  for (const snap of log) {
    for (const p of (snap.parts ?? [])) {
      ptRows.push([
        SID, snap._ts,
        p.name ?? '', p.isGripped ? 1 : 0, p.grippedBy ?? '',
        p.posX ?? '', p.posY ?? '', p.posZ ?? '',
      ]);
    }
  }
  const ptCsv = toCsv(
    ['session_id', 'ts_ms', 'part_name', 'is_gripped', 'gripped_by', 'pos_x', 'pos_y', 'pos_z'],
    ptRows
  );

  // gripper_events.csv
  const evRows = [];
  for (const snap of log) {
    const gripperRobotMap = {};
    for (const g of (snap.grippers ?? [])) {
      if (g.name) gripperRobotMap[g.name] = g.robotName ?? '';
    }
    for (const ev of (snap.events ?? [])) {
      evRows.push([
        SID, ev.timestampMs ?? snap._ts,
        ev.gripperName ?? '',
        ev.robotName ?? gripperRobotMap[ev.gripperName] ?? '',
        ev.type ?? '', ev.partName ?? '',
      ]);
    }
  }
  const evCsv = toCsv(
    ['session_id', 'ts_ms', 'gripper_name', 'robot_name', 'event_type', 'part_name'],
    evRows
  );

  // sensor_frames.csv
  const srRows = [];
  for (const snap of log) {
    for (const s of (snap.sensors ?? [])) {
      srRows.push([
        SID, snap._ts,
        s.name ?? '', s.boltPresent ? 1 : 0, s.confidence ?? '',
      ]);
    }
  }
  const srCsv = toCsv(
    ['session_id', 'ts_ms', 'sensor_name', 'bolt_present', 'confidence'],
    srRows
  );

  downloadZip(`flangemaster_db_${dateStr}.zip`, [
    { name: 'README.md',           content: README_MD   },
    { name: 'schema.sql',          content: SCHEMA_SQL  },
    { name: 'sessions.csv',        content: sessionsCsv },
    { name: 'robot_frames.csv',    content: rfCsv       },
    { name: 'conveyor_frames.csv', content: cvCsv       },
    { name: 'gripper_frames.csv',  content: gfCsv       },
    { name: 'gripper_events.csv',  content: evCsv       },
    { name: 'parts.csv',           content: ptCsv       },
    { name: 'sensor_frames.csv',   content: srCsv       },
  ]);
}
