// ── 공통 IR 스키마 (v1.0) ─────────────────────────────────────────
// MOVJ    { joints: number[6], speed: 0-1, zone: 'fine'|'z5'|'z10'|'z50' }
// MOVL    { tcp: {x,y,z,rx,ry,rz}, speed: 0-1, zone: string }
// GRIPPER { action: 'open'|'close' }
// DOUT    { channel: number, value: boolean }
// WAIT    { duration: number (seconds) }

export function createIR(robot, steps = []) {
  return {
    version: '1.0',
    robot: {
      name: robot?.name ?? 'ROBOT',
      // 카탈로그 로봇(.config.modelType)과 프리셋 로봇(.modelType) 모두 지원
      modelType: robot?.modelType ?? robot?.config?.modelType ?? 'GENERIC',
      dof: robot?.dof ?? robot?.config?.jointLimits?.length ?? 6,
    },
    steps: steps.map((s, i) => ({ ...s, id: i })),
  };
}

// ── 표준 기종 프리셋 (카탈로그 등록 없이 선택 가능) ───────────────
export const ROBOT_PRESETS = [
  // CX210L — 실제 현장 사용 기종 (robot program.as 기준 ZULIMIT/ZLLIMIT)
  { vendor: 'Kawasaki', name: 'Kawasaki CX210L',    modelType: 'KWS_CX210L',      dof: 6, defaultFormat: 'KAS',
    jointLimits: [{min:-160,max:160},{min:-60,max:80},{min:-75,max:95},{min:-210,max:210},{min:-120,max:120},{min:-360,max:360}] },
  { vendor: 'Kawasaki', name: 'Kawasaki RS010N',    modelType: 'KWS_RS010N',      dof: 6, defaultFormat: 'KAS',
    jointLimits: [{min:-185,max:185},{min:-65,max:145},{min:-180,max:70},{min:-270,max:270},{min:-130,max:130},{min:-360,max:360}] },
  { vendor: 'Kawasaki', name: 'Kawasaki RS020N',    modelType: 'KWS_RS020N',      dof: 6, defaultFormat: 'KAS',
    jointLimits: [{min:-185,max:185},{min:-65,max:145},{min:-180,max:70},{min:-270,max:270},{min:-130,max:130},{min:-360,max:360}] },
  { vendor: 'KUKA',     name: 'KUKA KR 6 R700',    modelType: 'KUKA_KR6_R700',   dof: 6, defaultFormat: 'KRL',
    jointLimits: [{min:-170,max:170},{min:-190,max:45},{min:-120,max:156},{min:-185,max:185},{min:-120,max:120},{min:-350,max:350}] },
  { vendor: 'KUKA',     name: 'KUKA KR 210 R2700', modelType: 'KUKA_KR210_R2700',dof: 6, defaultFormat: 'KRL',
    jointLimits: [{min:-185,max:185},{min:-140,max:-5},{min:-120,max:155},{min:-350,max:350},{min:-125,max:125},{min:-350,max:350}] },
  { vendor: 'ABB',      name: 'ABB IRB 6700-235',  modelType: 'ABB_IRB_6700',    dof: 6, defaultFormat: 'RAPID',
    jointLimits: [{min:-170,max:170},{min:-65,max:85},{min:-180,max:70},{min:-300,max:300},{min:-130,max:130},{min:-360,max:360}] },
  { vendor: 'ABB',      name: 'ABB IRB 1200',       modelType: 'ABB_IRB_1200',    dof: 6, defaultFormat: 'RAPID',
    jointLimits: [{min:-170,max:170},{min:-100,max:135},{min:-200,max:70},{min:-270,max:270},{min:-130,max:130},{min:-360,max:360}] },
];

export function createEmptyStep(type) {
  const base = { type, label: '' };
  switch (type) {
    case 'MOVJ':    return { ...base, joints: [0, 0, 0, 0, 0, 0], speed: 0.5, zone: 'fine' };
    case 'MOVL':    return { ...base, tcp: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, speed: 0.3, zone: 'fine' };
    case 'GRIPPER': return { ...base, action: 'open' };
    case 'DOUT':    return { ...base, channel: 1, value: true };
    case 'WAIT':    return { ...base, duration: 0.5 };
    default:        return base;
  }
}

// nq5() 실제 관절값 기반 데모 (Kawasaki CX210L — robot program.as)
export const DEMO_STEPS = [
  { type: 'MOVJ', label: '홈 위치',      joints: [90.004, -48.369, -47.331,  0.000, -90.642,  0.000], speed: 1.0,  zone: 'fine' },
  { type: 'DOUT', label: '센터링 진입',  channel: 20, value: true  },
  { type: 'WAIT', label: '센터링 대기',  duration: 1.0 },
  { type: 'DOUT', label: '센터링 복귀',  channel: 20, value: false },
  { type: 'MOVJ', label: '피킹 접근',    joints: [93.798,  35.325,  26.703,  0.439, -81.479, -3.400], speed: 0.55, zone: 'z10'  },
  { type: 'MOVJ', label: '피킹 위치',    joints: [93.797,  35.362,  15.398,  0.461, -70.139, -3.492], speed: 0.11, zone: 'fine' },
  { type: 'DOUT', label: '진공 ON',      channel: 6,  value: true  },
  { type: 'WAIT', label: '진공 확인',    duration: 1.0 },
  { type: 'MOVJ', label: '리프트',       joints: [93.769,  35.983,  20.551,  0.450, -74.668, -3.426], speed: 0.11, zone: 'z10'  },
  { type: 'MOVJ', label: '이재 접근',    joints: [101.74, -49.910, -64.871, -0.240,  58.490, -6.515], speed: 1.0,  zone: 'z10'  },
  { type: 'MOVJ', label: '이재 위치',    joints: [122.27,  31.549,  21.519, -0.473,  99.702, -2.464], speed: 0.33, zone: 'fine' },
  { type: 'DOUT', label: '진공 OFF',     channel: 6,  value: false },
  { type: 'WAIT', label: '해제 대기',    duration: 1.0 },
  { type: 'MOVJ', label: '홈 복귀',      joints: [90.004, -48.369, -47.331,  0.000, -90.642,  0.000], speed: 1.0,  zone: 'fine' },
];

// ── JBI (야스카와 Motoman) ─────────────────────────────────────────
// B2 Fix: ///COORD JOINT / ///COORD ROBOT 구분자 추가 — 컨트롤러가 좌표계 타입 식별에 필요
export function renderJBI(ir) {
  const { robot, steps } = ir;
  const lines = [
    '/JOB',
    `//NAME ${robot.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
    '//POS',
  ];

  const moveSteps = steps.filter(s => s.type === 'MOVJ' || s.type === 'MOVL');
  lines.push(`///NPOS ${moveSteps.length},0,0,0,0,0`);

  const posMap = {};
  moveSteps.forEach((s, i) => {
    posMap[s.id] = i;
    lines.push('///TOOL 0');
    if (s.type === 'MOVJ') {
      lines.push('///COORD JOINT');
      const j = s.joints ?? [0, 0, 0, 0, 0, 0];
      lines.push(`C${String(i).padStart(5, '0')}=${j.map(v => (+v).toFixed(4)).join(',')}`);
    } else {
      lines.push('///COORD ROBOT');
      const t = s.tcp ?? {};
      lines.push(`C${String(i).padStart(5, '0')}=${(t.x ?? 0).toFixed(3)},${(t.y ?? 0).toFixed(3)},${(t.z ?? 0).toFixed(3)},${(t.rx ?? 0).toFixed(3)},${(t.ry ?? 0).toFixed(3)},${(t.rz ?? 0).toFixed(3)}`);
    }
  });

  lines.push(
    '//INST',
    `///DATE ${new Date().toISOString().slice(0, 10).replace(/-/g, '/')}`,
    '///ATTR SC,RW',
    'NOP',
  );

  steps.forEach(s => {
    if (s.label) lines.push(`'; ${s.label}`);
    switch (s.type) {
      case 'MOVJ': {
        // B3 Fix: VJ=0.00은 컨트롤러 오류 유발 — 최소 1% 보장
        const sp = Math.max(1, Math.round((+(s.speed ?? 0.5)) * 100));
        lines.push(`MOVJ C${String(posMap[s.id]).padStart(5, '0')} VJ=${sp}.00`);
        break;
      }
      case 'MOVL': {
        const sp = Math.max(1, Math.round((+(s.speed ?? 0.3)) * 1000));
        lines.push(`MOVL C${String(posMap[s.id]).padStart(5, '0')} V=${sp}`);
        break;
      }
      case 'GRIPPER':
        lines.push(`DOUT OT#(${s.action === 'open' ? 1 : 2}) ${s.action === 'open' ? 'ON' : 'OFF'}`);
        lines.push('TIMER T=0.30');
        break;
      case 'DOUT':
        lines.push(`DOUT OT#(${s.channel ?? 1}) ${s.value ? 'ON' : 'OFF'}`);
        break;
      case 'WAIT':
        lines.push(`TIMER T=${(+(s.duration ?? 0.5)).toFixed(2)}`);
        break;
    }
  });

  lines.push('END');
  return lines.join('\n');
}

// ── RAPID (ABB) ───────────────────────────────────────────────────
// B1 Fix: ABB RAPID에서 속도는 미리 정의된 speeddata만 사용 가능
// v110, v330, v550 같은 비정의 값은 컨트롤러 로드 오류 유발
const _ABB_SPEEDS = [5, 10, 20, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 2500, 3000];
function _snapAbbSpeed(speed01) {
  const target = Math.round((+(speed01 ?? 0.5)) * 1000);
  return _ABB_SPEEDS.reduce((p, c) => Math.abs(c - target) < Math.abs(p - target) ? c : p);
}

export function renderRAPID(ir) {
  const { robot, steps } = ir;
  const modName = robot.name.replace(/[^A-Za-z0-9]/g, '_');

  const header = [
    `MODULE ${modName}_Prog`,
    '',
    `  ! Generated by Flangemaster Robot Importer`,
    `  ! Robot: ${robot.name}  /  Model: ${robot.modelType}`,
    '',
  ];

  const decls = [];
  let pIdx = 0;
  const stepsCopy = steps.map(s => ({ ...s }));
  stepsCopy.forEach(s => {
    if (s.type === 'MOVJ') {
      const j = (s.joints ?? [0, 0, 0, 0, 0, 0]).map(v => (+v).toFixed(4)).join(',');
      decls.push(`  CONST jointtarget jp${pIdx} := [[${j}],[9E9,9E9,9E9,9E9,9E9,9E9]];`);
      s._rid = pIdx++;
    } else if (s.type === 'MOVL') {
      const t = s.tcp ?? {};
      decls.push(`  CONST robtarget p${pIdx} := [[${(t.x ?? 0).toFixed(3)},${(t.y ?? 0).toFixed(3)},${(t.z ?? 0).toFixed(3)}],[1,0,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];`);
      s._rid = pIdx++;
    }
  });

  const body = ['  PROC main()'];
  stepsCopy.forEach(s => {
    if (s.label) body.push(`    ! ${s.label}`);
    const sp   = _snapAbbSpeed(s.speed);  // ABB 미리 정의 속도로 스냅
    const zone = s.zone ?? 'fine';
    switch (s.type) {
      case 'MOVJ':
        body.push(`    MoveAbsJ jp${s._rid}, v${sp}, ${zone}, tool0;`);
        break;
      case 'MOVL':
        body.push(`    MoveL p${s._rid}, v${sp}, ${zone}, tool0;`);
        break;
      case 'GRIPPER': {
        const sig = s.action === 'open' ? 'DO_Gripper_Open' : 'DO_Gripper_Close';
        body.push(`    SetDO ${sig}, 1;`);
        body.push(`    WaitTime 0.3;`);
        body.push(`    SetDO ${sig}, 0;`);
        break;
      }
      case 'DOUT':
        body.push(`    SetDO DO${s.channel ?? 1}, ${s.value ? '1' : '0'};`);
        break;
      case 'WAIT':
        body.push(`    WaitTime ${(+(s.duration ?? 0.5)).toFixed(2)};`);
        break;
    }
  });
  body.push('  ENDPROC', '', 'ENDMODULE');

  return [...header, ...decls, '', ...body].join('\n');
}

// ── KRL (KUKA) ────────────────────────────────────────────────────
// B1 Fix: DECL 섹션에서 포지션 변수 선언 후 PTP/LIN에서 참조
// $AXIS_ACT 직접 대입 방식은 실제 컨트롤러에서 동작하지 않음
export function renderKRL(ir) {
  const { robot, steps } = ir;
  const defName = robot.name.replace(/[^A-Za-z0-9]/g, '_');

  // DECL 섹션 구성 — 포지션 변수 선언
  const declLines = [];
  let pdIdx = 0;
  const stepsCopy = steps.map(s => ({ ...s }));
  stepsCopy.forEach(s => {
    if (s.type === 'MOVJ') {
      const j = s.joints ?? [0, 0, 0, 0, 0, 0];
      declLines.push(
        `DECL AXIS P${pdIdx} = {A1 ${(+j[0]).toFixed(2)},A2 ${(+j[1]).toFixed(2)},A3 ${(+j[2]).toFixed(2)},A4 ${(+j[3]).toFixed(2)},A5 ${(+j[4]).toFixed(2)},A6 ${(+j[5]).toFixed(2)}}`
      );
      s._pid = pdIdx++;
    } else if (s.type === 'MOVL') {
      const t = s.tcp ?? {};
      declLines.push(
        `DECL E6POS P${pdIdx} = {X ${(t.x ?? 0).toFixed(3)},Y ${(t.y ?? 0).toFixed(3)},Z ${(t.z ?? 0).toFixed(3)},A ${(t.rz ?? 0).toFixed(3)},B ${(t.ry ?? 0).toFixed(3)},C ${(t.rx ?? 0).toFixed(3)},E1 0,E2 0,E3 0,E4 0,E5 0,E6 0}`
      );
      s._pid = pdIdx++;
    }
  });

  const lines = [
    `; Generated by Flangemaster Robot Importer`,
    `; Robot: ${robot.name}  /  Model: ${robot.modelType}`,
    '',
    `DEF ${defName}( )`,
    '',
    ...declLines,
    '',
    '  PTP HOME Vel=30% DEFAULT',
    '',
  ];

  stepsCopy.forEach(s => {
    if (s.label) lines.push(`  ; ${s.label}`);
    switch (s.type) {
      case 'MOVJ': {
        // B3 Fix: Vel=0%는 KRC 오류 유발 — 최소 1% 보장
        const sp = Math.max(1, Math.round((+(s.speed ?? 0.5)) * 100));
        lines.push(`  PTP P${s._pid} Vel=${sp}% PDAT${s._pid} Tool[1] Base[0]`);
        break;
      }
      case 'MOVL': {
        const sp = Math.max(1, Math.round((+(s.speed ?? 0.3)) * 2000));
        lines.push(`  LIN P${s._pid} Vel=${sp} mm/s CPDAT${s._pid} Tool[1] Base[0]`);
        break;
      }
      case 'GRIPPER': {
        const ch = s.action === 'open' ? 1 : 2;
        lines.push(`  $OUT[${ch}] = TRUE`);
        lines.push('  WAIT SEC 0.30');
        lines.push(`  $OUT[${ch}] = FALSE`);
        break;
      }
      case 'DOUT':
        lines.push(`  $OUT[${s.channel ?? 1}] = ${s.value ? 'TRUE' : 'FALSE'}`);
        break;
      case 'WAIT':
        lines.push(`  WAIT SEC ${(+(s.duration ?? 0.5)).toFixed(2)}`);
        break;
    }
  });

  lines.push('', '  PTP HOME Vel=30% DEFAULT', '', 'END');
  return lines.join('\n');
}

// ── AS Language (Kawasaki) ────────────────────────────────────────
// 실제 현장 포맷 (robot program.as 기반):
//   JOINT/LINEAR SPEED{1-9} ACCU{0-3} TIMER0 TOOL1 WORK0 CLAMP1 (OFF,0,0,O) OX= WX=  #[J1,J2,J3,J4,J5,J6,E1]  ;comment
// 포지션은 인라인 관절각(°) — 별도 포인트 파일 없음
// MOVL에 joints가 없을 때: TCP 좌표를 주석으로 표기하고 FK 필요 안내
export function renderKAS(ir) {
  const { robot, steps } = ir;
  const progName = robot.name.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase().slice(0, 24);

  // 0~1 → SPEED 레벨 1~9 (SPEED9=최고속, SPEED1=최저속)
  const speedLv = s => Math.max(1, Math.min(9, Math.round((+(s ?? 0.5)) * 9)));
  // zone 문자열 → ACCU 레벨
  const accuLv  = z => ({ fine: 0, z5: 1, z10: 1, z20: 2, z50: 3 }[z] ?? 1);
  // 관절 배열 → #[J1,J2,J3,J4,J5,J6,E1] (E1 기본 0)
  const fmtJ    = (j, e1 = 0) => {
    const a = j ?? [0, 0, 0, 0, 0, 0];
    return `#[${(+a[0]).toFixed(3)},${(+a[1]).toFixed(3)},${(+a[2]).toFixed(3)},${(+a[3]).toFixed(3)},${(+a[4]).toFixed(3)},${(+a[5]).toFixed(3)},${(+e1).toFixed(3)}]`;
  };

  const lines = [
    `; Generated by Flangemaster Robot Importer`,
    `; Robot: ${robot.name}  /  Model: ${robot.modelType}`,
    `; Date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `.PROGRAM ${progName}()#0`,
  ];

  steps.forEach(s => {
    const comment = s.label ? `  ;${s.label}` : '';
    switch (s.type) {
      case 'MOVJ':
        lines.push(
          `  JOINT SPEED${speedLv(s.speed)} ACCU${accuLv(s.zone)} TIMER0 TOOL1 WORK0 CLAMP1 (OFF,0,0,O) OX= WX=  ${fmtJ(s.joints)}${comment}`
        );
        break;
      case 'MOVL':
        if (s.joints?.length) {
          // joints 필드가 있을 때 (IK 결과 등) 그대로 사용
          lines.push(
            `  LINEAR SPEED${speedLv(s.speed)} ACCU${accuLv(s.zone)} TIMER0 TOOL1 WORK0 CLAMP1 (OFF,0,0,O) OX= WX=  ${fmtJ(s.joints)}${comment}`
          );
        } else {
          // TCP 좌표만 있을 때: 더미 관절각 출력 + FK 필요 안내
          const t = s.tcp ?? {};
          lines.push(
            `  LINEAR SPEED${speedLv(s.speed)} ACCU${accuLv(s.zone)} TIMER0 TOOL1 WORK0 CLAMP1 (OFF,0,0,O) OX= WX=  ` +
            `#[0.000,0.000,0.000,0.000,0.000,0.000,0.000]  ;[FK필요] X=${t.x??0} Y=${t.y??0} Z=${t.z??0}${comment}`
          );
        }
        break;
      case 'GRIPPER':
        // B2 Fix: GRIPPER 레이블을 별도 주석 줄로 출력 (comment는 TWAIT 줄에 붙이기 어려움)
        if (s.label) lines.push(`  ;${s.label}`);
        // 그리퍼: 진공/에어 실린더 방향 신호 (채널 번호는 현장 배선에 맞게 수정)
        if (s.action === 'open') {
          lines.push(`  SIGNAL -2  ;GRIPPER_CLOSE_OFF`);
          lines.push(`  SIGNAL 1   ;GRIPPER_OPEN`);
        } else {
          lines.push(`  SIGNAL -1  ;GRIPPER_OPEN_OFF`);
          lines.push(`  SIGNAL 2   ;GRIPPER_CLOSE`);
        }
        lines.push(`  TWAIT 0.30`);
        break;
      case 'DOUT': {
        const sig = s.value ? (s.channel ?? 1) : -(s.channel ?? 1);
        lines.push(`  SIGNAL ${sig}${comment}`);
        break;
      }
      case 'WAIT':
        lines.push(`  TWAIT ${(+(s.duration ?? 0.5)).toFixed(2)}${comment}`);
        break;
    }
  });

  lines.push('.END');
  return lines.join('\n');
}

// ── PLC JSON (plcjson/robot_joint_program.json과 동일한 순차 스텝 스키마) ──
// 로봇 티칭 코드(RAPID/KRL/JBI/KAS)와 달리 컨트롤러 방언이 없는 범용 JSON. PLC/상위 제어반이
// step 순서대로 그대로 소비할 수 있도록 만든 포맷으로, 재시도로 반복된 스텝도 그대로 나열된다
// (조건분기 문법 없이, 실제 실행된 순서를 있는 그대로 기록하는 것이 plcjson 선례의 방식).
export function renderPLC(ir) {
  const { robot, steps } = ir;

  const sequence = steps.map((s, i) => {
    const base = { step: i + 1 };
    if (s.label) base.description = s.label;

    switch (s.type) {
      case 'MOVJ':
        return {
          ...base,
          action: 'move_multi',
          motion: 'PTP',
          joint: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'],
          value: (s.joints ?? [0, 0, 0, 0, 0, 0]).map(v => +(+v).toFixed(3)),
          speed: +(s.speed ?? 0.5),
          delay: 0,
        };
      case 'MOVL': {
        const t = s.tcp ?? {};
        return {
          ...base,
          action: 'move_linear',
          motion: 'LIN',
          target: { x: +(t.x ?? 0).toFixed(3), y: +(t.y ?? 0).toFixed(3), z: +(t.z ?? 0).toFixed(3),
                    rx: +(t.rx ?? 0).toFixed(3), ry: +(t.ry ?? 0).toFixed(3), rz: +(t.rz ?? 0).toFixed(3) },
          speed: +(s.speed ?? 0.3),
          delay: 0,
        };
      }
      case 'GRIPPER':
        return { ...base, action: 'gripper', state: s.action === 'open' ? 'open' : 'close', delay: 0.3 };
      case 'DOUT':
        return { ...base, action: 'digital_out', channel: s.channel ?? 1, value: !!s.value, delay: 0 };
      case 'WAIT':
        return { ...base, action: 'wait', delay: +(s.duration ?? 0.5) };
      default:
        return { ...base, action: 'unknown', delay: 0 };
    }
  });

  const payload = {
    id: robot.name.replace(/[^A-Za-z0-9]/g, '_').toLowerCase(),
    name: robot.name,
    display_name: `${robot.name} — Flangemaster Export`,
    description: `Generated by Flangemaster Robot Importer on ${new Date().toISOString().slice(0, 10)}`,
    robot: { modelType: robot.modelType, dof: robot.dof },
    sequence,
  };

  return JSON.stringify(payload, null, 2);
}

export const FORMATS = [
  { id: 'KAS',   label: 'AS Language  (Kawasaki)',  ext: 'pg',   render: renderKAS   },
  { id: 'JBI',   label: 'JBI  (야스카와 Motoman)',  ext: 'JBI',  render: renderJBI   },
  { id: 'RAPID', label: 'RAPID  (ABB)',              ext: 'mod',  render: renderRAPID },
  { id: 'KRL',   label: 'KRL  (KUKA)',               ext: 'src',  render: renderKRL   },
  { id: 'PLC',   label: 'PLC JSON  (범용 순차 스텝)', ext: 'json', render: renderPLC   },
];

export const STEP_TYPES = [
  { id: 'MOVJ',    label: 'MOVJ — 관절 이동'       },
  { id: 'MOVL',    label: 'MOVL — 직선 이동 (TCP)' },
  { id: 'GRIPPER', label: 'GRIPPER — 그리퍼'       },
  { id: 'DOUT',    label: 'DOUT — 디지털 출력'     },
  { id: 'WAIT',    label: 'WAIT — 대기'            },
];

// ── 디지털 트윈 로그 → 티칭 스텝 추출 ───────────────────────────
// DigitalTwinEmitter.cs 페이로드 기준:
//   robot: { name, status('Run'|'Idle'), instructionIdx, j1~j6, speedFactor }
//   events: [ { type('grip'|'release'), gripperName, partName } ]

export function getRobotNamesFromLog(log) {
  const seen = new Set();
  for (const f of log) {
    for (const r of (f.robots ?? [])) {
      if (r.name) seen.add(r.name);
    }
  }
  return [...seen].sort();
}

// instrType 분류 헬퍼
const _MOTION_TYPES = new Set(['PTP', 'LIN', 'CIRC', 'ConfigurableInstruction']);
const _SKIP_TYPES   = new Set(['SpeedInstruction', 'MessageInstruction', 'ActionInstruction', 'GripInstruction']);

export function extractStepsFromLog(log, robotName) {
  // 1. 대상 로봇 프레임 추출 — instrType·tcp 포함 (DigitalTwinEmitter v2 기준)
  const frames = log
    .map(f => {
      const r = (f.robots ?? []).find(r => r.name === robotName);
      if (!r) return null;
      // retryAttempt > 0(VerifyRetryInstruction 등 복합 인스트럭션 실행 중)이면 그 안에서 실제로
      // 바뀌는 건 subInstrType이지 instructionIdx가 아니므로, 그 구간에서만 subInstrType을 idx 대용으로 쓴다.
      const inRetryBlock = (r.retryAttempt ?? 0) > 0;
      return {
        ts:        f._ts ?? 0,
        idx:       r.instructionIdx ?? 0,
        stat:      r.status ?? 'Idle',
        instrType: inRetryBlock ? (r.subInstrType || '') : (r.instrType ?? ''),   // 'PTP'|'LIN'|'WaitInstruction'|'GripInstruction'|...
        j:         [r.j1 ?? 0, r.j2 ?? 0, r.j3 ?? 0, r.j4 ?? 0, r.j5 ?? 0, r.j6 ?? 0],
        tcp:       { x: r.tcpX ?? 0, y: r.tcpY ?? 0, z: r.tcpZ ?? 0,
                     rx: r.tcpRx ?? 0, ry: r.tcpRy ?? 0, rz: r.tcpRz ?? 0 },
        spd:       r.speedFactor ?? 0.5,
        evts:      f.events ?? [],
        retryAttempt:   r.retryAttempt ?? 0,
        subInstrLabel:  r.subInstrLabel ?? '',
      };
    })
    .filter(Boolean);

  if (!frames.length) return [];

  const proto = []; // { ts, step }

  // 2. 첫 프레임 = 초기 홈 위치
  const f0 = frames[0];
  if (f0.j.some(j => Math.abs(j) > 0.5)) {
    proto.push({ ts: f0.ts - 1, step: { type: 'MOVJ', joints: [...f0.j], speed: 1.0, zone: 'fine', label: '' } });
  }

  // WAIT 구간 누적용
  let waitStartTs = null;
  let waitFrames  = 0;

  // 3. 프레임별 스텝 감지
  for (let i = 1; i < frames.length; i++) {
    const cur  = frames[i];
    const prev = frames[i - 1];
    // 일반 구간에서는 instructionIdx 변화가 스텝 경계. VerifyRetryInstruction 같은 복합 인스트럭션
    // 안에서는 idx가 고정되므로, 그 안에서 실제로 바뀐 instrType(= subInstrType 대체값, 위에서 매핑)도
    // 경계로 인정해야 재시도로 반복된 픽/삽입 스텝들이 각각 별도 스텝으로 잡힌다.
    const idxChanged = cur.idx !== prev.idx || cur.instrType !== prev.instrType;

    // WaitInstruction이 여러 프레임 지속될 때 누적 (1 frame ≈ PublishInterval = 1s)
    if (!idxChanged && prev.instrType === 'WaitInstruction') {
      if (waitStartTs === null) { waitStartTs = prev.ts; waitFrames = 1; }
      else waitFrames++;
    }

    // instructionIdx 변경 → 이전 인스트럭션 완료 처리
    if (idxChanged) {
      const t = prev.instrType;

      // WaitInstruction 완료 → WAIT 스텝 emit
      if (t === 'WaitInstruction') {
        const dur = Math.max(0.5, waitFrames + 1); // 프레임 수 × ~1s
        const waitLabel = prev.retryAttempt > 0 ? `재시도 ${prev.retryAttempt}회차 - 대기` : '대기';
        proto.push({ ts: waitStartTs ?? prev.ts, step: { type: 'WAIT', duration: dur, label: waitLabel } });
        waitStartTs = null; waitFrames = 0;
      }
      // SKIP 타입(Grip/Action/Speed/Message) — 이벤트 채널로 처리되므로 여기서 무시
      else if (_SKIP_TYPES.has(t)) {
        // no-op
      }
      // 모션 타입 또는 instrType 미지원(구버전 emitter) → 위치 기록
      else if (prev.j.some(j => Math.abs(j) > 0.5)) {
        // 재시도 블록 안이면 "재시도 N회차 - <라벨>" 형태로 표시 — 렌더러가 label을 그대로
        // 주석으로 출력하므로, 실제 로봇/PLC 코드에서도 재작업이 있었다는 사실이 남는다.
        const retryLabel = prev.retryAttempt > 0
          ? `재시도 ${prev.retryAttempt}회차${prev.subInstrLabel ? ` - ${prev.subInstrLabel}` : ''}`
          : '';
        if (t === 'LIN') {
          // LIN → MOVL: TCP 좌표 + joints(KAS LINEAR fallback용) 모두 기록
          proto.push({
            ts:   prev.ts,
            step: { type: 'MOVL', tcp: { ...prev.tcp }, joints: [...prev.j], speed: prev.spd, zone: 'z10', label: retryLabel },
          });
        } else {
          // PTP / CIRC / ConfigurableInstruction / '' (구버전) → MOVJ
          proto.push({
            ts:   prev.ts,
            step: { type: 'MOVJ', joints: [...prev.j], speed: prev.spd, zone: 'z10', label: retryLabel },
          });
        }
      }

      // idx가 바뀌었으니 WAIT 카운터 리셋 (Wait가 아닌 다른 인스트럭션으로 전환)
      if (t !== 'WaitInstruction') { waitStartTs = null; waitFrames = 0; }
    }

    // Run → Idle 전환 → 시퀀스 최종 도착 위치 보강
    if (prev.stat === 'Run' && cur.stat === 'Idle' && cur.j.some(j => Math.abs(j) > 0.5)) {
      const t = cur.instrType || prev.instrType;
      if (!_SKIP_TYPES.has(t) && t !== 'WaitInstruction') {
        proto.push({ ts: cur.ts, step: { type: 'MOVJ', joints: [...cur.j], speed: cur.spd, zone: 'fine', label: '' } });
      }
    }

    // 그리퍼 이벤트 (DigitalTwinEmitter.BuildGrippers 기반)
    const retryPrefix = cur.retryAttempt > 0 ? `재시도 ${cur.retryAttempt}회차 - ` : '';
    for (const ev of cur.evts) {
      if (ev.type === 'grip' || ev.type === 'release') {
        proto.push({
          ts:   cur.ts + 0.01,
          step: { type: 'GRIPPER', action: ev.type === 'grip' ? 'close' : 'open', label: `${retryPrefix}${ev.type === 'grip' ? '파지' : '해제'}` },
        });
        proto.push({
          ts:   cur.ts + 0.02,
          step: { type: 'WAIT', duration: 0.5, label: `${retryPrefix}${ev.type === 'grip' ? '파지 확인' : '해제 확인'}` },
        });
      }
    }
  }

  // 4. 시간순 정렬
  proto.sort((a, b) => a.ts - b.ts);

  // 5. 중복 제거
  //    - MOVJ: 관절각 정수 반올림 기준 dedup
  //    - MOVL: TCP 1mm 반올림 기준 dedup
  //    - 연속 WAIT: 병합 (긴 쪽 우선)
  const steps = [];
  const seenMovJSig = new Set();
  const seenMovLSig = new Set();

  for (const { step } of proto) {
    if (step.type === 'MOVJ') {
      const sig = step.joints.map(j => Math.round(j)).join(',');
      if (seenMovJSig.has(sig)) continue;
      seenMovJSig.add(sig);
    } else if (step.type === 'MOVL') {
      const t   = step.tcp ?? {};
      const sig = `${Math.round(t.x)},${Math.round(t.y)},${Math.round(t.z)}`;
      if (seenMovLSig.has(sig)) continue;
      seenMovLSig.add(sig);
    } else if (step.type === 'WAIT' && steps.length > 0 && steps[steps.length - 1].type === 'WAIT') {
      // 연속 WAIT → 더 긴 쪽으로 병합
      steps[steps.length - 1].duration = Math.max(steps[steps.length - 1].duration, step.duration);
      continue;
    }
    steps.push({ ...step });
  }

  // 6. MOVJ/MOVL 직전 → GRIPPER가 오면 zone을 fine으로 (정밀 파지/해제 위치)
  for (let i = 0; i < steps.length - 1; i++) {
    if ((steps[i].type === 'MOVJ' || steps[i].type === 'MOVL') && steps[i + 1].type === 'GRIPPER') {
      steps[i] = { ...steps[i], zone: 'fine' };
    }
  }

  // 7. 순번 레이블 부여
  let nJ = 0, nL = 0;
  for (const s of steps) {
    if (s.type === 'MOVJ') s.label = `포지션 ${++nJ}`;
    else if (s.type === 'MOVL') s.label = `직선이동 ${++nL}`;
  }

  return steps;
}

export function stepSummary(s) {
  switch (s.type) {
    case 'MOVJ': return `J=[${(s.joints ?? []).slice(0, 3).map(v => (+v).toFixed(1)).join(',')}…]`;
    case 'MOVL': { const t = s.tcp ?? {}; return `(${(t.x ?? 0).toFixed(0)}, ${(t.y ?? 0).toFixed(0)}, ${(t.z ?? 0).toFixed(0)})`; }
    case 'GRIPPER': return s.action === 'open' ? '열기' : '닫기';
    case 'DOUT': return `DO${s.channel ?? 1}=${s.value ? 'ON' : 'OFF'}`;
    case 'WAIT': return `${s.duration ?? 0.5}s`;
    default: return '';
  }
}
