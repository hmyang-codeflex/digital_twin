import { useState, useEffect } from 'react';
import { Activity, Thermometer, Zap, Gauge, CheckCircle, XCircle, Radio, Cpu, Hand, Package, Zap as EventIcon, Filter, X } from 'lucide-react';

function robotAlarmLevel(robotName, activeAlarms) {
  const alarms = Object.values(activeAlarms ?? {}).filter(a => a.robotName === robotName);
  if (alarms.some(a => a.level === 'danger'))  return 'danger';
  if (alarms.some(a => a.level === 'warning')) return 'warning';
  return null;
}

// focus(선택 오브젝트 이름 목록)와 allNames는 App.jsx가 관리 — 데이터 분석(LogPanel/ReportPanel)에도
// 동일한 선택 범위를 공유하기 위해 이 컴포넌트만의 상태로 두지 않는다.
export default function MonitorPanel({ payload, connected, eventHistory, activeAlarms = {}, focus = [], allNames = [], onToggleFocus, onClearFocus }) {
  const [serverOk, setServerOk] = useState(null);

  const hasFocus = focus.length > 0;
  const matches = name => !hasFocus || focus.includes(name);

  // HTTP 서버 생존 확인 (3초 간격)
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('http://localhost:5051/ping');
        setServerOk(r.ok);
      } catch {
        setServerOk(false);
      }
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, []);

  const serverLabel  = serverOk === null ? '확인 중…' : serverOk ? '서버 정상' : '서버 없음';
  const serverColor  = serverOk === null ? 'var(--text-faint)' : serverOk ? 'var(--success)' : 'var(--error)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header" style={{ boxShadow: 'var(--shadow-xs)' }}>
        {/* HTTP 서버 상태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: serverColor,
            transition: 'background 0.3s',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: serverColor }}>{serverLabel}</span>
        </div>

        <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>|</span>

        {/* Unity IPC 상태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--success)' : 'var(--text-faint)',
            boxShadow: connected ? '0 0 6px rgba(10,138,103,0.5)' : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: connected ? 'var(--success)' : 'var(--text-muted)' }}>
            {connected ? 'Unity 수신 중' : 'Unity 대기 중'}
          </span>
        </div>

        {payload && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>seq #{payload.seq}</span>
            <span style={{
              fontSize: 11, color: 'var(--text-faint)',
              fontFamily: 'monospace',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '1px 7px',
            }}>
              {payload.robots?.length ?? 0}R · {payload.conveyors?.length ?? 0}C · {payload.sensors?.length ?? 0}S
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>:5051</span>
      </div>

      {payload && allNames.length > 0 && (
        <div style={{
          padding: '8px 28px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <Filter size={12} color="var(--text-faint)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>
            {hasFocus ? `${focus.length}개 선택됨` : '전체 표시 중 — 클릭해 특정 오브젝트만 보기'}
          </span>
          {allNames.map(name => {
            const active = focus.includes(name);
            return (
              <button
                key={name}
                onClick={() => onToggleFocus?.(name)}
                style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 10, cursor: 'pointer',
                  fontWeight: active ? 700 : 400,
                  background: active ? 'var(--accent)' : 'var(--bg-card)',
                  color: active ? '#fff' : 'var(--text-sub)',
                  border: active ? 'none' : '1px solid var(--border)',
                }}
              >
                {name}
              </button>
            );
          })}
          {hasFocus && (
            <button
              onClick={onClearFocus}
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
                background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}
            >
              <X size={10} /> 초기화
            </button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {!payload ? (
          <EmptyState />
        ) : (
          <>
            {payload.robots?.filter(r => matches(r.name)).length > 0 && (
              <Section
                title="로봇"
                icon={<Cpu size={14} color="var(--text-muted)" />}
                count={payload.robots.filter(r => matches(r.name)).length}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {payload.robots.filter(r => matches(r.name)).map(r => (
                    <RobotCard key={r.name} robot={r} alarmLevel={robotAlarmLevel(r.name, activeAlarms)} />
                  ))}
                </div>
              </Section>
            )}

            {payload.conveyors?.filter(c => matches(c.name)).length > 0 && (
              <Section
                title="컨베이어"
                icon={<Gauge size={14} color="var(--text-muted)" />}
                count={payload.conveyors.filter(c => matches(c.name)).length}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payload.conveyors.filter(c => matches(c.name)).map(c => <ConveyorRow key={c.name} conveyor={c} />)}
                </div>
              </Section>
            )}

            {payload.sensors?.filter(s => matches(s.name)).length > 0 && (
              <Section
                title="센서"
                icon={<Radio size={14} color="var(--text-muted)" />}
                count={payload.sensors.filter(s => matches(s.name)).length}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payload.sensors.filter(s => matches(s.name)).map(s => <SensorRow key={s.name} sensor={s} />)}
                </div>
              </Section>
            )}

            {payload.grippers?.filter(g => matches(g.name)).length > 0 && (
              <Section
                title="그리퍼"
                icon={<Hand size={14} color="var(--text-muted)" />}
                count={payload.grippers.filter(g => matches(g.name)).length}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payload.grippers.filter(g => matches(g.name)).map(g => <GripperRow key={g.name} gripper={g} />)}
                </div>
              </Section>
            )}

            {payload.parts?.filter(p => matches(p.name)).length > 0 && (
              <Section
                title="워크파츠"
                icon={<Package size={14} color="var(--text-muted)" />}
                count={payload.parts.filter(p => matches(p.name)).length}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payload.parts.filter(p => matches(p.name)).map(p => <PartRow key={p.name} part={p} />)}
                </div>
              </Section>
            )}

            {eventHistory.length > 0 && (
              <Section
                title="이벤트 로그"
                icon={<EventIcon size={14} color="var(--text-muted)" />}
                count={eventHistory.length}
              >
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  background: 'var(--bg-card)', borderRadius: 10,
                  border: '1px solid var(--border)', padding: '8px 12px',
                }}>
                  {eventHistory.map((ev, i) => <EventEntry key={i} event={ev} />)}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{
        width: 80, height: 80, borderRadius: 22,
        background: 'var(--bg-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <Activity size={36} strokeWidth={1.2} color="var(--text-sub)" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>데이터 수신 대기 중</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
        Unity 씬에서 DigitalTwinEmitter 컴포넌트를 실행하세요.
      </p>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
        POST http://localhost:5051/api/twin
      </p>
    </div>
  );
}

function Section({ title, icon, count, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {icon}
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-sub)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {title}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '0 7px',
        }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function RobotCard({ robot, alarmLevel }) {
  const isRun = robot.status === 'Run';
  const tempColor = robot.temperatureC > 70
    ? 'var(--error)'
    : robot.temperatureC > 50
      ? 'var(--warning)'
      : 'var(--success)';

  const accentColor = alarmLevel === 'danger'  ? 'var(--error)'
                    : alarmLevel === 'warning' ? 'var(--warning)'
                    : isRun                     ? 'var(--success)'
                    : 'var(--border-strong)';

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 12, padding: '14px 18px',
      boxShadow: 'var(--shadow-sm)',
      transition: 'border-left-color 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{robot.name}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 8px',
            color: isRun ? 'var(--success)' : 'var(--text-muted)',
            background: isRun ? 'var(--success-dim)' : 'var(--bg-hover)',
            border: `1px solid ${isRun ? 'rgba(10,138,103,0.25)' : 'var(--border)'}`,
          }}>
            {robot.status}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{robot.instructionIdx}</span>
          {alarmLevel && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              color: alarmLevel === 'danger' ? 'var(--error)' : 'var(--warning)',
              background: alarmLevel === 'danger' ? 'rgba(224,82,82,0.12)' : 'rgba(245,166,35,0.10)',
              border: `1px solid ${alarmLevel === 'danger' ? 'var(--error)' : 'var(--warning)'}`,
            }}>
              {alarmLevel === 'danger' ? '⚠ 위험' : '⚠ 경고'}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          속도 {Math.round(robot.speedFactor * 100)}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
        <DataCell label="TCP X" value={`${robot.tcpX.toFixed(3)} m`} />
        <DataCell label="TCP Y" value={`${robot.tcpY.toFixed(3)} m`} />
        <DataCell label="TCP Z" value={`${robot.tcpZ.toFixed(3)} m`} />
        <DataCell label="Rx" value={`${robot.tcpRx.toFixed(1)}°`} />
        <DataCell label="Ry" value={`${robot.tcpRy.toFixed(1)}°`} />
        <DataCell label="Rz" value={`${robot.tcpRz.toFixed(1)}°`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <DataCell
          label="온도"
          value={`${robot.temperatureC.toFixed(1)} °C`}
          valueColor={tempColor}
          icon={<Thermometer size={11} color={tempColor} />}
        />
        <DataCell
          label="전력"
          value={`${robot.powerW.toFixed(0)} W`}
          icon={<Zap size={11} color="var(--text-muted)" />}
        />
        <DataCell label="토크" value={`${robot.torqueNm.toFixed(1)} Nm`} />
      </div>
    </div>
  );
}

function DataCell({ label, value, valueColor, icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 8, padding: '6px 10px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: valueColor ?? 'var(--text-sub)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {icon}{value}
      </div>
    </div>
  );
}

function ConveyorRow({ conveyor }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: conveyor.running ? 'var(--success)' : 'var(--text-faint)',
      }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
        {conveyor.name}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 600 }}>
        {conveyor.speedMs.toFixed(3)} m/s
      </span>
      <span style={{
        fontSize: 11, color: 'var(--text-muted)',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 4, padding: '1px 6px',
      }}>
        {conveyor.direction}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{conveyor.currentA.toFixed(2)} A</span>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>μ {conveyor.friction.toFixed(2)}</span>
    </div>
  );
}

function SensorRow({ sensor }) {
  const present = sensor.boltPresent;
  const confPct = Math.round(sensor.confidence * 100);

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {present
        ? <CheckCircle size={14} color="var(--success)" strokeWidth={2.2} />
        : <XCircle size={14} color="var(--error)" strokeWidth={2.2} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
        {sensor.name}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: present ? 'var(--success)' : 'var(--error)' }}>
        {present ? '볼트 있음' : '볼트 없음'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, width: `${confPct}%`,
            background: present ? 'var(--success)' : 'var(--error)', transition: 'width 0.3s',
          }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 28, textAlign: 'right' }}>{confPct}%</span>
      </div>
    </div>
  );
}

function GripperRow({ gripper }) {
  const gripping = gripper.isGripping;
  const pct = Math.round(gripper.gripAmount * 100);
  const stateColor = { Fixed: 'var(--text-faint)', Opening: 'var(--warning)', Closing: 'var(--success)' }[gripper.gripState] ?? 'var(--text-faint)';

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${gripping ? 'var(--success)' : 'var(--border-strong)'}`,
      borderRadius: 10, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Hand size={14} color={gripping ? 'var(--success)' : 'var(--text-faint)'} strokeWidth={2} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{gripper.name}</span>
          {gripper.robotName && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>← {gripper.robotName}</span>
          )}
          <span style={{ fontSize: 11, color: stateColor, fontWeight: 600 }}>{gripper.gripState}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 70, height: 4, borderRadius: 2, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${pct}%`,
              background: 'var(--accent)', transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{pct}% 닫힘</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        {gripping ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>파지 중</span>
            <span style={{
              fontSize: 10, color: 'var(--text-sub)',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '1px 6px', maxWidth: 120,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {gripper.grippedPart}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{gripper.gripForce.toFixed(1)} N</span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>비어 있음</span>
        )}
      </div>
    </div>
  );
}

function PartRow({ part }) {
  const gripped = part.isGripped;
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Package size={13} color={gripped ? 'var(--success)' : 'var(--text-faint)'} strokeWidth={2} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
        {part.name}
      </span>
      {gripped ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>
          ← {part.grippedBy}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>자유</span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        ({part.posX.toFixed(3)}, {part.posY.toFixed(3)}, {part.posZ.toFixed(3)})
      </span>
    </div>
  );
}

function EventEntry({ event }) {
  const isGrip = event.type === 'grip';
  const time = new Date(event.timestampMs).toLocaleTimeString('ko-KR', { hour12: false });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{
        fontSize: 10, fontWeight: 700,
        color: isGrip ? 'var(--success)' : 'var(--warning)',
        background: isGrip ? 'var(--success-dim)' : 'var(--warning-dim)',
        borderRadius: 4, padding: '1px 6px', minWidth: 42, textAlign: 'center',
      }}>
        {isGrip ? '체결' : '해제'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 600 }}>{event.partName}</span>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>→ {event.gripperName}</span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto', fontFamily: 'monospace' }}>{time}</span>
    </div>
  );
}
