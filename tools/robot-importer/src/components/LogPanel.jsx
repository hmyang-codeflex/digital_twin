import { useState, useMemo, memo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Download, BarChart2, Thermometer, Activity, Gauge, Timer, Radio, GitCompare, FileText, Database, Layers, RefreshCw } from 'lucide-react';
import { downloadText, REPORT_BASE_CSS } from '../utils/reportUtils.js';
import { exportTwinZip } from '../utils/twinExport.js';

const ROBOT_COLORS    = ['#6e8efb', '#a777e3', '#50c8a8', '#f5a623', '#e05252', '#38bdf8', '#fb7185', '#4ade80'];
const CONVEYOR_COLORS = ['#50c8a8', '#6e8efb', '#f5a623', '#a777e3', '#e05252'];
const SENSOR_COLORS   = ['#38bdf8', '#fb923c', '#a3e635', '#c084fc', '#f472b6'];

const WINDOWS = [
  { label: '1분',  pts: 60  },
  { label: '3분',  pts: 180 },
  { label: '전체', pts: 0   },
];

// ── 유틸 ──────────────────────────────────────────────────────
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function maxOf(arr) { return arr.length ? Math.max(...arr) : 0; }
function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}


function tickInterval(len) {
  if (len <= 10)  return 0;
  if (len <= 60)  return Math.floor(len / 6);
  if (len <= 180) return Math.floor(len / 6);
  return Math.floor(len / 5);
}

// ── 커스텀 툴팁 ──────────────────────────────────────────────
const ChartTooltip = memo(function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--shadow-md)',
      pointerEvents: 'none',
    }}>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, fontFamily: 'monospace' }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginLeft: 'auto', paddingLeft: 16 }}>
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
});

// ── 섹션 래퍼 ─────────────────────────────────────────────────
function ChartSection({ title, icon, children }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── 스탯 칩 ──────────────────────────────────────────────────
function StatChip({ label, value, unit, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--text-sub)' }}>
        {value}
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-faint)', marginLeft: 2 }}>{unit}</span>
      </span>
    </div>
  );
}

// ── 공통 차트 설정 ────────────────────────────────────────────
const CHART_MARGIN  = { top: 4, right: 12, left: -16, bottom: 0 };
const AXIS_STYLE    = { fontSize: 10, fill: 'var(--text-faint)', fontFamily: 'inherit' };
const GRID_PROPS    = { strokeDasharray: '3 3', stroke: 'var(--border)', vertical: false };
const ANIM_DURATION = 700;
const ANIM_EASING   = 'ease-out';
const LINE_PROPS    = { dot: false, strokeWidth: 1.5, animationDuration: ANIM_DURATION, animationEasing: ANIM_EASING };

// ── 메인 ──────────────────────────────────────────────────────
export default function LogPanel({ log, connected, cycleLog = [], stepLog = [], retryLog = [], alarmHistory = [], focus = [], onClearFocus }) {
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [windowIdx, setWindowIdx]         = useState(0);
  const [compareMode, setCompareMode]     = useState(false);

  // ── 이름 목록 ────────────────────────────────────────────────
  const robotNames = useMemo(() => {
    const s = new Set();
    log.forEach(snap => snap.robots?.forEach(r => s.add(r.name)));
    return [...s];
  }, [log]);

  const conveyorNames = useMemo(() => {
    const s = new Set();
    log.forEach(snap => snap.conveyors?.forEach(c => s.add(c.name)));
    return [...s];
  }, [log]);

  const sensorNames = useMemo(() => {
    const s = new Set();
    log.forEach(snap => snap.sensors?.forEach(sensor => s.add(sensor.name)));
    return [...s];
  }, [log]);

  const activeRobot = selectedRobot ?? robotNames[0] ?? null;

  // ── 시퀀스 구간 (ConfigurableTask로 실행된 "Cfg:<파일명>" 라벨이 바뀌는 지점마다 구간 분리) ──
  // 여러 시퀀스를 바꿔가며 비교 실험할 때, 로그의 어느 구간이 어떤 시퀀스였는지 구분하기 위함.
  const sequenceRuns = useMemo(() => {
    if (!activeRobot) return [];
    const runs = [];
    let current = null;
    for (const snap of log) {
      const r = snap.robots?.find(r => r.name === activeRobot);
      const seq = r?.activeSequence?.startsWith('Cfg:') ? r.activeSequence.slice(4) : null;
      if (seq !== current?.name) {
        if (current) current.end = snap._ts;
        if (seq) { current = { name: seq, start: snap._ts, end: snap._ts, count: 0 }; runs.push(current); }
        else current = null;
      }
      if (current) { current.end = snap._ts; current.count++; }
    }
    return runs;
  }, [log, activeRobot]);

  // ── 시간 윈도우 슬라이싱 ─────────────────────────────────────
  const windowedLog = useMemo(() => {
    const pts = WINDOWS[windowIdx].pts;
    return pts ? log.slice(-pts) : log;
  }, [log, windowIdx]);

  // ── 단일 로봇 시계열 ─────────────────────────────────────────
  const robotSeries = useMemo(() => {
    return windowedLog.map(snap => {
      const r = snap.robots?.find(r => r.name === activeRobot);
      if (!r) return null;
      return {
        t: fmtTime(snap._ts),
        온도: r.temperatureC, 전력: r.powerW, 토크: r.torqueNm,
        'TCP X': r.tcpX, 'TCP Y': r.tcpY, 'TCP Z': r.tcpZ,
      };
    }).filter(Boolean);
  }, [windowedLog, activeRobot]);

  // ── 비교 모드 시계열 (메트릭별로 모든 로봇) ─────────────────
  const compareRobotSeries = useMemo(() => {
    if (!compareMode) return [];
    return windowedLog.map(snap => {
      const entry = { t: fmtTime(snap._ts) };
      robotNames.forEach(name => {
        const r = snap.robots?.find(r => r.name === name);
        if (r) {
          entry[`${name}|온도`] = r.temperatureC;
          entry[`${name}|전력`] = r.powerW;
          entry[`${name}|토크`] = r.torqueNm;
        }
      });
      return entry;
    });
  }, [windowedLog, robotNames, compareMode]);

  // ── 컨베이어 시계열 ──────────────────────────────────────────
  const conveyorSeries = useMemo(() => {
    return windowedLog.map(snap => {
      const entry = { t: fmtTime(snap._ts) };
      conveyorNames.forEach(name => {
        const c = snap.conveyors?.find(c => c.name === name);
        if (c) entry[name] = c.speedMs;
      });
      return entry;
    });
  }, [windowedLog, conveyorNames]);

  // ── 센서 시계열 (볼트 감지 0/100%) ──────────────────────────
  const sensorSeries = useMemo(() => {
    return windowedLog.map(snap => {
      const entry = { t: fmtTime(snap._ts) };
      sensorNames.forEach(name => {
        const s = snap.sensors?.find(s => s.name === name);
        if (s !== undefined) entry[name] = s.boltPresent ? 100 : 0;
      });
      return entry;
    });
  }, [windowedLog, sensorNames]);

  // ── 세션 통계 ────────────────────────────────────────────────
  const sessionStats = useMemo(() => {
    if (!log.length) return null;
    const durSec = Math.round((log[log.length - 1]._ts - log[0]._ts) / 1000);
    const allT = [], allP = [], allQ = [];
    log.forEach(snap => snap.robots?.forEach(r => {
      allT.push(r.temperatureC);
      allP.push(r.powerW);
      allQ.push(r.torqueNm);
    }));
    return {
      duration:  `${Math.floor(durSec / 60)}m ${durSec % 60}s`,
      snapshots: log.length,
      avgTemp:   avg(allT).toFixed(1),  maxTemp:   maxOf(allT).toFixed(1),
      avgPower:  avg(allP).toFixed(0),  maxPower:  maxOf(allP).toFixed(0),
      avgTorque: avg(allQ).toFixed(1),  maxTorque: maxOf(allQ).toFixed(1),
    };
  }, [log]);

  // ── 사이클 타임 통계 ─────────────────────────────────────────
  const cycleStats = useMemo(() => {
    const stats = {};
    cycleLog.forEach(c => {
      if (!stats[c.robotName]) {
        stats[c.robotName] = { robotName: c.robotName, count: 0, total: 0, min: Infinity, max: -Infinity };
      }
      const s = stats[c.robotName];
      s.count++; s.total += c.durationMs;
      s.min = Math.min(s.min, c.durationMs);
      s.max = Math.max(s.max, c.durationMs);
    });
    return Object.values(stats).map(s => ({
      ...s, avg: s.total / s.count, min: s.min === Infinity ? 0 : s.min,
    }));
  }, [cycleLog]);

  // ── 스텝별(픽/경유/플레이스) 사이클 타임 통계 ─────────────────
  const stepStats = useMemo(() => {
    const stats = {};
    stepLog.forEach(s => {
      const key = `${s.robotName}|${s.step}`;
      if (!stats[key]) {
        stats[key] = { robotName: s.robotName, step: s.step, count: 0, total: 0, min: Infinity, max: -Infinity };
      }
      const st = stats[key];
      st.count++; st.total += s.durationMs;
      st.min = Math.min(st.min, s.durationMs);
      st.max = Math.max(st.max, s.durationMs);
    });
    return Object.values(stats).map(st => ({
      ...st, avg: st.total / st.count, min: st.min === Infinity ? 0 : st.min,
    }));
  }, [stepLog]);

  const activeRobotStepStats = useMemo(
    () => stepStats.filter(s => s.robotName === activeRobot),
    [stepStats, activeRobot]
  );

  // ── 재작업(재시도) 통계 — 볼트 검사 실패 등으로 픽부터 재시도한 횟수 집계 ──
  const retryStats = useMemo(() => {
    const stats = {};
    retryLog.forEach(r => {
      if (!stats[r.robotName]) stats[r.robotName] = { robotName: r.robotName, count: 0, maxAttempt: 0 };
      stats[r.robotName].count++;
      stats[r.robotName].maxAttempt = Math.max(stats[r.robotName].maxAttempt, r.attempt);
    });
    return Object.values(stats);
  }, [retryLog]);

  // ── 로봇×스텝 교차 집계 — 어느 로봇의 어느 단계(Pick/Hold/Place)에서 재시도가 몰리는지 ──
  // step이 비어있는(어느 단계인지 특정 못한) 기록은 "미상"으로 묶어 표시
  const retryStepStats = useMemo(() => {
    const stats = {};
    retryLog.forEach(r => {
      const step = r.step || '미상';
      const key = `${r.robotName}|${step}`;
      if (!stats[key]) stats[key] = { robotName: r.robotName, step, count: 0 };
      stats[key].count++;
    });
    return Object.values(stats).sort((a, b) => b.count - a.count);
  }, [retryLog]);

  // ── Y축 도메인 ───────────────────────────────────────────────
  const tempDomain = useMemo(() => {
    const vals = robotSeries.map(r => r.온도);
    if (!vals.length) return [20, 90];
    return [Math.max(20, Math.floor(Math.min(...vals) - 2)), Math.min(90, Math.ceil(Math.max(...vals) + 2))];
  }, [robotSeries]);

  const powerDomain = useMemo(() => {
    const vals = robotSeries.map(r => r.전력);
    if (!vals.length) return [0, 3000];
    return [0, Math.max(Math.ceil(Math.max(...vals) * 1.1 / 100) * 100, 500)];
  }, [robotSeries]);

  const xInterval    = tickInterval(robotSeries.length);
  const cmpXInterval = tickInterval(compareRobotSeries.length);
  const chartKey     = `${windowIdx}-${compareMode ? 'cmp' : activeRobot}`;

  // ── 내보내기 ────────────────────────────────────────────────
  function exportCsv() {
    if (!robotSeries.length) return;
    const header = 'time,온도(°C),전력(W),토크(Nm),TCP X,TCP Y,TCP Z';
    const rows = robotSeries.map(r =>
      `${r.t},${r.온도},${r.전력},${r.토크},${r['TCP X']},${r['TCP Y']},${r['TCP Z']}`
    );
    downloadText(`${activeRobot}_log.csv`, [header, ...rows].join('\n'));
  }

  function exportJson() {
    downloadText('session_log.json', JSON.stringify(log, null, 2));
  }

  function exportReport() {
    const ts      = new Date();
    const isoDate = ts.toISOString().slice(0, 10);

    const alarmRows = alarmHistory.map(a => `
      <tr>
        <td><span class="${a.level === 'danger' ? 'bd' : 'bw'}">${a.level === 'danger' ? '위험' : '경고'}</span></td>
        <td>${a.robotName}</td><td>${a.label}</td>
        <td>${a.value.toFixed(1)} ${a.unit}</td><td>${a.threshold} ${a.unit}</td>
        <td>${new Date(a.ts).toLocaleTimeString('ko-KR')}</td>
        <td>${a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleTimeString('ko-KR') : '—'}</td>
        <td>${a.resolvedAt ? new Date(a.resolvedAt).toLocaleTimeString('ko-KR') : '<em style="color:#dc2626">진행 중</em>'}</td>
      </tr>`).join('');

    const cycleRows = cycleStats.map(s =>
      `<tr><td>${s.robotName}</td><td>${s.count}</td><td>${fmtMs(s.avg)}</td><td>${fmtMs(s.min)}</td><td>${fmtMs(s.max)}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="utf-8">
<title>Flangemaster 세션 리포트 — ${ts.toLocaleDateString('ko-KR')}</title>
<style>${REPORT_BASE_CSS}
body{max-width:860px;margin:40px auto;padding:0 20px 60px}
</style>
</head><body>
<h1>Flangemaster 세션 리포트</h1>
<p class="meta">생성: ${ts.toLocaleString('ko-KR')} &nbsp;·&nbsp; 스냅샷 ${log.length}개</p>

<h2>세션 통계</h2>
<table><tbody>
<tr><th>세션 시간</th><td>${sessionStats?.duration ?? '—'}</td><th>스냅샷 수</th><td>${log.length}개</td></tr>
<tr><th>평균 온도</th><td>${sessionStats?.avgTemp ?? '—'} °C</td><th>최대 온도</th><td>${sessionStats?.maxTemp ?? '—'} °C</td></tr>
<tr><th>평균 전력</th><td>${sessionStats?.avgPower ?? '—'} W</td><th>최대 전력</th><td>${sessionStats?.maxPower ?? '—'} W</td></tr>
<tr><th>평균 토크</th><td>${sessionStats?.avgTorque ?? '—'} Nm</td><th>최대 토크</th><td>${sessionStats?.maxTorque ?? '—'} Nm</td></tr>
</tbody></table>

${cycleStats.length ? `<h2>사이클 타임</h2>
<table>
<thead><tr><th>로봇</th><th>총 사이클</th><th>평균</th><th>최단</th><th>최장</th></tr></thead>
<tbody>${cycleRows}</tbody>
</table>` : ''}

<h2>알람 이력 (${alarmHistory.length}건)</h2>
${alarmHistory.length ? `<table>
<thead><tr><th>레벨</th><th>로봇</th><th>항목</th><th>값</th><th>기준</th><th>발생</th><th>확인</th><th>해소</th></tr></thead>
<tbody>${alarmRows}</tbody>
</table>` : '<p style="font-size:12px;color:#888;margin:0">알람 이력 없음</p>'}

<div class="footer">Flangemaster Digital Twin Monitor &nbsp;·&nbsp; ${ts.getFullYear()}</div>
</body></html>`;

    downloadText(`flangemaster_report_${isoDate}.html`, html, 'text/html');
  }

  // ── 빈 상태 ──────────────────────────────────────────────────
  if (!log.length) {
    const filteredOut = focus.length > 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <BarChart2 size={32} strokeWidth={1.2} color="var(--text-sub)" />
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {filteredOut ? '선택된 오브젝트의 데이터 없음' : '수집된 데이터 없음'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: filteredOut ? 12 : 0 }}>
          {filteredOut
            ? `모니터에서 선택한 오브젝트(${focus.join(', ')})가 이 세션 로그에 없습니다.`
            : '모니터 탭에서 Unity 데이터를 수신하면 여기에 차트가 표시됩니다.'}
        </p>
        {filteredOut && (
          <button
            onClick={onClearFocus}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)',
            }}
          >
            전체 보기로 전환
          </button>
        )}
      </div>
    );
  }

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 관심 오브젝트 필터 안내 (모니터 탭과 선택 공유) ───── */}
      {focus.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '6px 12px',
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
            모니터에서 선택된 {focus.length}개 오브젝트만 표시 중 ({focus.join(', ')})
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClearFocus}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)',
            }}
          >
            전체 보기
          </button>
        </div>
      )}

      {/* ── 헤더 바 ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* 연결 상태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--success)' : 'var(--text-faint)',
            boxShadow: connected ? '0 0 6px rgba(10,138,103,0.5)' : 'none',
          }} />
          <span style={{ fontSize: 11, color: connected ? 'var(--success)' : 'var(--text-faint)', fontWeight: 600 }}>
            {connected ? '실시간 수신 중' : '연결 끊김'}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>전체 {log.length}개</span>

        {/* 시간 윈도우 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map((w, i) => (
            <button key={w.label} onClick={() => setWindowIdx(i)} style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid',
              borderColor: windowIdx === i ? 'var(--accent)' : 'var(--border)',
              background:  windowIdx === i ? 'var(--bg-card)' : 'transparent',
              color:       windowIdx === i ? 'var(--accent)'  : 'var(--text-muted)',
              cursor: 'pointer',
            }}>{w.label}</button>
          ))}
        </div>

        {/* 비교 모드 토글 (2개 이상 로봇) */}
        {robotNames.length > 1 && (
          <button onClick={() => setCompareMode(m => !m)} style={{
            ...btnStyle,
            borderColor: compareMode ? 'var(--accent)' : 'var(--border)',
            color:       compareMode ? 'var(--accent)' : 'var(--text-muted)',
            background:  compareMode ? 'var(--bg-card)' : 'transparent',
          }}>
            <GitCompare size={12} /> 비교 모드
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={exportCsv}    style={btnStyle}><Download size={12} /> {activeRobot} CSV</button>
        <button onClick={exportJson}   style={btnStyle}><Download size={12} /> 전체 JSON</button>
        <button onClick={exportReport} style={btnStyle}><FileText size={12} /> 리포트</button>
        <button
          onClick={() => exportTwinZip(log)}
          disabled={!log.length}
          style={{ ...btnStyle, borderColor: log.length ? 'var(--accent)' : 'var(--border)', color: log.length ? 'var(--accent)' : 'var(--text-faint)' }}
          title="schema.sql + CSV 4개를 ZIP으로 묶어 내보냅니다"
        >
          <Database size={12} /> DB 내보내기
        </button>
      </div>

      {/* ── 세션 통계 칩 ──────────────────────────────────────── */}
      {sessionStats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatChip label="세션 시간"  value={sessionStats.duration}   unit="" />
          <StatChip label="스냅샷 수"  value={sessionStats.snapshots}  unit="개" />
          <StatChip label="평균 온도"  value={sessionStats.avgTemp}    unit="°C" />
          <StatChip label="최대 온도"  value={sessionStats.maxTemp}    unit="°C"  color="var(--warning)" />
          <StatChip label="평균 전력"  value={sessionStats.avgPower}   unit="W" />
          <StatChip label="최대 전력"  value={sessionStats.maxPower}   unit="W"   color="var(--warning)" />
          <StatChip label="평균 토크"  value={sessionStats.avgTorque}  unit="Nm" />
          <StatChip label="최대 토크"  value={sessionStats.maxTorque}  unit="Nm"  color="var(--warning)" />
        </div>
      )}

      {/* ── 로봇 선택 탭 (단일 모드) ─────────────────────────── */}
      {!compareMode && robotNames.length > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {robotNames.map((name, i) => (
            <button key={name} onClick={() => setSelectedRobot(name)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, border: '1px solid',
              borderColor: activeRobot === name ? ROBOT_COLORS[i % ROBOT_COLORS.length] : 'var(--border)',
              background:  activeRobot === name ? 'var(--bg-card)' : 'transparent',
              color:       activeRobot === name ? ROBOT_COLORS[i % ROBOT_COLORS.length] : 'var(--text-muted)',
              cursor: 'pointer',
            }}>{name}</button>
          ))}
        </div>
      )}

      {/* ── 시퀀스 구간 요약 (ConfigurableTask로 실행된 시퀀스가 있을 때만) ── */}
      {!compareMode && sequenceRuns.length > 0 && (
        <ChartSection title={`${activeRobot} 시퀀스 실행 구간`} icon={<Layers size={14} color="var(--text-muted)" />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sequenceRuns.map((run, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0 }}>{run.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  {fmtTime(run.start)} ~ {fmtTime(run.end)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{run.count}개 스냅샷</span>
              </div>
            ))}
          </div>
        </ChartSection>
      )}

      {/* ── 비교 모드 차트 (메트릭별 개별 차트) ──────────────── */}
      {compareMode && compareRobotSeries.length > 0 && (
        <>
          <ChartSection title="온도 비교 (°C)" icon={<Thermometer size={14} color="var(--text-muted)" />}>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart key={`cmp-temp-${chartKey}`} data={compareRobotSeries} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="t" tick={AXIS_STYLE} interval={cmpXInterval} />
                <YAxis tick={AXIS_STYLE} unit="°C" domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {robotNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={`${name}|온도`} name={name}
                    stroke={ROBOT_COLORS[i % ROBOT_COLORS.length]} {...LINE_PROPS} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title="전력 비교 (W)" icon={<Activity size={14} color="var(--text-muted)" />}>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart key={`cmp-pwr-${chartKey}`} data={compareRobotSeries} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="t" tick={AXIS_STYLE} interval={cmpXInterval} />
                <YAxis tick={AXIS_STYLE} unit="W" domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {robotNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={`${name}|전력`} name={name}
                    stroke={ROBOT_COLORS[i % ROBOT_COLORS.length]} {...LINE_PROPS} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title="토크 비교 (Nm)" icon={<Gauge size={14} color="var(--text-muted)" />}>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart key={`cmp-trq-${chartKey}`} data={compareRobotSeries} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="t" tick={AXIS_STYLE} interval={cmpXInterval} />
                <YAxis tick={AXIS_STYLE} unit="Nm" domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {robotNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={`${name}|토크`} name={name}
                    stroke={ROBOT_COLORS[i % ROBOT_COLORS.length]} {...LINE_PROPS} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>
        </>
      )}

      {/* ── 단일 로봇 차트 ────────────────────────────────────── */}
      {!compareMode && (
        <>
          <ChartSection title="온도 · 전력 · 토크" icon={<Thermometer size={14} color="var(--text-muted)" />}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart key={`tp-${chartKey}`} data={robotSeries} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="t" tick={AXIS_STYLE} interval={xInterval} />
                <YAxis yAxisId="temp"  tick={AXIS_STYLE} unit="°C" domain={tempDomain} />
                <YAxis yAxisId="power" tick={AXIS_STYLE} unit="W"  orientation="right" domain={powerDomain} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="temp"  type="monotone" dataKey="온도" stroke="#e05252" {...LINE_PROPS} />
                <Line yAxisId="power" type="monotone" dataKey="전력" stroke="#f5a623" {...LINE_PROPS} />
                <Line yAxisId="temp"  type="monotone" dataKey="토크" stroke="#6e8efb" {...LINE_PROPS} />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          <ChartSection title="TCP 위치 (m)" icon={<Activity size={14} color="var(--text-muted)" />}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart key={`tcp-${chartKey}`} data={robotSeries} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="t" tick={AXIS_STYLE} interval={xInterval} />
                <YAxis tick={AXIS_STYLE} unit="m" domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="TCP X" stroke="#6e8efb" {...LINE_PROPS} />
                <Line type="monotone" dataKey="TCP Y" stroke="#50c8a8" {...LINE_PROPS} />
                <Line type="monotone" dataKey="TCP Z" stroke="#a777e3" {...LINE_PROPS} />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>
        </>
      )}

      {/* ── 컨베이어 속도 ─────────────────────────────────────── */}
      {conveyorNames.length > 0 && (
        <ChartSection title="컨베이어 속도 (m/s)" icon={<Gauge size={14} color="var(--text-muted)" />}>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart key={`cv-${chartKey}`} data={conveyorSeries} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="t" tick={AXIS_STYLE} interval={tickInterval(conveyorSeries.length)} />
              <YAxis tick={AXIS_STYLE} unit="m/s" domain={[0, 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {conveyorNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name}
                  stroke={CONVEYOR_COLORS[i % CONVEYOR_COLORS.length]} {...LINE_PROPS} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {/* ── 볼트 감지 현황 ────────────────────────────────────── */}
      {sensorNames.length > 0 && (
        <ChartSection title="볼트 감지 현황 (%)" icon={<Radio size={14} color="var(--text-muted)" />}>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart key={`snsr-${chartKey}`} data={sensorSeries} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="t" tick={AXIS_STYLE} interval={tickInterval(sensorSeries.length)} />
              <YAxis tick={AXIS_STYLE} unit="%" domain={[0, 100]} ticks={[0, 50, 100]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {sensorNames.map((name, i) => (
                <Line key={name} type="stepAfter" dataKey={name}
                  stroke={SENSOR_COLORS[i % SENSOR_COLORS.length]} {...LINE_PROPS} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {/* ── 사이클 타임 ───────────────────────────────────────── */}
      {cycleStats.length > 0 && (
        <ChartSection title="사이클 타임" icon={<Timer size={14} color="var(--text-muted)" />}>

          {/* 로봇별 통계 카드 */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {cycleStats.map(s => (
              <div key={s.robotName} style={{
                flex: 1, minWidth: 180,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 10 }}>
                  {s.robotName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  {[
                    { label: '총 사이클', val: `${s.count}회`         },
                    { label: '평균',      val: fmtMs(s.avg)            },
                    { label: '최단',      val: fmtMs(s.min), c: 'var(--success)' },
                    { label: '최장',      val: fmtMs(s.max), c: 'var(--warning)' },
                  ].map(({ label, val, c }) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c ?? 'var(--text)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 최근 사이클 테이블 */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['로봇', '시작', '종료', '사이클 시간'].map(h => (
                    <th key={h} style={{
                      padding: '6px 12px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-sub)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--bg-hover)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycleLog.slice(0, 15).map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px', color: 'var(--text)', fontWeight: 600 }}>{c.robotName}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtTime(c.start)}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtTime(c.end)}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text)', fontWeight: 700 }}>{fmtMs(c.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cycleLog.length > 15 && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', padding: '8px 0' }}>
                +{cycleLog.length - 15}개 추가 사이클 (JSON 내보내기에 전체 포함)
              </div>
            )}
          </div>
        </ChartSection>
      )}

      {/* ── 스텝별(픽/경유/플레이스) 사이클 타임 ──────────────── */}
      {!compareMode && activeRobotStepStats.length > 0 && (
        <ChartSection title={`${activeRobot} 스텝별 사이클 타임`} icon={<Timer size={14} color="var(--text-muted)" />}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {activeRobotStepStats.map(s => (
              <div key={s.step} style={{
                flex: 1, minWidth: 150,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 10 }}>
                  {s.step}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  {[
                    { label: '횟수', val: `${s.count}회` },
                    { label: '평균', val: fmtMs(s.avg) },
                    { label: '최단', val: fmtMs(s.min), c: 'var(--success)' },
                    { label: '최장', val: fmtMs(s.max), c: 'var(--warning)' },
                  ].map(({ label, val, c }) => (
                    <div key={label}>
                      <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c ?? 'var(--text)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ChartSection>
      )}

      {/* ── 재작업(재시도) 이력 — 볼트 검사 실패 등으로 픽부터 재시도한 빈도 ──── */}
      {retryStats.length > 0 && (
        <ChartSection title="재작업(재시도) 이력" icon={<RefreshCw size={14} color="var(--text-muted)" />}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {retryStats.map(s => (
              <div key={s.robotName} style={{
                flex: 1, minWidth: 180,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 10 }}>
                  {s.robotName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>재시도 발생</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>{s.count}회</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>최대 시도 차수</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.maxAttempt}회차</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {retryStepStats.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                재시도가 몰리는 구간 (많은 순)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {retryStepStats.map((s, i) => {
                  const maxCount = retryStepStats[0]?.count || 1;
                  return (
                    <div key={`${s.robotName}|${s.step}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-sub)', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.robotName} · {s.step}
                      </span>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${(s.count / maxCount) * 100}%`,
                          background: 'var(--warning)', borderRadius: 4, transition: 'width 0.3s',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', width: 36, textAlign: 'right', flexShrink: 0 }}>{s.count}회</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartSection>
      )}

    </div>
  );
}

const btnStyle = {
  display: 'flex', alignItems: 'center', gap: 5,
  fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '5px 10px',
  cursor: 'pointer',
};
