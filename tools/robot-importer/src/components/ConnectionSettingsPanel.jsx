import { useState, useEffect } from 'react';
import { Wifi, Save, RotateCcw } from 'lucide-react';

const DEFAULTS = { host: '0.0.0.0', port: 5051 };

export default function ConnectionSettingsPanel() {
  const [host, setHost]     = useState(DEFAULTS.host);
  const [port, setPort]     = useState(DEFAULTS.port);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.electronAPI?.getConnectionSettings();
        if (s) { setHost(s.host ?? DEFAULTS.host); setPort(s.port ?? DEFAULTS.port); }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setError('');
    setSaved(false);
    const portNum = Number(port);
    if (!host.trim()) { setError('IP 주소를 입력하세요.'); return; }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError('포트는 1~65535 사이의 숫자여야 합니다.');
      return;
    }
    const result = await window.electronAPI?.saveConnectionSettings({ host, port: portNum });
    if (result?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(result?.error ?? '저장 실패');
    }
  }

  function handleReset() {
    setHost(DEFAULTS.host);
    setPort(DEFAULTS.port);
    setError('');
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Wifi size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>연결 설정</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Unity DigitalTwinEmitter가 데이터를 발행할 IP/포트입니다. 저장하면 즉시 서버가 재시작됩니다.
        </p>

        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <Field label="바인드 IP" hint="0.0.0.0 = 모든 네트워크 인터페이스에서 수신">
            <input
              value={host}
              onChange={e => setHost(e.target.value)}
              disabled={loading}
              placeholder="0.0.0.0"
              style={inputStyle}
            />
          </Field>

          <Field label="포트" hint="Unity PublishUrl의 포트 번호와 일치해야 합니다">
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              disabled={loading}
              placeholder="5051"
              style={inputStyle}
            />
          </Field>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--error)', background: 'rgba(224,82,82,0.08)', borderRadius: 6, padding: '6px 10px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={handleSave} disabled={loading} style={primaryBtnStyle}>
              <Save size={13} /> 저장 및 재연결
            </button>
            <button onClick={handleReset} disabled={loading} style={secondaryBtnStyle}>
              <RotateCcw size={13} /> 기본값
            </button>
            {saved && <span style={{ fontSize: 12, color: 'var(--success)', alignSelf: 'center' }}>저장됨</span>}
          </div>
        </div>

        <div style={{
          marginTop: 16, fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'monospace', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        }}>
          POST http://{host || '0.0.0.0'}:{port || 5051}/api/twin
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-sub)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 12px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--bg-card)', color: 'var(--text)',
  outline: 'none',
};

const primaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', fontSize: 12, fontWeight: 600,
  background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer',
};

const secondaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', fontSize: 12, fontWeight: 600,
  background: 'var(--bg-card)', color: 'var(--text-sub)',
  border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
};
