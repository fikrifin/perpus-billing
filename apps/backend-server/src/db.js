import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const dbPath = process.env.PERPUS_DB_PATH ? resolve(process.env.PERPUS_DB_PATH) : resolve(process.cwd(), 'data/perpus-billing.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS computers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      ip_address TEXT,
      mac_address TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      active_session_id INTEGER,
      last_heartbeat_at TEXT,
      client_version TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS access_duration_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      user_type TEXT NOT NULL CHECK(user_type IN ('member', 'one_time')),
      full_name TEXT,
      member_number TEXT,
      identity_number_optional TEXT,
      default_duration_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_operator_id INTEGER,
      last_used_computer_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      activated_at TEXT,
      expired_at TEXT,
      cancelled_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by_operator_id) REFERENCES operators(id),
      FOREIGN KEY(last_used_computer_id) REFERENCES computers(id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      computer_id INTEGER NOT NULL,
      operator_id INTEGER,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      extended_minutes INTEGER NOT NULL DEFAULT 0,
      usage_note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(computer_id) REFERENCES computers(id),
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    );
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      user_id INTEGER,
      computer_id INTEGER,
      operator_id INTEGER,
      action TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(computer_id) REFERENCES computers(id),
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    );
    CREATE TABLE IF NOT EXISTS client_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      computer_id INTEGER NOT NULL,
      operator_id INTEGER,
      command TEXT NOT NULL CHECK(command IN ('lock', 'shutdown', 'restart')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'acknowledged', 'failed', 'cancelled')),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      acknowledged_at TEXT,
      FOREIGN KEY(computer_id) REFERENCES computers(id),
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS operator_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    );
  `);
  seed();
}

function seed() {
  if (db.prepare('SELECT COUNT(*) as total FROM operators').get().total === 0) {
    db.prepare('INSERT INTO operators (name, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('Administrator', 'admin', hashPassword('admin'), 'admin');
  }
  if (db.prepare('SELECT COUNT(*) as total FROM access_duration_packages').get().total === 0) {
    const insert = db.prepare('INSERT INTO access_duration_packages (name, duration_minutes) VALUES (?, ?)');
    insert.run('30 Menit', 30);
    insert.run('1 Jam', 60);
    insert.run('2 Jam', 120);
  }
  const upsertComputer = db.prepare('INSERT OR IGNORE INTO computers (code, name, ip_address) VALUES (?, ?, ?)');
  const demoComputers = [
    ['PC-01', 'Komputer Client 01', '192.168.1.11'],
    ['PC-02', 'Komputer Client 02', '192.168.1.12'],
    ['PC-03', 'Komputer Client 03', '192.168.1.13'],
    ['PC-04', 'Komputer Client 04', '192.168.1.14'],
    ['PC-05', 'Komputer Client 05', '192.168.1.15']
  ];
  for (const computer of demoComputers) upsertComputer.run(...computer);

  const upsertUser = db.prepare(`INSERT OR IGNORE INTO users (username, password_hash, user_type, full_name, member_number, default_duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`);
  const demoUsers = [
    ['user001', hashPassword('123456'), 'member', 'Demo User 001', 'A001', 60],
    ['user002', hashPassword('123456'), 'member', 'Demo User 002', 'A002', 90],
    ['user003', hashPassword('123456'), 'member', 'Demo User 003', 'A003', 120],
    ['guest001', hashPassword('123456'), 'one_time', 'Demo Guest 001', null, 30],
    ['guest002', hashPassword('123456'), 'one_time', 'Demo Guest 002', null, 60]
  ];
  for (const user of demoUsers) upsertUser.run(...user);
  const defaults = [
    ['business_name', 'Perpustakaan Daerah'],
    ['server_port', '3478'],
    ['default_expire_action', 'shutdown'],
    ['shutdown_warning_seconds', '60'],
    ['heartbeat_interval_seconds', '5'],
    ['client_offline_threshold_seconds', '30']
  ];
  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const row of defaults) upsert.run(...row);
}

export function nowIso() { return new Date().toISOString(); }
export function addMinutes(date, minutes) { return new Date(date.getTime() + minutes * 60_000).toISOString(); }
export function hashPassword(password) {
  const iterations = 120_000;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}
export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('pbkdf2:')) {
    const [, iterationsText, salt, expectedHash] = storedHash.split(':');
    const iterations = Number(iterationsText);
    if (!Number.isFinite(iterations) || !salt || !expectedHash) return false;
    const actualHash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  }
  if (storedHash.startsWith('sha256:')) {
    const legacyHash = `sha256:${crypto.createHash('sha256').update(String(password)).digest('hex')}`;
    return legacyHash === storedHash;
  }
  return String(password) === storedHash;
}
export async function backupDatabase(destinationPath) {
  mkdirSync(dirname(destinationPath), { recursive: true });
  await db.backup(destinationPath);
  return destinationPath;
}
export function publicUser(row) {
  if (!row) return row;
  const { password_hash, ...safe } = row;
  return safe;
}
