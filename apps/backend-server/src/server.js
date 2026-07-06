import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { db, migrate, nowIso, addMinutes, publicUser } from './db.js';
import { broadcast, registerRealtime } from './realtime.js';

migrate();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);
registerRealtime(app);

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
    const user = db.prepare('SELECT default_duration_minutes FROM users WHERE id = ?').get(session.user_id);
    const nextUserStatus = Number(user?.default_duration_minutes ?? 0) > 0 ? 'active' : 'expired';
    db.prepare('UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.id);
    db.prepare('UPDATE computers SET status = ?, active_session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.computer_id);
    db.prepare(`UPDATE users SET status = ?, expired_at = CASE WHEN ? = 'expired' THEN COALESCE(expired_at, ?) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(nextUserStatus, nextUserStatus, expiredAt, session.user_id);
    db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(session.id, session.user_id, session.computer_id, session.operator_id ?? null, 'session_expired', 'Duration ended; client should shutdown');
    broadcast('session.expired', { ...sessionDetails(session.id), status: 'expired', expire_action: 'shutdown' });
  }
}

setInterval(expireDueSessions, 1000);

app.get('/health', async () => ({ ok: true, service: 'perpus-billing-backend', at: nowIso() }));

app.post('/api/auth/login', async (req, reply) => {
  const missing = required(req.body, ['username', 'password']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const operator = db.prepare('SELECT * FROM operators WHERE username = ? AND is_active = 1').get(req.body.username);
  if (!operator || operator.password_hash !== req.body.password) return reply.code(401).send({ error: 'Username/password operator tidak valid' });
  const { password_hash, ...safe } = operator;
  return { operator: safe };
});

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

app.post('/api/computers/:id/heartbeat', async (req, reply) => {
  const computer = db.prepare('SELECT * FROM computers WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
  if (!computer) return reply.code(404).send({ error: 'Komputer tidak ditemukan' });
  const session = activeSessionForComputer(computer.id);
  const status = session ? 'in_use' : 'idle';
  db.prepare(`UPDATE computers SET status = ?, last_heartbeat_at = ?, client_version = COALESCE(?, client_version), active_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, nowIso(), req.body?.clientVersion ?? null, session?.id ?? null, computer.id);
  const updated = db.prepare('SELECT * FROM computers WHERE id = ?').get(computer.id);
  broadcast('computer.heartbeat', updated);
  return { computer: updated, activeSession: session ? sessionDetails(session.id) : null };
});

app.get('/api/access-duration-packages', async () => db.prepare('SELECT * FROM access_duration_packages ORDER BY duration_minutes').all());
app.post('/api/access-duration-packages', async (req, reply) => {
  const missing = required(req.body, ['name', 'duration_minutes']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const result = db.prepare('INSERT INTO access_duration_packages (name, duration_minutes, is_active) VALUES (?, ?, ?)')
    .run(req.body.name, Number(req.body.duration_minutes), req.body.is_active === false ? 0 : 1);
  return reply.code(201).send(db.prepare('SELECT * FROM access_duration_packages WHERE id = ?').get(result.lastInsertRowid));
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
      .run(req.body.username, req.body.password, req.body.user_type, req.body.full_name ?? null, req.body.member_number ?? null, req.body.identity_number_optional ?? null, req.body.default_duration_minutes ?? null, req.body.created_by_operator_id ?? null);
    return reply.code(201).send(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)));
  } catch (error) {
    return reply.code(409).send({ error: 'Username sudah digunakan' });
  }
});
app.post('/api/users/validate-login', async (req, reply) => {
  const missing = required(req.body, ['username', 'password']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
  if (!user || user.password_hash !== req.body.password) return reply.code(401).send({ error: 'Username/password tidak valid' });
  if (!['active'].includes(user.status)) return reply.code(403).send({ error: `Akun tidak aktif: ${user.status}` });
  return { user: publicUser(user) };
});

app.get('/api/sessions', async () => db.prepare(`SELECT s.*, u.username, c.code as computer_code FROM sessions s JOIN users u ON u.id = s.user_id JOIN computers c ON c.id = s.computer_id ORDER BY s.id DESC`).all());
app.get('/api/sessions/active', async () => db.prepare(`SELECT s.*, u.username, c.code as computer_code FROM sessions s JOIN users u ON u.id = s.user_id JOIN computers c ON c.id = s.computer_id WHERE s.status = 'active' ORDER BY s.id DESC`).all());
app.post('/api/sessions/start', async (req, reply) => {
  const missing = required(req.body, ['username', 'computer_code']);
  if (missing) return reply.code(400).send({ error: `${missing} wajib diisi` });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
  const operatorStart = Boolean(req.body.operator_id);
  if (!user || (!operatorStart && user.password_hash !== req.body.password)) return reply.code(401).send({ error: 'Username/password tidak valid' });
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
    .run(user.id, computer.id, req.body.operator_id ?? user.created_by_operator_id ?? null, start.toISOString(), end, duration, req.body.usage_note ?? null);
  const session = sessionDetails(result.lastInsertRowid);
  db.prepare('UPDATE computers SET status = ?, active_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('in_use', session.id, computer.id);
  db.prepare(`UPDATE users SET status = 'in_use', default_duration_minutes = default_duration_minutes - ?, activated_at = COALESCE(activated_at, ?), last_used_computer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(duration, start.toISOString(), computer.id, user.id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, user.id, computer.id, req.body.operator_id ?? null, 'session_started', null);
  broadcast('session.started', session);
  return reply.code(201).send(session);
});
app.post('/api/sessions/:id/extend', async (req, reply) => {
  const minutes = readPositiveMinutes(req.body?.minutes);
  if (minutes <= 0) return reply.code(400).send({ error: 'minutes harus lebih dari 0' });
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return reply.code(404).send({ error: 'Session tidak ditemukan' });
  if (session.status !== 'active') return reply.code(409).send({ error: 'Session tidak aktif' });
  return extendActiveSession(session, minutes, req.body?.operator_id ?? null, req.body?.note ?? null);
});

app.post('/api/users/:username/topup', async (req, reply) => {
  const minutes = readPositiveMinutes(req.body?.minutes);
  if (minutes <= 0) return reply.code(400).send({ error: 'minutes harus lebih dari 0' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return reply.code(404).send({ error: 'User tidak ditemukan' });

  const activeSession = activeSessionForUser(user.id);
  if (activeSession) {
    const session = extendActiveSession(activeSession, minutes, req.body?.operator_id ?? null, req.body?.note ?? `Top up ${minutes} minutes for ${user.username}`);
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return { mode: 'session_extended', minutes_added: minutes, user: publicUser(updatedUser), session };
  }

  db.prepare(`UPDATE users SET default_duration_minutes = ?, status = 'active', expired_at = NULL, cancelled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(minutes, user.id);
  db.prepare('INSERT INTO usage_logs (user_id, operator_id, action, note) VALUES (?, ?, ?, ?)')
    .run(user.id, req.body?.operator_id ?? null, 'user_topup', req.body?.note ?? `Refilled account with ${minutes} minutes`);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  broadcast('user.topped_up', publicUser(updatedUser));
  return { mode: 'user_refilled', minutes_added: minutes, user: publicUser(updatedUser) };
});

app.post('/api/sessions/:id/expire', async (req, reply) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return reply.code(404).send({ error: 'Session tidak ditemukan' });
  if (session.status !== 'active') return reply.code(409).send({ error: 'Session tidak aktif' });
  const expiredAt = nowIso();
  const user = db.prepare('SELECT default_duration_minutes FROM users WHERE id = ?').get(session.user_id);
  const nextUserStatus = Number(user?.default_duration_minutes ?? 0) > 0 ? 'active' : 'expired';
  db.prepare('UPDATE sessions SET status = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', expiredAt, req.params.id);
  db.prepare('UPDATE computers SET status = ?, active_session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('expired', session.computer_id);
  db.prepare(`UPDATE users SET status = ?, expired_at = CASE WHEN ? = 'expired' THEN COALESCE(expired_at, ?) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(nextUserStatus, nextUserStatus, expiredAt, session.user_id);
  db.prepare('INSERT INTO usage_logs (session_id, user_id, computer_id, operator_id, action, note) VALUES (?, ?, ?, ?, ?, ?)').run(session.id, session.user_id, session.computer_id, req.body?.operator_id ?? null, 'session_expired_manual', req.body?.note ?? null);
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
  const shouldRefund = stopStatus !== 'expired' && req.body?.consume_remaining !== true;
  const refundedMinutes = shouldRefund ? remainingWholeMinutes(session.end_time, stoppedAt) : 0;
  const nextUserStatus = stopStatus === 'expired' ? 'expired' : refundedMinutes > 0 ? 'active' : 'used';
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
    .run(session.id, session.user_id, session.computer_id, req.body?.operator_id ?? null, 'session_stopped', noteParts.join('; ') || null);
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
