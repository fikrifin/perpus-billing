import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import crypto from 'node:crypto';
import { statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { db, dbPath, migrate, nowIso, addMinutes, hashPassword, verifyPassword, publicUser, backupDatabase } from './db.js';
import { broadcast, registerRealtime } from './realtime.js';

migrate();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);
registerRealtime(app);

const PUBLIC_ROUTES = [
  ['GET', '/health'],
  ['GET', '/api/settings'],
  ['POST', '/api/auth/login'],
  ['POST', /^\/api\/computers\/[^/]+\/heartbeat$/],
  ['POST', /^\/api\/client-commands\/[^/]+\/ack$/],
  ['POST', '/api/users/validate-login'],
  ['POST', '/api/sessions/start'],
  ['POST', /^\/api\/sessions\/[^/]+\/stop$/]
];

function isPublicRoute(method, url) {
  const pathname = url.split('?')[0];
  return PUBLIC_ROUTES.some(([routeMethod, routePath]) => {
    if (routeMethod !== method) return false;
    return routePath instanceof RegExp ? routePath.test(pathname) : routePath === pathname;
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createOperatorSession(operatorId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = addMinutes(new Date(), 12 * 60);
  db.prepare('INSERT INTO operator_sessions (operator_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(operatorId, hashToken(token), expiresAt);
  return { token, expires_at: expiresAt };
}

function authenticateOperator(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return db.prepare(`
    SELECT os.*, o.id as operator_id, o.name, o.username, o.role, o.is_active
    FROM operator_sessions os
    JOIN operators o ON o.id = os.operator_id
    WHERE os.token_hash = ? AND os.revoked_at IS NULL AND os.expires_at > ? AND o.is_active = 1
  `).get(hashToken(token), nowIso());
}

app.addHook('preHandler', async (req, reply) => {
  const session = authenticateOperator(req);
  if (session) {
    req.operator = {
      id: session.operator_id,
      name: session.name,
      username: session.username,
      role: session.role,
      session_id: session.id
    };
    return;
  }
  if (isPublicRoute(req.method, req.url)) return;
  return reply.code(401).send({ error: 'Login operator dibutuhkan' });
});

function required(body, fields) {
  for (const field of fields) {
    if (body?.[field] === undefined || body?.[field] === null || body?.[field] === '') {
      return field;
    }
  }
  return null;
}

function activeSessionForComputer(computerId) {
  return db.prepare(`SELECT * FROM sessions WHERE computer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`).get(computerId);
}

function activeSessionForUser(userId) {
  return db.prepare(`SELECT * FROM sessions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`).get(userId);
}

function sessionDetails(sessionId) {
  return db.prepare(`
    SELECT s.*, u.username, c.code as computer_code
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN computers c ON c.id = s.computer_id
    WHERE s.id = ?
  `).get(sessionId);
}

function readPositiveMinutes(value, fallback = 0) {
  const minutes = Number(value ?? fallback);
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
}

function remainingWholeMinutes(endTime, from = new Date()) {
  const remainingMs = new Date(endTime).getTime() - from.getTime();
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0;
}

function getSettingNumber(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nextStatusAfterSession(user, fallbackStatus) {
  if (user?.user_type === 'one_time') return fallbackStatus === 'active' ? 'used' : fallbackStatus;
  return fallbackStatus;
}

function commandDetails(commandId) {
  return db.prepare(`
    SELECT cc.*, c.code as computer_code
    FROM client_commands cc
    JOIN computers c ON c.id = cc.computer_id
    WHERE cc.id = ?
  `).get(commandId);
}

function extendActiveSession(session, minutes, operatorId = null, note = null) {
  const base = new Date(session.end_time) > new Date() ? new Date(session.end_time) : new Date();
  const newEnd = addMinutes(base, minutes);
  db.prepare('UPDATE sessions SET end_time = ?, extended_minutes = extended_minutes + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newEnd, minutes, session.id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(session.id, session.user_id, session.computer_id, operatorId, 'session_extended', note ?? `Extended ${minutes} minutes`);
  const updated = sessionDetails(session.id);
  broadcast('session.extended', updated);
  return updated;
}


function expireDueSessions() {
  const expiredAt = nowIso();
  const due = db.prepare(`SELECT * FROM sessions WHERE status = 'active' AND end_time <= ?`).all(expiredAt);
  for (const session of due) {
    const user = db.prepare('SELECT user_type, default_duration_minutes FROM users WHERE id = ?').get(session.user_id);
    const balanceStatus = Number(user?.default_duration_minutes ?? 0) > 0 ? 'active' : 'expired';
    const nextUserStatus = nextStatusAfterSession(user, balanceStatus);
    db.prepare('UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.id);
    db.prepare('UPDATE computers SET status = ?, active_session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.computer_id);
    db.prepare(`UPDATE users SET status = ?, expired_at = CASE WHEN ? = 'expired' THEN COALESCE(expired_at, ?) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(nextUserStatus, nextUserStatus, expiredAt, session.user_id);
    db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(session.id, session.user_id, session.computer_id, session.operator_id ?? null, 'session_expired', 'Duration ended; client should shutdown');
    broadcast('session.expired', { ...sessionDetails(session.id), status: 'expired', expire_action: 'shutdown' });
  }
}

function markOfflineComputers() {
  const thresholdSeconds = getSettingNumber('client_offline_threshold_seconds', 30);
  const cutoff = new Date(Date.now() - thresholdSeconds * 1000).toISOString();
  const stale = db.prepare(`
    SELECT * FROM computers
    WHERE status != 'offline'
      AND active_session_id IS NULL
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at < ?
  `).all(cutoff);
  for (const computer of stale) {
    db.prepare(`UPDATE computers SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(computer.id);
    const updated = db.prepare('SELECT * FROM computers WHERE id = ?').get(computer.id);
    broadcast('computer.offline', updated);
  }
}

setInterval(expireDueSessions, 1000);
setInterval(markOfflineComputers, 5000);

app.get('/health', async () => ({ ok: true, service: 'perpus-billing-backend', at: nowIso() }));
app.get('/api/settings', async () => {
  const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
});
app.patch('/api/settings', async (req, reply) => {
  const editable = new Set([
    'business_name',
    'default_expire_action',
    'heartbeat_interval_seconds',
    'client_offline_threshold_seconds',
    'shutdown_warning_seconds'
  ]);
  const numericKeys = new Set(['heartbeat_interval_seconds', 'client_offline_threshold_seconds', 'shutdown_warning_seconds']);
  const entries = Object.entries(req.body ?? {}).filter(([key]) => editable.has(key));
  if (!entries.length) return reply.code(400).send({ error: 'Tidak ada setting valid untuk disimpan' });
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction((rows) => {
    for (const [key, rawValue] of rows) {
      let value = String(rawValue ?? '').trim();
      if (!value) throw new Error(`${key} wajib diisi`);
      if (numericKeys.has(key)) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) throw new Error(`${key} harus angka lebih dari 0`);
        value = String(Math.floor(number));
      }
      if (key === 'default_expire_action' && !['shutdown', 'lock', 'restart'].includes(value)) throw new Error('default_expire_action harus shutdown, lock, atau restart');
      upsert.run(key, value);
    }
  })(entries);
  broadcast('settings.updated', Object.fromEntries(entries));
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
});

app.post('/api/maintenance/backup', async (req, reply) => {
  const backupDir = process.env.PERPUS_BACKUP_DIR ? process.env.PERPUS_BACKUP_DIR : join(dirname(dbPath), 'backups');
  const timestamp = nowIso().replace(/[:.]/g, '-');
  const destination = join(backupDir, `perpus-billing-${timestamp}.db`);
  try {
    await backupDatabase(destination);
    const file = statSync(destination);
    db.prepare('INSERT INTO usage_logs (operator_id, action, note) VALUES (?, ?, ?)')
      .run(req.operator?.id ?? null, 'database_backup', `Backup database dibuat: ${basename(destination)}`);
    return reply.code(201).send({ ok: true, path: destination, filename: basename(destination), size_bytes: file.size, created_at: nowIso() });
  } catch (error) {
    return reply.code(500).send({ error: `Backup database gagal: ${error.message}` });
  }
});

app.post('/api/auth/login', async (req, reply) => {
  const missing = required(req.body, ['username', 'password']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const operator = db.prepare('SELECT * FROM operators WHERE username = ? AND is_active = 1').get(req.body.username);
  if (!operator || !verifyPassword(req.body.password, operator.password_hash)) return reply.code(401).send({ error: 'Username/password operator tidak valid' });
  const { password_hash, ...safe } = operator;
  const session = createOperatorSession(operator.id);
  return { operator: safe, token: session.token, expires_at: session.expires_at };
});

app.post('/api/auth/logout', async (req) => {
  db.prepare('UPDATE operator_sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), req.operator.session_id);
  return { ok: true };
});

app.get('/api/auth/me', async (req) => ({ operator: req.operator }));

app.get('/api/computers', async () => db.prepare('SELECT * FROM computers ORDER BY code').all());
app.post('/api/computers', async (req, reply) => {
  const missing = required(req.body, ['code', 'name']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  try {
    const result = db.prepare('INSERT INTO computers (code, name, ip_address, mac_address) VALUES (?, ?, ?, ?)')
      .run(req.body.code, req.body.name, req.body.ip_address ?? null, req.body.mac_address ?? null);
    const row = db.prepare('SELECT * FROM computers WHERE id = ?').get(result.lastInsertRowid);
    broadcast('computer.created', row);
    return reply.code(201).send(row);
  } catch (error) {
    return reply.code(409).send({ error: 'Kode komputer sudah digunakan' });
  }
});
app.patch('/api/computers/:id', async (req, reply) => {
  const existing = db.prepare('SELECT * FROM computers WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!existing) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  db.prepare(`UPDATE computers SET name = COALESCE(?, name), ip_address = COALESCE(?, ip_address), mac_address = COALESCE(?, mac_address), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(req.body.name ?? null, req.body.ip_address ?? null, req.body.mac_address ?? null, req.body.status ?? null, existing.id);
  const row = db.prepare('SELECT * FROM computers WHERE id = ?').get(existing.id);
  broadcast('computer.updated', row);
  return row;
});
app.delete('/api/computers/:id', async (req, reply) => {
  const existing = db.prepare('SELECT * FROM computers WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!existing) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  if (activeSessionForComputer(existing.id)) return reply.code(409).send({ error: 'Komputer masih punya session aktif' });
  const hasHistory = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions WHERE computer_id = ?) +
      (SELECT COUNT(*) FROM usage_logs WHERE computer_id = ?) as total
  `).get(existing.id, existing.id).total;
  if (hasHistory > 0) return reply.code(409).send({ error: 'Komputer sudah punya riwayat penggunaan. Tandai offline saja agar laporan historis tetap aman.' });
  db.prepare('DELETE FROM client_commands WHERE computer_id = ?').run(existing.id);
  db.prepare('DELETE FROM computers WHERE id = ?').run(existing.id);
  broadcast('computer.deleted', existing);
  return { ok: true, deleted: existing };
});
app.post('/api/computers/:id/command', async (req, reply) => {
  const computer = db.prepare('SELECT * FROM computers WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!computer) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  const command = req.body?.command;
  if (!['lock', 'shutdown', 'restart'].includes(command)) return reply.code(400).send({ error: 'command harus lock, shutdown, atau restart' });
  const result = db.prepare('INSERT INTO client_commands (computer_id, operator_id, command, note) VALUES (?, ?, ?, ?)')
    .run(computer.id, req.operator?.id ?? null, command, req.body?.note ?? null);
  const row = commandDetails(result.lastInsertRowid);
  db.prepare('INSERT INTO usage_logs (computer_id, operator_id, action, note) VALUES (?, ?, ?, ?)')
    .run(computer.id, req.operator?.id ?? null, 'client_command', `${command}${req.body?.note ? `: ${req.body.note}` : ''}`);
  broadcast('client.command', row);
  return reply.code(201).send(row);
});
app.post('/api/client-commands/:id/ack', async (req, reply) => {
  const command = db.prepare('SELECT * FROM client_commands WHERE id = ?').get(req.params.id);
  if (!command) return reply.code(404).send({ error: 'Command tidak ditemukan' });
  const status = req.body?.status === 'failed' ? 'failed' : 'acknowledged';
  db.prepare('UPDATE client_commands SET status = ?, acknowledged_at = ?, note = COALESCE(?, note) WHERE id = ?')
    .run(status, nowIso(), req.body?.note ?? null, command.id);
  const row = commandDetails(command.id);
  broadcast('client.command_ack', row);
  return row;
});

app.post('/api/computers/:id/heartbeat', async (req, reply) => {
  const computer = db.prepare('SELECT * FROM computers WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!computer) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  const session = activeSessionForComputer(computer.id);
  const status = session ? 'in_use' : 'idle';
  const heartbeatAt = nowIso();
  db.prepare(`UPDATE computers SET status = ?, last_heartbeat_at = ?, client_version = COALESCE(?, client_version), active_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, heartbeatAt, req.body?.clientVersion ?? null, session?.id ?? null, computer.id);
  const pendingCommands = db.prepare(`
    SELECT cc.*, c.code as computer_code
    FROM client_commands cc
    JOIN computers c ON c.id = cc.computer_id
    WHERE cc.computer_id = ? AND cc.status = 'pending'
    ORDER BY cc.id
    LIMIT 10
  `).all(computer.id);
  if (pendingCommands.length) {
    const markSent = db.prepare(`UPDATE client_commands SET status = 'sent', sent_at = ? WHERE id = ?`);
    db.transaction((rows) => {
      for (const row of rows) markSent.run(heartbeatAt, row.id);
    })(pendingCommands);
  }
  const updated = db.prepare('SELECT * FROM computers WHERE id = ?').get(computer.id);
  broadcast('computer.heartbeat', updated);
  return { computer: updated, activeSession: session ? sessionDetails(session.id) : null, commands: pendingCommands };
});

app.get('/api/access-duration-packages', async () => db.prepare('SELECT * FROM access_duration_packages ORDER BY duration_minutes').all());
app.post('/api/access-duration-packages', async (req, reply) => {
  const missing = required(req.body, ['name', 'duration_minutes']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const duration = readPositiveMinutes(req.body.duration_minutes);
  if (duration <= 0) return reply.code(400).send({ error: 'duration_minutes harus lebih dari 0' });
  const result = db.prepare('INSERT INTO access_duration_packages (name, duration_minutes, is_active) VALUES (?, ?, ?)')
    .run(req.body.name, duration, req.body.is_active === false ? 0 : 1);
  return reply.code(201).send(db.prepare('SELECT * FROM access_duration_packages WHERE id = ?').get(result.lastInsertRowid));
});
app.patch('/api/access-duration-packages/:id', async (req, reply) => {
  const existing = db.prepare('SELECT * FROM access_duration_packages WHERE id = ?').get(req.params.id);
  if (!existing) return reply.code(404).send({ error: 'Paket durasi tidak ditemukan' });
  const duration = req.body.duration_minutes === undefined ? existing.duration_minutes : readPositiveMinutes(req.body.duration_minutes);
  if (duration <= 0) return reply.code(400).send({ error: 'duration_minutes harus lebih dari 0' });
  db.prepare(`UPDATE access_duration_packages SET name = COALESCE(?, name), duration_minutes = ?, is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(req.body.name ?? null, duration, req.body.is_active === undefined ? null : req.body.is_active ? 1 : 0, existing.id);
  return db.prepare('SELECT * FROM access_duration_packages WHERE id = ?').get(existing.id);
});
app.delete('/api/access-duration-packages/:id', async (req, reply) => {
  const existing = db.prepare('SELECT * FROM access_duration_packages WHERE id = ?').get(req.params.id);
  if (!existing) return reply.code(404).send({ error: 'Paket durasi tidak ditemukan' });
  db.prepare('DELETE FROM access_duration_packages WHERE id = ?').run(existing.id);
  return { ok: true, deleted: existing };
});

app.get('/api/users', async (req) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  return rows.map(publicUser);
});
app.post('/api/users', async (req, reply) => {
  const missing = required(req.body, ['username', 'password', 'user_type']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  if (!['member', 'one_time'].includes(req.body.user_type)) return reply.code(400).send({ error: 'user_type harus member atau one_time' });
  try {
    const result = db.prepare(`INSERT INTO users (username, password_hash, user_type, full_name, member_number, identity_number_optional, default_duration_minutes, created_by_operator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)      
      .run(req.body.username, hashPassword(req.body.password), req.body.user_type, req.body.full_name ?? null, req.body.member_number ?? null, req.body.identity_number_optional ?? null, req.body.default_duration_minutes ?? null, req.operator?.id ?? null);
    return reply.code(201).send(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)));
  } catch (error) {
    return reply.code(409).send({ error: 'Username sudah digunakan' });
  }
});
app.post('/api/users/validate-login', async (req, reply) => {
  const missing = required(req.body, ['username', 'password']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
  if (!user || !verifyPassword(req.body.password, user.password_hash)) return reply.code(401).send({ error: 'Username/password tidak valid' });
  if (!['active'].includes(user.status)) return reply.code(403).send({ error: `Akun tidak aktif: ${user.status}` });
  return { user: publicUser(user) };
});
app.post('/api/users/:id/disable', async (req, reply) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!user) return reply.code(404).send({ error: 'User tidak ditemukan' });
  if (activeSessionForUser(user.id)) return reply.code(409).send({ error: 'User masih punya session aktif' });
  db.prepare(`UPDATE users SET status = 'disabled', cancelled_at = COALESCE(cancelled_at, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(nowIso(), user.id);
  db.prepare('INSERT INTO usage_logs (user_id, operator_id, action, note) VALUES (?, ?, ?, ?)')
    .run(user.id, req.operator?.id ?? null, 'user_disabled', req.body?.note ?? null);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
});
app.post('/api/users/:id/reset-password', async (req, reply) => {
  const missing = required(req.body, ['password']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const user = db.prepare('SELECT * FROM users WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!user) return reply.code(404).send({ error: 'User tidak ditemukan' });
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hashPassword(req.body.password), user.id);
  db.prepare('INSERT INTO usage_logs (user_id, operator_id, action, note) VALUES (?, ?, ?, ?)')
    .run(user.id, req.operator?.id ?? null, 'user_password_reset', 'Password user direset operator');
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
});

app.get('/api/sessions', async () => db.prepare(`SELECT s.*, u.username, c.code as computer_code FROM sessions s JOIN users u ON u.id = s.user_id JOIN computers c ON c.id = s.computer_id ORDER BY s.id DESC`).all());
app.get('/api/sessions/active', async () => db.prepare(`SELECT s.*, u.username, c.code as computer_code FROM sessions s JOIN users u ON u.id = s.user_id JOIN computers c ON c.id = s.computer_id WHERE s.status = 'active' ORDER BY s.id DESC`).all());
app.post('/api/sessions/start', async (req, reply) => {
  const missing = required(req.body, ['username', 'computer_code']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
  const operatorStart = Boolean(req.operator);
  if (!user || (!operatorStart && !verifyPassword(req.body.password, user.password_hash))) return reply.code(401).send({ error: 'Username/password tidak valid' });
  if (user.status !== 'active') return reply.code(403).send({ error: `Akun tidak aktif: ${user.status}` });
  if (activeSessionForUser(user.id)) return reply.code(409).send({ error: 'User masih punya session aktif' });
  const computer = db.prepare('SELECT * FROM computers WHERE code = ?').get(req.body.computer_code);
  if (!computer) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  if (activeSessionForComputer(computer.id)) return reply.code(409).send({ error: 'Komputer masih punya session aktif' });
  const availableMinutes = readPositiveMinutes(user.default_duration_minutes);
  if (availableMinutes <= 0) return reply.code(403).send({ error: 'Waktu akun sudah habis. Silakan isi ulang dari operator.' });
  const requestedDuration = req.body.duration_minutes === undefined ? availableMinutes : readPositiveMinutes(req.body.duration_minutes);
  if (requestedDuration <= 0) return reply.code(400).send({ error: 'Durasi session harus lebih dari 0 menit' });
  if (requestedDuration > availableMinutes) return reply.code(400).send({ error: `Durasi melebihi saldo waktu. Saldo tersedia ${availableMinutes} menit` });
  const duration = requestedDuration;
  const start = new Date();
  const end = addMinutes(start, duration);
  const result = db.prepare(`INSERT INTO sessions (user_id, computer_id, operator_id, start_time, end_time, duration_minutes, usage_note) VALUES (?, ?, ?, ?, ?, ?, ?)`)    
    .run(user.id, computer.id, req.operator?.id ?? user.created_by_operator_id ?? null, start.toISOString(), end, duration, req.body.usage_note ?? null);
  const session = sessionDetails(result.lastInsertRowid);
  db.prepare('UPDATE computers SET status = ?, active_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('in_use', session.id, computer.id);
  db.prepare(`UPDATE users SET status = 'in_use', default_duration_minutes = default_duration_minutes - ?, activated_at = COALESCE(activated_at, ?), last_used_computer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(duration, start.toISOString(), computer.id, user.id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, user.id, computer.id, req.operator?.id ?? null, 'session_started', null);
  broadcast('session.started', session);
  return reply.code(201).send(session);
});
app.post('/api/sessions/:id/extend', async (req, reply) => {
  const minutes = readPositiveMinutes(req.body?.minutes);
  if (minutes <= 0) return reply.code(400).send({ error: 'minutes harus lebih dari 0' });
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return reply.code(404).send({ error: 'Session tidak ditemukan' });
  if (session.status !== 'active') return reply.code(409).send({ error: 'Session tidak aktif' });
  return extendActiveSession(session, minutes, req.operator?.id ?? null, req.body?.note ?? null);
});

app.post('/api/users/:username/topup', async (req, reply) => {
  const minutes = readPositiveMinutes(req.body?.minutes);
  if (minutes <= 0) return reply.code(400).send({ error: 'minutes harus lebih dari 0' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return reply.code(404).send({ error: 'User tidak ditemukan' });

  const activeSession = activeSessionForUser(user.id);
  if (!activeSession && user.user_type === 'one_time' && ['used', 'expired', 'cancelled'].includes(user.status)) {
    return reply.code(409).send({ error: 'Akun one-time yang sudah selesai tidak bisa diisi ulang. Buat akun one-time baru.' });
  }
  if (activeSession) {
    const session = extendActiveSession(activeSession, minutes, req.operator?.id ?? null, req.body?.note ?? `Top up ${minutes} minutes for ${user.username}`);
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return { mode: 'session_extended', minutes_added: minutes, user: publicUser(updatedUser), session };
  }

  db.prepare(`UPDATE users SET default_duration_minutes = ?, status = 'active', expired_at = NULL, cancelled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(minutes, user.id);
  db.prepare('INSERT INTO usage_logs (user_id, operator_id, action, note) VALUES (?, ?, ?, ?)')
    .run(user.id, req.operator?.id ?? null, 'user_topup', req.body?.note ?? `Refilled account with ${minutes} minutes`);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  broadcast('user.topped_up', publicUser(updatedUser));
  return { mode: 'user_refilled', minutes_added: minutes, user: publicUser(updatedUser) };
});

app.post('/api/sessions/:id/expire', async (req, reply) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return reply.code(404).send({ error: 'Session tidak ditemukan' });
  if (session.status !== 'active') return reply.code(409).send({ error: 'Session tidak aktif' });
  const expiredAt = nowIso();
  const user = db.prepare('SELECT user_type, default_duration_minutes FROM users WHERE id = ?').get(session.user_id);
  const balanceStatus = Number(user?.default_duration_minutes ?? 0) > 0 ? 'active' : 'expired';
  const nextUserStatus = nextStatusAfterSession(user, balanceStatus);
  db.prepare('UPDATE sessions SET status = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', expiredAt, req.params.id);
  db.prepare('UPDATE computers SET status = ?, active_session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.computer_id);
  db.prepare(`UPDATE users SET status = ?, expired_at = CASE WHEN ? = 'expired' THEN COALESCE(expired_at, ?) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(nextUserStatus, nextUserStatus, expiredAt, session.user_id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, session.user_id, session.computer_id, req.operator?.id ?? null, 'session_expired_manual', req.body?.note ?? null);
  const updated = sessionDetails(req.params.id);
  broadcast('session.expired', { ...updated, expire_action: 'shutdown' });
  return updated;
});

app.post('/api/sessions/:id/stop', async (req, reply) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return reply.code(404).send({ error: 'Session tidak ditemukan' });
  if (session.status !== 'active') return reply.code(409).send({ error: 'Session tidak aktif' });

  const stopStatus = req.body?.status ?? 'completed';
  const stoppedAt = new Date();
  const stoppedAtIso = stoppedAt.toISOString();
  const user = db.prepare('SELECT user_type FROM users WHERE id = ?').get(session.user_id);
  const shouldRefund = user?.user_type !== 'one_time' && stopStatus !== 'expired' && req.body?.consume_remaining !== true;
  const refundedMinutes = shouldRefund ? remainingWholeMinutes(session.end_time, stoppedAt) : 0;
  const balanceStatus = stopStatus === 'expired' ? 'expired' : refundedMinutes > 0 ? 'active' : 'used';
  const nextUserStatus = nextStatusAfterSession(user, balanceStatus);
  const noteParts = [req.body?.note].filter(Boolean);
  if (refundedMinutes > 0) noteParts.push(`Refunded ${refundedMinutes} remaining minutes to user balance`);

  db.prepare('UPDATE sessions SET status = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stopStatus, stoppedAtIso, req.params.id);
  db.prepare('UPDATE computers SET status = ?, active_session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('idle', session.computer_id);
  db.prepare(`
    UPDATE users
    SET status = ?,
        default_duration_minutes = default_duration_minutes + ?,
        expired_at = CASE WHEN ? = 'expired' THEN COALESCE(expired_at, ?) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextUserStatus, refundedMinutes, stopStatus, stoppedAtIso, session.user_id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(session.id, session.user_id, session.computer_id, req.operator?.id ?? null, 'session_stopped', noteParts.join('; ') || null);
  const updated = { ...sessionDetails(req.params.id), refunded_minutes: refundedMinutes };
  broadcast('session.stopped', updated);
  return updated;
});

app.get('/api/reports/daily', async (req) => {
  const date = req.query.date ?? new Date().toISOString().slice(0, 10);
  const sessions = db.prepare(`SELECT s.*, u.username, u.full_name, c.code as computer_code FROM sessions s JOIN users u ON u.id = s.user_id JOIN computers c ON c.id = s.computer_id WHERE substr(s.start_time, 1, 10) = ? ORDER BY s.start_time DESC`).all(date);
  return { date, total_sessions: sessions.length, total_duration_minutes: sessions.reduce((sum, s) => sum + s.duration_minutes + s.extended_minutes, 0), sessions };
});
app.get('/api/reports/usage-logs', async () => db.prepare(`
  SELECT l.*, u.username, c.code as computer_code, o.username as operator_username
  FROM usage_logs l
  LEFT JOIN users u ON u.id = l.user_id
  LEFT JOIN computers c ON c.id = l.computer_id
  LEFT JOIN operators o ON o.id = l.operator_id
  ORDER BY l.id DESC
  LIMIT 500
`).all());

const port = Number(process.env.PORT ?? db.prepare("SELECT value FROM settings WHERE key = 'server_port'").get()?.value ?? 3478);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
