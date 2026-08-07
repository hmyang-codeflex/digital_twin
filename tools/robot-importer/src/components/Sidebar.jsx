import { useState } from 'react';
import { FolderOpen, Settings, LayoutGrid, Box, Sliders, Package, LayoutDashboard, Activity, BarChart2, Bell, Route, ClipboardList, Boxes, Layers, FileCode2, Wifi, Workflow, BookOpen } from 'lucide-react';

const SECTIONS = [
  {
    label: 'ROBOT',
    tabs: [
      { id: 'import',  icon: FolderOpen, label: '임포트'   },
      { id: 'config',  icon: Settings,   label: '설정'     },
      { id: 'catalog', icon: LayoutGrid, label: '카탈로그' },
    ],
  },
  {
    label: 'WORKPART',
    tabs: [
      { id: 'wp-import',  icon: Box,     label: '임포트'   },
      { id: 'wp-config',  icon: Sliders, label: '설정'     },
      { id: 'wp-catalog', icon: Package, label: '카탈로그' },
    ],
  },
];

export default function Sidebar({ activeTab, onTabChange, alarmCount = 0 }) {
  return (
    <aside style={{
      width: 72,
      background: '#191919',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '14px 0 20px',
      flexShrink: 0,
      overflowY: 'auto',
    }}>

      {/* 로고 */}
      <div style={{
        width: 36, height: 36,
        borderRadius: 9,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.14)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        flexShrink: 0,
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </div>

      {/* 사용 가이드 */}
      <NavItem
        id="guide"
        icon={BookOpen}
        label="가이드"
        active={activeTab === 'guide'}
        onClick={() => onTabChange('guide')}
      />

      {/* 대시보드 */}
      <NavItem
        id="dashboard"
        icon={LayoutDashboard}
        label="대시보드"
        active={activeTab === 'dashboard'}
        onClick={() => onTabChange('dashboard')}
      />

      {/* 모니터 */}
      <NavItem
        id="monitor"
        icon={Activity}
        label="모니터"
        active={activeTab === 'monitor'}
        onClick={() => onTabChange('monitor')}
      />

      {/* 분석 */}
      <NavItem
        id="log"
        icon={BarChart2}
        label="분석"
        active={activeTab === 'log'}
        onClick={() => onTabChange('log')}
      />

      {/* TCP 궤적 */}
      <NavItem
        id="trail"
        icon={Route}
        label="궤적"
        active={activeTab === 'trail'}
        onClick={() => onTabChange('trail')}
      />

      {/* 로봇 3D 뷰어 */}
      <NavItem
        id="robot3d"
        icon={Boxes}
        label="3D 뷰"
        active={activeTab === 'robot3d'}
        onClick={() => onTabChange('robot3d')}
      />

      {/* 통합 3D 뷰 */}
      <NavItem
        id="combined"
        icon={Layers}
        label="통합 뷰"
        active={activeTab === 'combined'}
        onClick={() => onTabChange('combined')}
      />

      {/* 알람 */}
      <NavItem
        id="alarm"
        icon={Bell}
        label="알람"
        active={activeTab === 'alarm'}
        onClick={() => onTabChange('alarm')}
        badge={alarmCount}
      />

      {/* 리포트 */}
      <NavItem
        id="report"
        icon={ClipboardList}
        label="리포트"
        active={activeTab === 'report'}
        onClick={() => onTabChange('report')}
      />

      {/* 티칭 추출 */}
      <NavItem
        id="teaching"
        icon={FileCode2}
        label="티칭"
        active={activeTab === 'teaching'}
        onClick={() => onTabChange('teaching')}
      />

      {/* 노코드 시퀀스 빌더 */}
      <NavItem
        id="sequence"
        icon={Workflow}
        label="시퀀스"
        active={activeTab === 'sequence'}
        onClick={() => onTabChange('sequence')}
      />

      {/* 연결 설정 */}
      <NavItem
        id="connection"
        icon={Wifi}
        label="연결"
        active={activeTab === 'connection'}
        onClick={() => onTabChange('connection')}
      />

      <Divider />

      {/* 섹션 */}
      {SECTIONS.map((section, si) => (
        <div
          key={section.label}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: si > 0 ? 4 : 0 }}
        >
          {si > 0 && <Divider />}

          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.22)',
            marginBottom: 4,
            textTransform: 'uppercase',
          }}>
            {section.label}
          </span>

          {section.tabs.map(({ id, icon, label }) => (
            <NavItem
              key={id}
              id={id}
              icon={icon}
              label={label}
              active={activeTab === id}
              onClick={() => onTabChange(id)}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}

function Divider() {
  return (
    <div style={{
      width: 36, height: 1,
      background: 'rgba(255,255,255,0.08)',
      margin: '6px 0 8px',
      flexShrink: 0,
    }} />
  );
}

function NavItem({ id, icon: Icon, label, active, onClick, badge = 0 }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 54, height: 46,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 4,
        background: active
          ? 'rgba(255,255,255,0.10)'
          : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.40)',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
        position: 'relative',
        marginBottom: 2,
        flexShrink: 0,
      }}
    >
      {/* 활성 인디케이터 */}
      {active && (
        <div style={{
          position: 'absolute', left: -9, top: '50%',
          transform: 'translateY(-50%)',
          width: 3, height: 18,
          background: 'rgba(255,255,255,0.75)',
          borderRadius: '0 2px 2px 0',
        }}/>
      )}

      {/* 아이콘 + 알람 뱃지 */}
      <div style={{ position: 'relative' }}>
        <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
        {badge > 0 && (
          <div style={{
            position: 'absolute', top: -5, right: -7,
            minWidth: 14, height: 14, borderRadius: 7,
            background: '#e05252', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
            boxShadow: '0 0 0 1.5px #191919',
          }}>
            {badge > 9 ? '9+' : badge}
          </div>
        )}
      </div>

      <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: '0.01em' }}>
        {label}
      </span>
    </button>
  );
}
