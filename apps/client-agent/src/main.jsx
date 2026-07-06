import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { COMPUTER_CODE, getApiBase, getJson, postJson, setApiBase } from './api.js';
import './styles.css';

function App() {
  const [computerCode, setComputerCode] = useState(COMPUTER_CODE);
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [message, setMessage] = useState('Silakan login untuk memakai komputer.');
  const [error, setError] = useState('');
  const [shutdownWarning, setShutdownWarning] = useState(false);
  const [shutdownSeconds, setShutdownSeconds] = useState(60);
  const [remoteCommand, setRemoteCommand] = useState(null);
  const [settings, setSettings] = useState({
    business_name: 'Perpustakaan Daerah',
    default_expire_action: 'shutdown',
    heartbeat_interval_seconds: '5',
    shutdown_warning_seconds: '60'
  });
  const [expireAction, setExpireAction] = useState('shutdown');
  const [now, setNow] = useState(Date.now());

  const remainingSeconds = useMemo(() => {
    if (!session?.end_time) return 0;
    return Math.max(0, Math.floor((new Date(session.end_time).getTime() - now) / 1000));
  }, [session, now]);

  const usageProgress = useMemo(() => {
    if (!session?.start_time || !session?.end_time) return 0;
    const start = new Date(session.start_time).getTime();
    const end = new Date(session.end_time).getTime();
    const total = Math.max(1, end - start);
    const used = Math.min(total, Math.max(0, now - start));
    return Math.round((used / total) * 100);
  }, [session, now]);

  const currentActionMeta = actionMeta(expireAction);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function heartbeat() {
      try {
        await loadSettings();
        const data = await postJson(`/api/computers/${computerCode}/heartbeat`, { clientVersion: 'web-prototype-0.4.0' });
        if (cancelled) return;
        setServerOnline(true);
        setConfigured(true);
        if (data.commands?.length) {
          for (const command of data.commands) await handleRemoteCommand(command);
        }
        if (data.activeSession) {
          applyActiveSession(data.activeSession, 'Session aktif dipulihkan dari server.');
        } else if (session && !shutdownWarning) {
          resetToLock('Session sudah tidak aktif. Komputer kembali terkunci.');
        }
      } catch (err) {
        if (!cancelled) {
          setServerOnline(false);
          setError(`Client belum terhubung: ${err.message}`);
        }
      }
    }
    heartbeat();
    const intervalMs = Math.max(1000, Number(settings.heartbeat_interval_seconds ?? 5) * 1000);
    const timer = setInterval(heartbeat, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [computerCode, session?.id, shutdownWarning, settings.heartbeat_interval_seconds]);

  useEffect(() => {
    let ws;
    try {
      const url = getApiBase().replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
      ws = new WebSocket(url);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const payload = msg.payload;
        if (msg.type === 'settings.updated') {
          loadSettings();
          return;
        }
        if (!payload || payload.computer_code !== computerCode) return;
        if (msg.type === 'client.command') {
          handleRemoteCommand(payload);
        }
        if (msg.type === 'session.started') {
          applyActiveSession(payload, 'Session dimulai oleh operator.');
        }
        if (msg.type === 'session.extended' && payload.id === session?.id) {
          applyActiveSession(payload, 'Waktu session ditambah oleh operator.');
        }
        if (msg.type === 'session.stopped' && payload.id === session?.id) {
          resetToLock('Session dihentikan oleh operator. Komputer kembali terkunci.');
        }
        if (msg.type === 'session.expired' && payload.id === session?.id) {
          triggerShutdownWarning();
        }
      };
    } catch (_) {}
    return () => ws?.close();
  }, [computerCode, serverUrl, session?.id]);

  useEffect(() => {
    if (session && remainingSeconds <= 0 && !shutdownWarning) triggerShutdownWarning();
  }, [session, remainingSeconds, shutdownWarning]);

  useEffect(() => {
    if (!shutdownWarning) return undefined;
    const timer = setInterval(() => {
      setShutdownSeconds((value) => {
        if (value <= 1) {
          clearInterval(timer);
          resetToLock(`Simulasi ${actionLabel(expireAction)} selesai. Komputer kembali terkunci. Hubungi operator untuk isi ulang waktu.`);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [shutdownWarning, expireAction]);

  async function saveConfiguration(event) {
    event.preventDefault();
    setError('');
    const normalizedUrl = serverUrl.trim().replace(/\/$/, '');
    const normalizedCode = computerCode.trim().toUpperCase();
    if (!normalizedUrl || !normalizedCode) {
      setError('Alamat server dan kode komputer wajib diisi.');
      return;
    }
    setApiBase(normalizedUrl);
    localStorage.setItem('computer_code', normalizedCode);
    setServerUrl(normalizedUrl);
    setComputerCode(normalizedCode);
    try {
      await loadSettings();
      const data = await postJson(`/api/computers/${encodeURIComponent(normalizedCode)}/heartbeat`, { clientVersion: 'web-prototype-0.4.0' });
      setConfigured(true);
      setServerOnline(true);
      setConfigurationOpen(false);
      setMessage(`Client terhubung sebagai ${data.computer.code}.`);
    } catch (err) {
      setConfigured(false);
      setServerOnline(false);
      setError(`Konfigurasi gagal: ${err.message}`);
    }
  }

  async function login(event) {
    event.preventDefault();
    setError('');
    setMessage('Memvalidasi akun...');
    try {
      const data = await postJson('/api/sessions/start', {
        username,
        password,
        computer_code: computerCode,
      });
      applyActiveSession(data, 'Session aktif. Komputer boleh digunakan.');
    } catch (err) {
      setError(err.message);
      setMessage('Login gagal. Hubungi operator jika akun tidak valid.');
    }
  }

  async function loadSettings() {
    const data = await getJson('/api/settings');
    setSettings((prev) => ({ ...prev, ...data }));
    return data;
  }

  function warningSeconds(currentSettings = settings) {
    const value = Number(currentSettings.shutdown_warning_seconds ?? 60);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 60;
  }

  function actionLabel(action = expireAction) {
    const labels = { lock: 'dikunci', shutdown: 'shutdown', restart: 'restart' };
    return labels[action] ?? action;
  }

  function applyActiveSession(activeSession, nextMessage) {
    setSession(activeSession);
    setUsername(activeSession.username ?? username);
    setShutdownWarning(false);
    setShutdownSeconds(warningSeconds());
    setExpireAction(settings.default_expire_action ?? 'shutdown');
    setError('');
    setMessage(nextMessage);
  }

  async function stopSession() {
    if (!session) return;
    try {
      await postJson(`/api/sessions/${session.id}/stop`, { note: 'User logout from client prototype' });
    } catch (_) {}
    resetToLock('Session selesai. Hubungi operator untuk isi ulang jika waktu sudah habis.');
  }

  async function handleRemoteCommand(command) {
    setRemoteCommand(command);
    if (command.command === 'lock') {
      if (session) {
        try { await postJson(`/api/sessions/${session.id}/stop`, { note: 'Remote lock from operator' }); } catch (_) {}
      }
      resetToLock('Komputer dikunci oleh operator.');
    }
    if (command.command === 'shutdown') {
      triggerExpireAction('shutdown', 'Command shutdown diterima dari operator.');
    }
    if (command.command === 'restart') {
      triggerExpireAction('restart', 'Command restart diterima. Prototype menampilkan simulasi restart.');
    }
    try {
      await postJson(`/api/client-commands/${command.id}/ack`, { status: 'acknowledged', note: 'Handled by web prototype client' });
    } catch (_) {}
  }

  function resetToLock(nextMessage) {
    setSession(null);
    setShutdownWarning(false);
    setShutdownSeconds(warningSeconds());
    setUsername('');
    setPassword('');
    setRemoteCommand(null);
    setMessage(nextMessage);
  }

  function triggerShutdownWarning(nextMessage) {
    triggerExpireAction(settings.default_expire_action ?? 'shutdown', nextMessage);
  }

  function triggerExpireAction(action, nextMessage) {
    setExpireAction(action);
    if (action === 'lock') {
      resetToLock(nextMessage ?? 'Waktu habis. Komputer kembali terkunci.');
      return;
    }
    setShutdownWarning(true);
    setShutdownSeconds(warningSeconds());
    setMessage(nextMessage ?? `Waktu habis. Komputer akan ${actionLabel(action)}.`);
  }

  return (
    <main className={session && !shutdownWarning ? 'unlocked' : shutdownWarning ? 'expired' : 'locked'}>
      <section className="shell">
        <header className="topbar">
          <div className="brand">
            <span className={serverOnline ? 'status online' : 'status offline'} />
            <div>
              <p>{settings.business_name ?? 'Perpus Billing Client'}</p>
              <h1>{computerCode}</h1>
            </div>
          </div>
          <div className="connection-pill">
            <strong>{serverOnline ? 'ONLINE' : 'OFFLINE'}</strong>
            <span>{serverOnline ? getApiBase() : 'menunggu server'}</span>
          </div>
        </header>

        {!session && (configurationOpen || !configured) && (
          <form className="card config-card" onSubmit={saveConfiguration}>
            <p className="kicker">CLIENT SETUP</p>
            <h2>Hubungkan komputer ke server</h2>
            <p className="muted">Masukkan alamat PC operator dan kode komputer yang sudah terdaftar di dashboard admin.</p>
            <div className="field-grid">
              <label>Alamat server<input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://192.168.1.10:3478" /></label>
              <label>Kode komputer<input value={computerCode} onChange={(e) => setComputerCode(e.target.value)} placeholder="PC-01" /></label>
            </div>
            <button type="submit">Simpan & Hubungkan</button>
            {configured && <button type="button" className="secondary" onClick={() => setConfigurationOpen(false)}>Batal</button>}
            {error && <div className="error">{error}</div>}
          </form>
        )}

        {!session && configured && !configurationOpen && (
          <form className="card login-card" onSubmit={login}>
            <div className="lock-header">
              <div className="lock-icon">⌁</div>
              <div>
                <p className="kicker">LOCK SCREEN</p>
                <h2>Akses Komputer {settings.business_name ?? 'Perpustakaan'}</h2>
                <p className="muted">Masukkan username dan password dari operator untuk membuka komputer.</p>
              </div>
            </div>
            <div className="client-identity">
              <span>Komputer <strong>{computerCode}</strong></span>
              <button type="button" onClick={() => setConfigurationOpen(true)}>Pengaturan</button>
            </div>
            <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label>
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
            <button type="submit">Login & Mulai Session</button>
            {error && <div className="error">{error}</div>}
          </form>
        )}

        {session && !shutdownWarning && (
          <div className="card active-card">
            <p className="kicker">SESSION ACTIVE</p>
            <h2>Komputer sedang digunakan</h2>
            <div className="timer">{formatDuration(remainingSeconds)}</div>
            <div className="progress-track"><span style={{ width: `${usageProgress}%` }} /></div>
            <div className="session-meta">
              <span>User <strong>{username}</strong></span>
              <span>Session <strong>#{session.id}</strong></span>
              <span>Selesai <strong>{formatClock(session.end_time)}</strong></span>
            </div>
            <button className="secondary" onClick={stopSession}>Logout / Selesai</button>
          </div>
        )}

        {shutdownWarning && (
          <div className={`card shutdown-card action-${expireAction}`}>
            <p className="kicker">TIME EXPIRED</p>
            <h2>{remoteCommand ? 'Command operator diterima' : 'Waktu penggunaan habis'}</h2>
            <div className="shutdown-icon">{currentActionMeta.icon}</div>
            <div className="shutdown-countdown">{shutdownSeconds}</div>
            <p>{remoteCommand ? `Simulasi command ${remoteCommand.command}. ` : `Aksi default: ${currentActionMeta.label}. `}Di Windows final, agent akan menjalankan aksi OS otomatis.</p>
            <button onClick={() => resetToLock('Komputer kembali terkunci. Hubungi operator untuk isi ulang waktu.')}>Kembali ke lock screen</button>
          </div>
        )}

        <footer>
          <span>{message}</span>
          <span>Heartbeat {settings.heartbeat_interval_seconds ?? 5}s · Warning {settings.shutdown_warning_seconds ?? 60}s</span>
        </footer>
      </section>
    </main>
  );
}

function formatDuration(total) {
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatClock(value) {
  return value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
}

function actionMeta(action) {
  const meta = {
    shutdown: { icon: '⏻', label: 'shutdown' },
    restart: { icon: '↻', label: 'restart' },
    lock: { icon: '⌁', label: 'lock' }
  };
  return meta[action] ?? meta.shutdown;
}

createRoot(document.getElementById('root')).render(<App />);
