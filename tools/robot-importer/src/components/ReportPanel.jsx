import { useState, useMemo } from 'react';
import { Download, Printer, ClipboardList, Activity, Radio, Bell, Timer, RefreshCw } from 'lucide-react';
import { downloadText, REPORT_BASE_CSS } from '../utils/reportUtils.js';

// ── 유틸 ──────────────────────────────────────────────────────
function avg(arr)   { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function maxOf(arr) { return arr.length ? Math.max(...arr) : 0; }
function fmtMs(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}
function fmtDatetime(ts) {
  return new Date(ts).toLocaleString('ko-KR', { hour12: false });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
}

const RANGES = [
  { label: '전체 세션', pts: 0   },
  { label: '최근 1분',  pts: 60  },
  { label: '최근 3분',  pts: 180 },
  { label: '최근 5분',  pts: 300 },
];

const ROBOT_COLORS   = ['#6e8efb', '#a777e3', '#50c8a8', '#f5a623', '#e05252'];
const SENSOR_COLORS  = ['#10b981', '#38bdf8', '#a3e635', '#c084fc', '#f472b6'];

// ── 가동률 바 ─────────────────────────────────────────────────
function UtilBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 7, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`,
          background: color, borderRadius: 4,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

// ── 섹션 카드 ─────────────────────────────────────────────────
function Card({ title, icon, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--shadow-sm)', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── KPI 칩 ────────────────────────────────────────────────────
function KPI({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center',
      padding: '10px 8px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────
export default function ReportPanel({ log, cycleLog = [], stepLog = [], retryLog = [], alarmHistory = [], focus = [], onClearFocus }) {
  const [rangeIdx, setRangeIdx] = useState(0);

  // ── 로그 슬라이싱 ────────────────────────────────────────────
  const filteredLog = useMemo(() => {
    const pts = RANGES[rangeIdx].pts;
    return pts ? log.slice(-pts) : log;
  }, [log, rangeIdx]);

  const rangeStart = filteredLog[0]?._ts ?? null;
  const rangeEnd   = filteredLog[filteredLog.length - 1]?._ts ?? null;
  const durSec     = rangeStart && rangeEnd ? Math.round((rangeEnd - rangeStart) / 1000) : 0;

  // ── 로봇 가동률 + 지표 ───────────────────────────────────────
  const robotStats = useMemo(() => {
    const m = {};
    filteredLog.forEach(snap => {
      snap.robots?.forEach(r => {
        if (!m[r.name]) m[r.name] = { total: 0, run: 0, temps: [], powers: [], torques: [] };
        const s = m[r.name];
        s.total++;
        if (r.status === 'Run') s.run++;
        s.temps.push(r.temperatureC);
        s.powers.push(r.powerW);
        s.torques.push(r.torqueNm);
      });
    });
    return Object.entries(m).map(([name, s]) => ({
      name,
      utilization: s.total > 0 ? (s.run / s.total) * 100 : 0,
      avgTemp:  avg(s.temps).toFixed(1),   maxTemp:   maxOf(s.temps).toFixed(1),
      avgPower: avg(s.powers).toFixed(0),  maxPower:  maxOf(s.powers).toFixed(0),
      avgTorque: avg(s.torques).toFixed(1), maxTorque: maxOf(s.torques).toFixed(1),
    }));
  }, [filteredLog]);

  // ── 볼트 감지 현황 ───────────────────────────────────────────
  const sensorStats = useMemo(() => {
    const m = {};
    filteredLog.forEach(snap => {
      snap.sensors?.forEach(s => {
        if (!m[s.name]) m[s.name] = { total: 0, detected: 0 };
        m[s.name].total++;
        if (s.boltPresent) m[s.name].detected++;
      });
    });
    return Object.entries(m).map(([name, s]) => ({
      name,
      rate:     s.total > 0 ? (s.detected / s.total) * 100 : 0,
      detected: s.detected,
      total:    s.total,
    }));
  }, [filteredLog]);

  // ── 사이클 타임 ─────────────────────────────────────────────
  const cycleStats = useMemo(() => {
    const inRange = rangeStart
      ? cycleLog.filter(c => c.start >= rangeStart && c.end <= (rangeEnd ?? Date.now()))
      : cycleLog;
    const m = {};
    inRange.forEach(c => {
      if (!m[c.robotName]) m[c.robotName] = { count: 0, total: 0, min: Infinity, max: -Infinity };
      const s = m[c.robotName];
      s.count++; s.total += c.durationMs;
      s.min = Math.min(s.min, c.durationMs);
      s.max = Math.max(s.max, c.durationMs);
    });
    return Object.entries(m).map(([name, s]) => ({
      name, count: s.count,
      avg: s.total / s.count,
      min: s.min === Infinity ? 0 : s.min,
      max: s.max === -Infinity ? 0 : s.max,
    }));
  }, [cycleLog, rangeStart, rangeEnd]);

  // ── 스텝별(픽/경유/플레이스) 사이클 타임 통계 ─────────────────
  const stepStats = useMemo(() => {
    const inRange = rangeStart
      ? stepLog.filter(s => s.start >= rangeStart && s.end <= (rangeEnd ?? Date.now()))
      : stepLog;
    const m = {};
    inRange.forEach(s => {
      const key = `${s.robotName}|${s.step}`;
      if (!m[key]) m[key] = { robotName: s.robotName, step: s.step, count: 0, total: 0, min: Infinity, max: -Infinity };
      const st = m[key];
      st.count++; st.total += s.durationMs;
      st.min = Math.min(st.min, s.durationMs);
      st.max = Math.max(st.max, s.durationMs);
    });
    return Object.values(m).map(st => ({
      ...st, avg: st.total / st.count,
      min: st.min === Infinity ? 0 : st.min,
      max: st.max === -Infinity ? 0 : st.max,
    }));
  }, [stepLog, rangeStart, rangeEnd]);

  // ── 재작업(재시도) 통계 — 볼트 검사 실패 등으로 픽부터 재시도한 횟수 ──
  const retryStats = useMemo(() => {
    const inRange = rangeStart
      ? retryLog.filter(r => r.ts >= rangeStart && r.ts <= (rangeEnd ?? Date.now()))
      : retryLog;
    const m = {};
    inRange.forEach(r => {
      if (!m[r.robotName]) m[r.robotName] = { robotName: r.robotName, count: 0, maxAttempt: 0 };
      m[r.robotName].count++;
      m[r.robotName].maxAttempt = Math.max(m[r.robotName].maxAttempt, r.attempt);
    });
    return Object.values(m);
  }, [retryLog, rangeStart, rangeEnd]);

  // ── 로봇×스텝 교차 집계 — 어느 로봇의 어느 단계에서 재시도가 몰리는지 순위 ──
  const retryStepStats = useMemo(() => {
    const inRange = rangeStart
      ? retryLog.filter(r => r.ts >= rangeStart && r.ts <= (rangeEnd ?? Date.now()))
      : retryLog;
    const m = {};
    inRange.forEach(r => {
      const step = r.step || '미상';
      const key = `${r.robotName}|${step}`;
      if (!m[key]) m[key] = { robotName: r.robotName, step, count: 0 };
      m[key].count++;
    });
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [retryLog, rangeStart, rangeEnd]);

  // ── 알람 요약 ────────────────────────────────────────────────
  const alarmStats = useMemo(() => {
    const items = rangeStart
      ? alarmHistory.filter(a => a.ts >= rangeStart)
      : alarmHistory;
    return {
      items,
      total:   items.length,
      danger:  items.filter(a => a.level === 'danger').length,
      warning: items.filter(a => a.level === 'warning').length,
      resolved: items.filter(a => a.resolvedAt).length,
      active:   items.filter(a => !a.resolvedAt).length,
    };
  }, [alarmHistory, rangeStart]);

  // ── HTML 리포트 생성 ─────────────────────────────────────────
  function generateHtml(autoPrint = false) {
    const now     = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const durStr  = durSec ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : '—';

    const robotRows = robotStats.map(r => `
      <tr>
        <td>${r.name}</td>
        <td><b>${r.utilization.toFixed(1)}%</b></td>
        <td>${r.avgTemp} / ${r.maxTemp} °C</td>
        <td>${r.avgPower} / ${r.maxPower} W</td>
        <td>${r.avgTorque} / ${r.maxTorque} Nm</td>
      </tr>`).join('');

    const sensorRows = sensorStats.map(s => `
      <tr>
        <td>${s.name}</td>
        <td><b>${s.rate.toFixed(1)}%</b></td>
        <td>${s.detected} / ${s.total}회</td>
      </tr>`).join('');

    const cycleRows = cycleStats.map(c => `
      <tr>
        <td>${c.name}</td><td>${c.count}회</td>
        <td>${fmtMs(c.avg)}</td><td>${fmtMs(c.min)}</td><td>${fmtMs(c.max)}</td>
      </tr>`).join('');

    const stepRows = stepStats.map(s => `
      <tr>
        <td>${s.robotName}</td><td>${s.step}</td><td>${s.count}회</td>
        <td>${fmtMs(s.avg)}</td><td>${fmtMs(s.min)}</td><td>${fmtMs(s.max)}</td>
      </tr>`).join('');

    const retryRows = retryStats.map(s => `
      <tr>
        <td>${s.robotName}</td><td>${s.count}회</td><td>${s.maxAttempt}회차</td>
      </tr>`).join('');

    const retryStepRows = retryStepStats.map(s => `
      <tr>
        <td>${s.robotName}</td><td>${s.step}</td><td>${s.count}회</td>
      </tr>`).join('');

    const alarmRows = alarmStats.items.map(a => `
      <tr>
        <td><span class="${a.level === 'danger' ? 'bd' : 'bw'}">${a.level === 'danger' ? '위험' : '경고'}</span></td>
        <td>${a.robotName}</td><td>${a.label}</td>
        <td>${a.value.toFixed(1)} ${a.unit}</td>
        <td>${fmtTime(a.ts)}</td>
        <td>${a.resolvedAt ? fmtTime(a.resolvedAt) : '<em style="color:#dc2626">진행 중</em>'}</td>
      </tr>`).join('');

    const robotBars = robotStats.map(r => `
      <div class="bar-row">
        <div class="bar-label"><span>${r.name}</span><b>${r.utilization.toFixed(1)}%</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(r.utilization, 100).toFixed(1)}%"></div></div>
      </div>`).join('') || '<p class="empty">데이터 없음</p>';

    const sensorBars = sensorStats.map(s => `
      <div class="bar-row">
        <div class="bar-label"><span>${s.name}</span><b>${s.rate.toFixed(1)}%</b></div>
        <div class="bar-track"><div class="bar-fill green" style="width:${Math.min(s.rate, 100).toFixed(1)}%"></div></div>
      </div>`).join('') || '<p class="empty">센서 데이터 없음</p>';

    return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="utf-8">
<title>Flangemaster 현장 리포트 — ${isoDate}</title>
<style>${REPORT_BASE_CSS}
body{padding:40px;max-width:960px;margin:0 auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:8px}
.card{border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px}
.card h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:12px}
.bar-row{margin-bottom:8px}
.bar-label{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}
.bar-track{height:7px;background:#f0f0f0;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;background:#6e8efb}
.bar-fill.green{background:#10b981}
.kpi-row{display:flex;gap:12px;margin-bottom:8px}
.kpi{flex:1;text-align:center;padding:10px 6px;background:#fafafa;border:1px solid #eee;border-radius:8px}
.kpi .v{font-size:22px;font-weight:800;line-height:1}
.kpi .l{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-top:3px}
.empty{font-size:12px;color:#bbb}
.card{break-inside:avoid}
</style>
</head><body>

<h1>Flangemaster 현장 리포트</h1>
<p class="meta">
  생성: ${now.toLocaleString('ko-KR')} &nbsp;·&nbsp;
  보고 범위: ${rangeStart ? fmtDatetime(rangeStart) : '—'} ~ ${rangeEnd ? fmtDatetime(rangeEnd) : '—'} &nbsp;·&nbsp;
  세션 시간: ${durStr} &nbsp;·&nbsp; 스냅샷 ${filteredLog.length}개
</p>

<div class="grid2">
  <div class="card"><h3>로봇 가동률</h3>${robotBars}</div>
  <div class="card"><h3>볼팅 감지 현황</h3>${sensorBars}</div>
</div>

<h2>알람 요약</h2>
<div class="kpi-row">
  <div class="kpi"><div class="v">${alarmStats.total}</div><div class="l">총 알람</div></div>
  <div class="kpi"><div class="v" style="color:#dc2626">${alarmStats.danger}</div><div class="l">위험</div></div>
  <div class="kpi"><div class="v" style="color:#d97706">${alarmStats.warning}</div><div class="l">경고</div></div>
  <div class="kpi"><div class="v" style="color:#16a34a">${alarmStats.resolved}</div><div class="l">해소</div></div>
  <div class="kpi"><div class="v" style="color:#dc2626">${alarmStats.active}</div><div class="l">진행 중</div></div>
</div>
${alarmRows ? `<table><thead><tr><th>레벨</th><th>로봇</th><th>항목</th><th>값</th><th>발생</th><th>해소</th></tr></thead><tbody>${alarmRows}</tbody></table>` : ''}

${robotStats.length ? `<h2>로봇별 상세 지표</h2>
<table>
<thead><tr><th>로봇</th><th>가동률</th><th>온도 평균/최대</th><th>전력 평균/최대</th><th>토크 평균/최대</th></tr></thead>
<tbody>${robotRows}</tbody></table>` : ''}

${sensorStats.length ? `<h2>볼팅 감지 상세</h2>
<table>
<thead><tr><th>센서</th><th>감지율</th><th>감지 / 전체</th></tr></thead>
<tbody>${sensorRows}</tbody></table>` : ''}

${cycleStats.length ? `<h2>사이클 타임</h2>
<table>
<thead><tr><th>로봇</th><th>사이클 수</th><th>평균</th><th>최단</th><th>최장</th></tr></thead>
<tbody>${cycleRows}</tbody></table>` : ''}

${stepStats.length ? `<h2>스텝별 사이클 타임</h2>
<table>
<thead><tr><th>로봇</th><th>스텝</th><th>횟수</th><th>평균</th><th>최단</th><th>최장</th></tr></thead>
<tbody>${stepRows}</tbody></table>` : ''}

${retryStats.length ? `<h2>재작업(재시도) 이력</h2>
<table>
<thead><tr><th>로봇</th><th>재시도 발생</th><th>최대 시도 차수</th></tr></thead>
<tbody>${retryRows}</tbody></table>` : ''}

${retryStepStats.length ? `<h2>재시도가 몰리는 구간 (많은 순)</h2>
<table>
<thead><tr><th>로봇</th><th>단계</th><th>재시도 횟수</th></tr></thead>
<tbody>${retryStepRows}</tbody></table>` : ''}

<div class="footer">Flangemaster Digital Twin Monitor &nbsp;·&nbsp; ${now.getFullYear()}</div>
${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),400));</script>' : ''}
</body></html>`;
  }

  function downloadHtml() {
    downloadText(
      `flangemaster_report_${new Date().toISOString().slice(0, 10)}.html`,
      generateHtml(false), 'text/html'
    );
  }

  function printReport() {
    const html = generateHtml(true);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) downloadHtml(); // 팝업 차단 시 파일로 폴백
  }

  // ── 빈 상태 ──────────────────────────────────────────────────
  if (!log.length) {
    const filteredOut = focus.length > 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <ClipboardList size={40} strokeWidth={1} color="var(--text-faint)" />
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          {filteredOut ? '선택된 오브젝트의 데이터 없음' : '수집된 데이터 없음'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {filteredOut
            ? `모니터에서 선택한 오브젝트(${focus.join(', ')})가 이 세션 로그에 없습니다.`
            : 'Unity에서 데이터를 수신하면 리포트를 생성할 수 있습니다.'}
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
            모니터에서 선택된 {focus.length}개 오브젝트만 반영된 리포트입니다 ({focus.join(', ')})
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
        {/* 범위 선택 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRangeIdx(i)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 6, border: '1px solid',
              borderColor: rangeIdx === i ? 'var(--accent)' : 'var(--border)',
              background:  rangeIdx === i ? 'var(--bg-card)' : 'transparent',
              color:       rangeIdx === i ? 'var(--accent)'  : 'var(--text-muted)',
              cursor: 'pointer',
            }}>{r.label}</button>
          ))}
        </div>

        {/* 범위 메타 */}
        {rangeStart && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {fmtDatetime(rangeStart)} ~ {fmtDatetime(rangeEnd)} &nbsp;·&nbsp;
            {durSec ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : '—'} &nbsp;·&nbsp;
            {filteredLog.length}개 스냅샷
          </span>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={downloadHtml} style={btnStyle}><Download size={12} /> HTML 저장</button>
        <button onClick={printReport}  style={btnStyle}><Printer  size={12} /> 인쇄 / PDF</button>
      </div>

      {/* ── 가동률 + 볼팅 감지 ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="로봇 가동률" icon={<Activity size={13} color="var(--text-muted)" />}>
          {robotStats.length > 0
            ? robotStats.map((r, i) => (
                <UtilBar key={r.name} label={r.name} pct={r.utilization} color={ROBOT_COLORS[i % ROBOT_COLORS.length]} />
              ))
            : <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>로봇 데이터 없음</p>}
        </Card>

        <Card title="볼팅 감지 현황" icon={<Radio size={13} color="var(--text-muted)" />}>
          {sensorStats.length > 0
            ? sensorStats.map((s, i) => (
                <UtilBar key={s.name} label={`${s.name} (${s.detected}/${s.total}회)`} pct={s.rate} color={SENSOR_COLORS[i % SENSOR_COLORS.length]} />
              ))
            : <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>센서 데이터 없음</p>}
        </Card>
      </div>

      {/* ── 알람 요약 ─────────────────────────────────────────── */}
      <Card title="알람 요약" icon={<Bell size={13} color="var(--text-muted)" />}>
        <div style={{ display: 'flex', gap: 12, marginBottom: alarmStats.items.length ? 16 : 0 }}>
          <KPI label="총 알람"  value={alarmStats.total}   />
          <KPI label="위험"     value={alarmStats.danger}   color={alarmStats.danger  > 0 ? '#dc2626' : undefined} />
          <KPI label="경고"     value={alarmStats.warning}  color={alarmStats.warning > 0 ? '#d97706' : undefined} />
          <KPI label="해소"     value={alarmStats.resolved} color={alarmStats.resolved > 0 ? '#16a34a' : undefined} />
          <KPI label="진행 중"  value={alarmStats.active}   color={alarmStats.active  > 0 ? '#dc2626' : undefined} />
        </div>

        {alarmStats.items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['레벨', '로봇', '항목', '값', '발생', '해소'].map(h => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alarmStats.items.slice(0, 20).map((a, i) => (
                <tr key={a.id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 12px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: a.level === 'danger' ? '#fee2e2' : '#fef9c3',
                      color:      a.level === 'danger' ? '#dc2626' : '#ca8a04',
                    }}>
                      {a.level === 'danger' ? '위험' : '경고'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{a.robotName}</td>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{a.label}</td>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text)', fontFamily: 'monospace' }}>{a.value.toFixed(1)} {a.unit}</td>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtTime(a.ts)}</td>
                  <td style={{ padding: '6px 12px', fontSize: 11, fontFamily: 'monospace', color: a.resolvedAt ? '#16a34a' : '#dc2626' }}>
                    {a.resolvedAt ? fmtTime(a.resolvedAt) : '진행 중'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {alarmStats.items.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>이 범위에서 발생한 알람 없음</p>
        )}
      </Card>

      {/* ── 로봇별 상세 지표 ──────────────────────────────────── */}
      {robotStats.length > 0 && (
        <Card title="로봇별 상세 지표" icon={<Activity size={13} color="var(--text-muted)" />}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['로봇', '가동률', '온도 평균/최대', '전력 평균/최대', '토크 평균/최대'].map(h => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {robotStats.map((r, i) => (
                <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: ROBOT_COLORS[i % ROBOT_COLORS.length] }}>{r.name}</td>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)' }}>{r.utilization.toFixed(1)}%</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.avgTemp} / {r.maxTemp} °C</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.avgPower} / {r.maxPower} W</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.avgTorque} / {r.maxTorque} Nm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── 사이클 타임 ───────────────────────────────────────── */}
      {cycleStats.length > 0 && (
        <Card title="사이클 타임" icon={<Timer size={13} color="var(--text-muted)" />}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['로봇', '사이클 수', '평균', '최단', '최장'].map(h => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycleStats.map(c => (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)' }}>{c.name}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{c.count}회</td>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{fmtMs(c.avg)}</td>
                  <td style={{ padding: '7px 12px', color: '#16a34a', fontFamily: 'monospace' }}>{fmtMs(c.min)}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--warning)', fontFamily: 'monospace' }}>{fmtMs(c.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── 스텝별(픽/경유/플레이스) 사이클 타임 ──────────────── */}
      {stepStats.length > 0 && (
        <Card title="스텝별 사이클 타임" icon={<Timer size={13} color="var(--text-muted)" />}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['로봇', '스텝', '횟수', '평균', '최단', '최장'].map(h => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stepStats.map(s => (
                <tr key={`${s.robotName}|${s.step}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)' }}>{s.robotName}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{s.step}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{s.count}회</td>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{fmtMs(s.avg)}</td>
                  <td style={{ padding: '7px 12px', color: '#16a34a', fontFamily: 'monospace' }}>{fmtMs(s.min)}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--warning)', fontFamily: 'monospace' }}>{fmtMs(s.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── 재작업(재시도) 이력 ────────────────────────────────── */}
      {retryStats.length > 0 && (
        <Card title="재작업(재시도) 이력" icon={<RefreshCw size={13} color="var(--text-muted)" />}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['로봇', '재시도 발생', '최대 시도 차수'].map(h => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retryStats.map(s => (
                <tr key={s.robotName} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--text)' }}>{s.robotName}</td>
                  <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--warning)' }}>{s.count}회</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{s.maxAttempt}회차</td>
                </tr>
              ))}
            </tbody>
          </table>

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
        </Card>
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
  borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
};
