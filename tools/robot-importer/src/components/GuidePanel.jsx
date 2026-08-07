import { BookOpen, ArrowRight } from 'lucide-react';

// 공정 분석·최적화 실사용 플로우 — 탭 순서가 아니라 "이 작업을 하려면 무엇이 먼저 끝나 있어야 하는가"
// 기준의 실제 작업 의존관계로 재구성. 4개 트랙(준비 / 실행·수집 / 분석·비교 / 실기 반영)으로 구분.
const TRACKS = [
  {
    id: 'A',
    label: '준비',
    desc: '세션을 시작하기 전, 최초 1회 또는 환경이 바뀔 때만',
    steps: [
      {
        n: 1, title: '현재 씬 현황 파악', tab: 'dashboard', tabLabel: '자산 대시보드',
        body: '새 작업을 시작하기 전에 지금 씬에 뭐가 이미 배포돼 있는지, 트윈 연결 상태는 정상인지 먼저 확인합니다. 로봇/워크파츠가 이미 갖춰져 있으면 다음 두 단계는 건너뜁니다.',
        when: '세션 시작 시',
      },
      {
        n: 2, title: '연결 확인', tab: 'connection', tabLabel: '연결 설정',
        body: 'Unity DigitalTwinEmitter의 IP/포트와 일치하는지 확인합니다. 보통 한 번 맞춰두면 계속 유지되므로 매번 확인할 필요는 없습니다.',
        when: '최초 1회 또는 환경 변경 시',
      },
      {
        n: 3, title: '부족한 자원 등록', tab: 'import', tabLabel: '로봇 임포트',
        body: '대시보드에서 확인했을 때 이번 분석에 필요한 로봇/워크파츠가 없으면 임포트 → 설정 → 카탈로그 배포 순으로 등록합니다. 이미 있으면 스킵합니다.',
        when: '신규 자원이 필요할 때만',
      },
      {
        n: 4, title: '씬 배치', tab: null, tabLabel: 'Unity 에디터',
        body: '배포된 프리팹을 씬에 실제로 위치시키고, 태스크 컴포넌트(SuctionGripperTask 등)의 Controller/Gripper/HoldFrames를 연결합니다. 이 단계는 Unity 에디터에서 직접 진행합니다.',
        when: 'Unity 에디터에서 수동 진행',
      },
    ],
  },
  {
    id: 'B',
    label: '실행·수집',
    desc: '시나리오 하나를 실제로 돌리는 사이클 — 비교할 시나리오 수만큼 반복',
    steps: [
      {
        n: 5, title: '시나리오 구성', tab: 'sequence', tabLabel: '노코드 시퀀스 빌더',
        body: '이번에 테스트할 동작 패턴을 구성하고 "Unity로 저장"으로 반영합니다. 기존 시퀀스를 그대로 다시 쓴다면 이 단계는 스킵합니다.',
        when: '새 시나리오를 테스트할 때',
      },
      {
        n: 6, title: '관찰 범위 좁히기', tab: 'monitor', tabLabel: '디지털 트윈 모니터',
        body: 'Play 모드에 들어가기 직전에 이번에 볼 오브젝트만 미리 선택해둡니다. 이래야 실행 중 실시간으로 원하는 것만 보이고, 이후 분석에도 같은 범위가 자동으로 이어집니다.',
        when: '매 실행 전',
      },
      {
        n: 7, title: '실행', tab: 'monitor', tabLabel: '디지털 트윈 모니터',
        body: '충분한 사이클 수(최소 5~10회)를 반복 실행하면서 이상 동작이 없는지 실시간으로 지켜봅니다. 이상하면 바로 멈추고 씬 배치·시나리오 구성으로 돌아갑니다.',
        when: '매 실행마다',
      },
    ],
  },
  {
    id: 'C',
    label: '분석·비교',
    desc: '실행이 끝난 직후, 한 세션 안에서 병행 진행',
    steps: [
      {
        n: 8, title: '궤적·수치 동시 확인', tab: 'log', tabLabel: '데이터 분석',
        body: '전체/스텝별 사이클타임으로 병목 구간을 특정하고, TCP 궤적으로 경로 형태를 함께 봅니다. 시퀀스 실행 구간 요약으로 지금 보는 구간이 어떤 시나리오였는지 확인하고, 알람 탭에서 임계값 초과 이력도 이 시점에 같이 체크합니다.',
        when: '실행 직후, 궤적·알람과 병행',
      },
      {
        n: 9, title: '기록', tab: 'report', tabLabel: '세션 리포트',
        body: '분석이 끝나면 그 시나리오의 결과를 HTML 리포트와 DB(ZIP)로 남깁니다. 파일명에 시나리오명을 넣어두면 다음 비교 때 헷갈리지 않습니다.',
        when: '시나리오 종료 시마다',
      },
      {
        n: 10, title: '반복 비교', tab: 'sequence', tabLabel: '노코드 시퀀스 빌더',
        body: '다음 비교 시나리오가 있으면 시나리오 구성(5단계)으로 돌아가 반복합니다. 모든 시나리오를 다 돌렸으면 각 세션의 리포트를 대조해 최적안을 결정합니다.',
        when: '여러 시나리오를 비교할 때',
      },
    ],
  },
  {
    id: 'D',
    label: '실기 반영',
    desc: '시뮬레이션 최적화 루프와 무관한 별도 트랙 — 최종안이 확정된 뒤에만',
    steps: [
      {
        n: 11, title: '티칭 코드 추출', tab: 'teaching', tabLabel: '티칭 시퀀스 추출기',
        body: '확정된 시퀀스를 실제 로봇 컨트롤러 코드(KAS/JBI/RAPID/KRL)로 추출합니다. A~C 트랙의 반복 루프가 모두 끝난 뒤 붙는 독립된 마무리 작업입니다.',
        when: '최적안 확정 후',
      },
    ],
  },
];

export default function GuidePanel({ onNavigate }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BookOpen size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>사용 가이드 — 공정 분석·최적화 실사용 플로우</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 24 }}>
          탭 나열 순서가 아니라, 이 작업을 하려면 무엇이 먼저 끝나 있어야 하는지를 기준으로 정리한 절차입니다. 각 단계의 버튼을 누르면 해당 화면으로 바로 이동합니다.
        </p>

        {TRACKS.map(track => (
          <div key={track.id} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                color: 'var(--accent)', textTransform: 'uppercase',
              }}>
                트랙 {track.id} · {track.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{track.desc}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {track.steps.map(step => (
                <div key={step.n} style={{
                  background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '14px 18px', boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: 8,
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {step.n}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{step.title}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: 'var(--bg-hover)', color: 'var(--text-faint)',
                        }}>
                          {step.when}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px' }}>
                        {step.body}
                      </p>
                      {step.tab && (
                        <button
                          onClick={() => onNavigate(step.tab)}
                          className="btn-ghost"
                          style={{ fontSize: 11, padding: '5px 10px', height: 28, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {step.tabLabel} <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
