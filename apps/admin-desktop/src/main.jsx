import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE, deleteJson, getAuthToken, getJson, patchJson, postJson, setAuthToken } from './api.js';
import './styles.css';

function useForm(initial) {
  const [values, setValues] = useState(initial);
  const bind = (name) => ({
    value: values[name] ?? '',
    onChange: (event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))
  });
  const reset = () => setValues(initial);
  return { values, bind, reset, setValues };
}

function StatusPill({ status }) {
  return <span className={`pill pill-${status ?? 'unknown'}`}>{status ?? 'unknown'}</span>;
}

function App() {
  const [operator, setOperator] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [computers, setComputers] = useState([]);
  const [users, setUsers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [reportDate, setReportDate] = useState(todayInputDate());
  const [report, setReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [serverOk, setServerOk] = useState(false);
  const [selectedComputer, setSelectedComputer] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settings, setSettings] = useState({});
  const [authReady, setAuthReady] = useState(!getAuthToken());

  const activeUsers = users.filter((user) => user.status === 'active' && Number(user.default_duration_minutes ?? 0) > 0);
  const availableComputers = computers.filter((pc) => !pc.active_session_id && pc.status !== 'in_use');

  const loginForm = useForm({ username: 'admin', password: 'admin' });
  const computerForm = useForm({ code: '', name: '', ip_address: '' });
  const userForm = useForm({ username: '', password: '', user_type: 'member', full_name: '', member_number: '', default_duration_minutes: '60' });
  const packageForm = useForm({ name: '', duration_minutes: '60' });
  const passwordForm = useForm({ username: '', password: '' });
  const sessionForm = useForm({ username: '', computer_code: '', duration_minutes: '60' });
  const extendForm = useForm({ session_id: '', minutes: '30' });
  const topupForm = useForm({ username: '', minutes: '60' });
  const settingsForm = useForm({
    business_name: 'Perpustakaan Daerah',
    default_expire_action: 'shutdown',
    heartbeat_interval_seconds: '5',
    client_offline_threshold_seconds: '30',
    shutdown_warning_seconds: '60'
  });

  async function loadAll() {
    try {
      const [health, computerRows, userRows, packageRows, activeRows, daily, logRows, settingRows] = await Promise.all([
        getJson('/health'),
        getJson('/api/computers'),
        getJson('/api/users'),
        getJson('/api/access-duration-packages'),
        getJson('/api/sessions/active'),
        getJson(`/api/reports/daily?date=${encodeURIComponent(reportDate)}`),
        getJson('/api/reports/usage-logs'),
        getJson('/api/settings')
      ]);
      setServerOk(Boolean(health.ok));
      setComputers(computerRows);
      setUsers(userRows);
      setPackages(packageRows);
      setSessions(activeRows);
      setReport(daily);
      setLogs(logRows);
      setSettings(settingRows);
      settingsForm.setValues((prev) => ({ ...prev, ...settingRows }));
    } catch (err) {
      setServerOk(false);
      setError(err.message);
    }
  }

  useEffect(() => {
    async function restoreSession() {
      if (!getAuthToken()) return;
      try {
        const result = await getJson('/api/auth/me');
        setOperator(result.operator);
      } catch (_) {
        setAuthToken('');
      } finally {
        setAuthReady(true);
      }
    }
    restoreSession();
  }, []);

  useEffect(() => {
    if (!authReady || !operator) return;
    loadAll();
    const timer = setInterval(loadAll, 5000);
    return () => clearInterval(timer);
  }, [authReady, operator, reportDate]);

  useEffect(() => {
    let ws;
    try {
      const url = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
      ws = new WebSocket(url);
      ws.onmessage = () => { if (operator) loadAll(); };
    } catch (_) {}
    return () => ws?.close();
  }, []);

  const stats = useMemo(() => ({
    totalComputers: computers.length,
    online: computers.filter((pc) => pc.status !== 'offline').length,
    active: sessions.length,
    users: users.length,
    durationToday: report?.total_duration_minutes ?? 0
  }), [computers, sessions, users, report]);

  async function submit(handler) {
    setError('');
    setNotice('');
    try {
      await handler();
      if (getAuthToken()) await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function login() {
    const result = await postJson('/api/auth/login', loginForm.values);
    setAuthToken(result.token);
    setOperator(result.operator);
    setNotice(`Login sebagai ${result.operator.name}`);
  }

  async function logout() {
    try {
      if (getAuthToken()) await postJson('/api/auth/logout', {});
    } finally {
      setAuthToken('');
      setOperator(null);
      setComputers([]);
      setUsers([]);
      setPackages([]);
      setSessions([]);
      setReport(null);
      setLogs([]);
      setNotice('Logout berhasil');
    }
  }

  async function createComputer() {
    await postJson('/api/computers', computerForm.values);
    computerForm.reset();
    setNotice('Komputer berhasil ditambahkan');
  }

  async function saveSettings() {
    const saved = await patchJson('/api/settings', settingsForm.values);
    setSettings(saved);
    settingsForm.setValues((prev) => ({ ...prev, ...saved }));
    setNotice('Pengaturan berhasil disimpan');
  }

  async function createDatabaseBackup() {
    const result = await postJson('/api/maintenance/backup', { operator_id: operator?.id });
    setNotice(`Backup database berhasil: ${result.filename} (${formatBytes(result.size_bytes)})`);
  }

  function resetSettingsForm() {
    settingsForm.setValues((prev) => ({ ...prev, ...settings }));
    setNotice('Form pengaturan dikembalikan ke data server');
  }

  async function createUser() {
    await postJson('/api/users', {
      ...userForm.values,
      default_duration_minutes: Number(userForm.values.default_duration_minutes || 60),
      created_by_operator_id: operator?.id
    });
    userForm.reset();
    setNotice('User berhasil dibuat');
  }

  async function createPackage() {
    await postJson('/api/access-duration-packages', {
      name: packageForm.values.name,
      duration_minutes: Number(packageForm.values.duration_minutes || 0)
    });
    packageForm.reset();
    setNotice('Paket durasi berhasil dibuat');
  }

  async function deletePackage(id) {
    await deleteJson(`/api/access-duration-packages/${id}`);
    setNotice('Paket durasi dihapus');
  }

  async function disableUser(user) {
    await postJson(`/api/users/${encodeURIComponent(user.username)}/disable`, { operator_id: operator?.id, note: 'Disabled from dashboard' });
    setNotice(`${user.username} dinonaktifkan`);
  }

  async function resetUserPassword() {
    await postJson(`/api/users/${encodeURIComponent(passwordForm.values.username)}/reset-password`, {
      password: passwordForm.values.password,
      operator_id: operator?.id
    });
    passwordForm.reset();
    setNotice('Password user berhasil direset');
  }

  async function sendComputerCommand(pc, command) {
    await postJson(`/api/computers/${encodeURIComponent(pc.code)}/command`, {
      command,
      operator_id: operator?.id,
      note: `Command ${command} from dashboard`
    });
    setNotice(`Command ${command} dikirim ke ${pc.code}`);
  }

  async function deleteComputer(pc) {
    await deleteJson(`/api/computers/${encodeURIComponent(pc.code)}`);
    if (selectedComputer?.code === pc.code) setSelectedComputer(null);
    setNotice(`${pc.code} dihapus`);
  }

  async function startSession() {
    const user = users.find((item) => item.username === sessionForm.values.username);
    const computer = computers.find((item) => item.code === sessionForm.values.computer_code);
    const duration = Number(sessionForm.values.duration_minutes || 0);
    if (!user) throw new Error('Pilih user terlebih dahulu dari dropdown Mulai Session atau tombol Pakai di tabel User.');
    if (user.status !== 'active') throw new Error(`User ${user.username} belum aktif (${user.status}). Isi ulang waktu dulu sebelum mulai session.`);
    if (Number(user.default_duration_minutes ?? 0) <= 0) throw new Error(`Saldo waktu ${user.username} kosong. Isi ulang waktu dulu.`);
    if (!computer) throw new Error('Pilih komputer terlebih dahulu dari dropdown Mulai Session atau tombol Pakai di tabel Komputer.');
    if (computer.active_session_id || computer.status === 'in_use') throw new Error(`${computer.code} masih punya session aktif.`);
    if (duration <= 0) throw new Error('Durasi session harus lebih dari 0 menit.');
    if (duration > Number(user.default_duration_minutes ?? 0)) throw new Error(`Durasi melebihi saldo ${user.username}. Saldo tersedia ${user.default_duration_minutes} menit.`);
    await postJson('/api/sessions/start', {
      ...sessionForm.values,
      duration_minutes: duration,
      operator_id: operator?.id ?? 1
    });
    setNotice(`Session ${user.username} berhasil dimulai di ${computer.code}`);
  }

  async function extendSession() {
    await postJson(`/api/sessions/${extendForm.values.session_id}/extend`, {
      minutes: Number(extendForm.values.minutes || 30),
      operator_id: operator?.id
    });
    setNotice('Session berhasil diperpanjang');
  }

  async function topupUser() {
    const result = await postJson(`/api/users/${encodeURIComponent(topupForm.values.username)}/topup`, {
      minutes: Number(topupForm.values.minutes || 60),
      operator_id: operator?.id
    });
    setNotice(result.mode === 'session_extended'
      ? `Waktu session ${result.user.username} ditambah ${result.minutes_added} menit`
      : `Akun ${result.user.username} diisi ulang ${result.minutes_added} menit dan sudah aktif`);
    topupForm.reset();
  }

  function prepareTopup(user, minutes = '60') {
    topupForm.setValues({ username: user.username, minutes });
    setNotice(`Siap isi ulang ${user.username}. Ubah menit jika perlu.`);
  }

  function prepareSession(user) {
    sessionForm.setValues((prev) => ({
      ...prev,
      username: user.username,
      duration_minutes: String(user.default_duration_minutes || 60)
    }));
    if (user.status !== 'active' || Number(user.default_duration_minutes ?? 0) <= 0) {
      setNotice(`${user.username} belum bisa dipakai. Status: ${user.status}, saldo: ${user.default_duration_minutes ?? 0} menit. Klik Top Up dulu.`);
    } else {
      setNotice(`User ${user.username} siap. Pilih komputer lalu Start Session.`);
    }
  }

  async function stopSession(id) {
    await postJson(`/api/sessions/${id}/stop`, { operator_id: operator?.id, note: 'Stopped from dashboard' });
    setNotice('Session dihentikan');
  }

  async function markComputerOffline(pc) {
    const updated = await patchJson(`/api/computers/${encodeURIComponent(pc.code)}`, { status: 'offline' });
    setSelectedComputer({ ...updated, action: 'offline' });
    setNotice(`${pc.code} ditandai offline. Kalau client agent masih terbuka, status bisa online/idle lagi saat heartbeat berikutnya.`);
  }

  function prepareComputer(pc) {
    setSelectedComputer({ ...pc, action: 'setup' });
    setNotice(`Setup client untuk ${pc.code} siap. Salin alamat server dan kode komputer ke halaman Client Setup.`);
  }

  function prepareComputerForSession(pc) {
    sessionForm.setValues((prev) => ({ ...prev, computer_code: pc.code }));
    setSelectedComputer({ ...pc, action: 'session' });
    const selectedUser = users.find((user) => user.username === sessionForm.values.username);
    setNotice(selectedUser
      ? `${pc.code} dan ${selectedUser.username} siap. Klik Start Session.`
      : `${pc.code} siap. Pilih user aktif di form Mulai Session atau klik Pakai di tabel User.`);
  }

  function exportDailyReport() {
    const rows = report?.sessions ?? [];
    if (!rows.length) {
      setNotice('Belum ada session pada tanggal laporan ini.');
      return;
    }
    const headers = ['Tanggal', 'User', 'Nama', 'PC', 'Mulai', 'Selesai', 'Durasi Menit', 'Extend Menit', 'Status', 'Catatan'];
    const csvRows = [headers, ...rows.map((session) => [
      report.date,
      session.username,
      session.full_name ?? '',
      session.computer_code,
      session.start_time,
      session.end_time,
      session.duration_minutes,
      session.extended_minutes,
      session.status,
      session.usage_note ?? ''
    ])];
    const csv = csvRows.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-perpus-${report.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`Laporan ${report.date} diexport ke CSV`);
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Perpus Billing</p>
          <h1>Dashboard Operator</h1>
          <p className="muted">Prototype awal untuk kelola akses komputer perpustakaan.</p>
        </div>
        <div className="server-card">
          <span className={serverOk ? 'dot ok' : 'dot bad'} />
          <div><strong>{serverOk ? 'Backend online' : 'Backend offline'}</strong><small>{API_BASE}</small></div>
          {operator && <button className="secondary compact" onClick={() => submit(logout)}>Logout</button>}
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="grid stats">
        <Card title="Total PC" value={stats.totalComputers} />
        <Card title="Online/Idle" value={stats.online} />
        <Card title="Session Aktif" value={stats.active} />
        <Card title="User Terdaftar" value={stats.users} />
        <Card title="Durasi Hari Ini" value={`${stats.durationToday} menit`} />
      </section>

      {operator && <nav className="tabs" aria-label="Navigasi dashboard">
        {[
          ['dashboard', 'Dashboard'],
          ['sessions', 'Session'],
          ['users', 'User'],
          ['computers', 'Komputer'],
          ['settings', 'Pengaturan'],
          ['reports', 'Laporan']
        ].map(([key, label]) => (
          <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>
        ))}
      </nav>}

      {!authReady && <Panel title="Memeriksa Session Operator"><p className="muted">Mohon tunggu sebentar...</p></Panel>}

      {authReady && !operator && (
        <section className="layout login-layout">
          <Panel title="Login Operator" subtitle="Masuk dulu untuk mengakses dashboard operator.">
            <div className="form two">
              <input placeholder="Username" {...loginForm.bind('username')} />
              <input placeholder="Password" type="password" {...loginForm.bind('password')} />
              <button onClick={() => submit(login)}>Login</button>
            </div>
          </Panel>
        </section>
      )}

      {operator && activeTab === 'dashboard' && (
        <section className="layout">
          <Panel title="Operator Aktif" subtitle={`${operator.name} (${operator.role})`}>
            <ul className="summary-list">
              <li><strong>{operator.username}</strong><span>Username operator</span></li>
              <li><strong>12 jam</strong><span>Masa session login</span></li>
            </ul>
          </Panel>
          <Panel title="Ringkasan Hari Ini" subtitle={`${report?.total_sessions ?? 0} session · ${stats.durationToday} menit penggunaan`}>
            <ul className="summary-list">
              <li><strong>{stats.totalComputers}</strong><span>Total komputer terdaftar</span></li>
              <li><strong>{stats.online}</strong><span>Komputer online/idle</span></li>
              <li><strong>{stats.active}</strong><span>Session sedang aktif</span></li>
              <li><strong>{settings.business_name ?? 'Perpustakaan Daerah'}</strong><span>Nama instansi</span></li>
            </ul>
          </Panel>
        </section>
      )}

      {activeTab === 'sessions' && (
        <section className="layout">
          <Panel title="Mulai Session" subtitle="Pilih user aktif + komputer, lalu mulai session." wide>
            <div className="form two">
              <select {...sessionForm.bind('username')}>
                <option value="">Pilih user aktif</option>
                {activeUsers.map((user) => <option key={user.id} value={user.username}>{user.username} · saldo {user.default_duration_minutes} menit</option>)}
              </select>
              <select {...sessionForm.bind('computer_code')}>
                <option value="">Pilih komputer</option>
                {availableComputers.map((pc) => <option key={pc.id} value={pc.code}>{pc.code} · {pc.status}</option>)}
              </select>
              <input placeholder="Durasi menit" type="number" min="1" {...sessionForm.bind('duration_minutes')} />
              <button onClick={() => submit(startSession)}>Start Session</button>
            </div>
            <p className="hint">Kalau user tidak muncul, berarti statusnya belum active atau saldo waktunya 0. Klik Top Up di tab User.</p>
          </Panel>
          <Panel title="Session Aktif" wide>
            <div className="form inline">
              <input placeholder="Session ID" {...extendForm.bind('session_id')} />
              <input placeholder="Menit" type="number" {...extendForm.bind('minutes')} />
              <button onClick={() => submit(extendSession)}>Extend</button>
            </div>
            <Table headers={['ID', 'User', 'PC', 'Sisa', 'Mulai', 'Selesai', 'Aksi']} rows={sessions.map((s) => [s.id, s.username, s.computer_code, formatRemaining(s.end_time), formatTime(s.start_time), formatTime(s.end_time), <div className="actions"><button onClick={() => extendForm.setValues({ session_id: String(s.id), minutes: '30' })}>+30</button><button className="danger" onClick={() => submit(() => stopSession(s.id))}>Stop</button></div>])} />
          </Panel>
        </section>
      )}

      {activeTab === 'users' && (
        <section className="layout">
          <Panel title="Buat User / Member" wide>
            <div className="form two">
              <input placeholder="Username" {...userForm.bind('username')} />
              <input placeholder="Password" {...userForm.bind('password')} />
              <select {...userForm.bind('user_type')}><option value="member">Member</option><option value="one_time">One-time</option></select>
              <input placeholder="Nama lengkap" {...userForm.bind('full_name')} />
              <input placeholder="Nomor anggota optional" {...userForm.bind('member_number')} />
              <input placeholder="Saldo waktu awal menit" type="number" {...userForm.bind('default_duration_minutes')} />
              <button onClick={() => submit(createUser)}>Buat User</button>
            </div>
          </Panel>
          <Panel title="User" wide>
            <div className="form inline">
              <input placeholder="Username, contoh user001" {...topupForm.bind('username')} />
              <input placeholder="Menit" type="number" min="1" {...topupForm.bind('minutes')} />
              <button onClick={() => submit(topupUser)}>Isi Ulang Waktu</button>
            </div>
            <div className="form inline">
              <input placeholder="Username reset password" {...passwordForm.bind('username')} />
              <input placeholder="Password baru" {...passwordForm.bind('password')} />
              <button onClick={() => submit(resetUserPassword)}>Reset Password</button>
            </div>
            <Table headers={['Username', 'Nama', 'Tipe', 'Status', 'Saldo Waktu', 'Aksi']} rows={users.slice(0, 20).map((u) => [u.username, u.full_name ?? '-', u.user_type, <StatusPill status={u.status} />, `${u.default_duration_minutes ?? 0} menit`, <div className="actions"><button onClick={() => prepareTopup(u)}>Top Up</button><button className="secondary" onClick={() => prepareSession(u)}>{u.status === 'active' && Number(u.default_duration_minutes ?? 0) > 0 ? 'Pakai' : 'Pakai?'}</button><button className="danger" onClick={() => submit(() => disableUser(u))}>Disable</button></div>])} />
          </Panel>
        </section>
      )}

      {activeTab === 'computers' && (
        <section className="layout">
          <Panel title="Tambah Komputer">
            <div className="form two">
              <input placeholder="Kode, contoh PC-01" {...computerForm.bind('code')} />
              <input placeholder="Nama komputer" {...computerForm.bind('name')} />
              <input placeholder="IP address optional" {...computerForm.bind('ip_address')} />
              <button onClick={() => submit(createComputer)}>Tambah PC</button>
            </div>
          </Panel>
          <Panel title="Komputer" wide>
            {selectedComputer && (
              <div className="setup-box">
                <div>
                  <strong>{selectedComputer.action === 'setup' ? 'Setup Client' : selectedComputer.action === 'session' ? 'Siap Mulai Session' : 'Status Komputer'}</strong>
                  <p>{selectedComputer.name} · <b>{selectedComputer.code}</b> · status: <b>{selectedComputer.status}</b></p>
                </div>
                <div className="setup-values">
                  <span>Server: <code>{API_BASE}</code></span>
                  <span>Kode PC: <code>{selectedComputer.code}</code></span>
                </div>
              </div>
            )}
            <Table headers={['Kode', 'Nama', 'IP', 'Status', 'Heartbeat', 'Aksi']} rows={computers.map((pc) => [pc.code, pc.name, pc.ip_address ?? '-', <StatusPill status={pc.status} />, pc.last_heartbeat_at ?? '-', <div className="actions"><button type="button" className="secondary" onClick={() => prepareComputer(pc)}>Setup</button><button type="button" className="secondary" onClick={() => prepareComputerForSession(pc)}>Pakai</button><button type="button" className="secondary" onClick={() => submit(() => sendComputerCommand(pc, 'lock'))}>Lock</button><button type="button" className="secondary" onClick={() => submit(() => sendComputerCommand(pc, 'restart'))}>Restart</button><button type="button" className="danger" onClick={() => submit(() => sendComputerCommand(pc, 'shutdown'))}>Shutdown</button><button type="button" className="danger" onClick={() => submit(() => markComputerOffline(pc))}>Offline</button><button type="button" className="danger" onClick={() => submit(() => deleteComputer(pc))}>Hapus</button></div>])} />
          </Panel>
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="layout">
          <Panel title="Pengaturan Sistem" subtitle="Setting ini dipakai backend dan client agent." wide>
            <div className="form two">
              <label>Nama Instansi<input placeholder="Nama perpustakaan" {...settingsForm.bind('business_name')} /></label>
              <label>Aksi Saat Waktu Habis<select {...settingsForm.bind('default_expire_action')}><option value="shutdown">Shutdown</option><option value="lock">Lock</option><option value="restart">Restart</option></select></label>
              <label>Interval Heartbeat Client (detik)<input type="number" min="1" {...settingsForm.bind('heartbeat_interval_seconds')} /></label>
              <label>Threshold Offline Client (detik)<input type="number" min="1" {...settingsForm.bind('client_offline_threshold_seconds')} /></label>
              <label>Warning Shutdown (detik)<input type="number" min="1" {...settingsForm.bind('shutdown_warning_seconds')} /></label>
              <div className="actions settings-actions"><button onClick={() => submit(saveSettings)}>Simpan Pengaturan</button><button className="secondary" onClick={resetSettingsForm}>Reset Form</button></div>
            </div>
          </Panel>
          <Panel title="Backup Database" subtitle="Buat salinan database SQLite sebelum update app atau setelah operasional harian." wide>
            <div className="maintenance-card">
              <div>
                <strong>Backup manual</strong>
                <p className="muted">File backup disimpan di folder data backend: <code>data/backups</code>.</p>
              </div>
              <button onClick={() => submit(createDatabaseBackup)}>Buat Backup Sekarang</button>
            </div>
          </Panel>
          <Panel title="Paket Durasi" wide>
            <div className="form inline package-form">
              <input placeholder="Nama paket" {...packageForm.bind('name')} />
              <input placeholder="Menit" type="number" min="1" {...packageForm.bind('duration_minutes')} />
              <button onClick={() => submit(createPackage)}>Tambah Paket</button>
            </div>
            <ul className="package-list">{packages.map((p) => <li key={p.id}><strong>{p.name}</strong><span>{p.duration_minutes} menit</span><button className="danger compact" onClick={() => submit(() => deletePackage(p.id))}>Hapus</button></li>)}</ul>
          </Panel>
        </section>
      )}

      {activeTab === 'reports' && (
        <section className="layout single">
          <Panel title="Laporan Harian" subtitle="Pilih tanggal untuk melihat rekap pemakaian dan export CSV." wide>
            <div className="report-toolbar">
              <label>Tanggal Laporan<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value || todayInputDate())} /></label>
              <button className="secondary" onClick={exportDailyReport}>Export CSV</button>
            </div>
            <div className="report-cards">
              <Card title="Tanggal" value={report?.date ?? reportDate} />
              <Card title="Total Session" value={report?.total_sessions ?? 0} />
              <Card title="Total Durasi" value={`${report?.total_duration_minutes ?? 0} menit`} />
            </div>
            <Table headers={['User', 'Nama', 'PC', 'Mulai', 'Selesai', 'Durasi', 'Status', 'Catatan']} rows={(report?.sessions ?? []).map((session) => [session.username, session.full_name ?? '-', session.computer_code, formatTime(session.start_time), formatTime(session.end_time), `${Number(session.duration_minutes ?? 0) + Number(session.extended_minutes ?? 0)} menit`, <StatusPill status={session.status} />, session.usage_note ?? '-'])} />
          </Panel>
          <Panel title="Riwayat Aktivitas" subtitle="500 aktivitas terbaru dari sistem." wide>
            <Table headers={['Waktu', 'User', 'PC', 'Aksi', 'Catatan']} rows={logs.slice(0, 20).map((log) => [formatTime(log.created_at), log.username ?? '-', log.computer_code ?? '-', humanAction(log.action), log.note ?? '-'])} />
          </Panel>
        </section>
      )}
    </main>
  );
}

function Panel({ title, subtitle, wide, children }) {
  return <div className={`panel ${wide ? 'wide' : ''}`}><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}{children}</div>;
}
function Card({ title, value }) { return <div className="stat-card"><span>{title}</span><strong>{value}</strong></div>; }
function Table({ headers, rows }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="empty">Belum ada data</td></tr>}</tbody></table></div>;
}
function todayInputDate() { return new Date().toISOString().slice(0, 10); }
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function formatBytes(bytes) {
  const value = Number(bytes ?? 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function formatTime(value) { return value ? new Date(value).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '-'; }
function formatRemaining(endTime) {
  if (!endTime) return '-';
  const total = Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m ${s}s`;
}
function humanAction(action) {
  const labels = {
    session_started: 'Session mulai',
    session_extended: 'Session diperpanjang',
    session_stopped: 'Session selesai',
    session_expired: 'Waktu habis',
    session_expired_manual: 'Expired manual',
    user_topup: 'Top up user',
    user_disabled: 'User disabled',
    user_password_reset: 'Reset password',
    client_command: 'Command client'
  };
  return labels[action] ?? action;
}

createRoot(document.getElementById('root')).render(<App />);
