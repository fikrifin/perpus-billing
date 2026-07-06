import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 3488;
const tempDir = mkdtempSync(join(tmpdir(), 'perpus-billing-smoke-'));
const dbPath = join(tempDir, 'smoke.db');
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PERPUS_DB_PATH: dbPath },
  stdio: ['ignore', 'pipe', 'pipe']
});

const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json', ...(options.headers ?? {}) } : options.headers;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function requestExpectError(path, status, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json', ...(options.headers ?? {}) } : options.headers;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const body = await res.json();
  if (res.status !== status) throw new Error(`${path} expected ${status}, got ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

try {
  await wait(800);
  await request('/health');
  await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  const computer = await request('/api/computers', { method: 'POST', body: JSON.stringify({ code: `PC-SMOKE-${Date.now()}`, name: 'PC Smoke Test' }) });
  const command = await request(`/api/computers/${computer.code}/command`, { method: 'POST', body: JSON.stringify({ command: 'lock', note: 'Smoke command' }) });
  let commandHeartbeat = await request(`/api/computers/${computer.code}/heartbeat`, { method: 'POST', body: JSON.stringify({ clientVersion: 'smoke' }) });
  if (commandHeartbeat.commands?.[0]?.id !== command.id) throw new Error('Heartbeat did not deliver pending command');
  const ack = await request(`/api/client-commands/${command.id}/ack`, { method: 'POST', body: JSON.stringify({ status: 'acknowledged' }) });
  if (ack.status !== 'acknowledged') throw new Error('Command ack failed');
  const pkg = await request('/api/access-duration-packages', { method: 'POST', body: JSON.stringify({ name: 'Smoke Package', duration_minutes: 45 }) });
  const updatedPkg = await request(`/api/access-duration-packages/${pkg.id}`, { method: 'PATCH', body: JSON.stringify({ duration_minutes: 50 }) });
  if (updatedPkg.duration_minutes !== 50) throw new Error('Package update failed');
  await request(`/api/access-duration-packages/${pkg.id}`, { method: 'DELETE' });
  const username = `smoke${Date.now()}`;
  await request('/api/users', { method: 'POST', body: JSON.stringify({ username, password: '123456', user_type: 'member', default_duration_minutes: 30 }) });
  const topup = await request(`/api/users/${username}/topup`, { method: 'POST', body: JSON.stringify({ minutes: 15 }) });
  if (topup.mode !== 'user_refilled' || topup.user.default_duration_minutes !== 15) throw new Error('Inactive user top-up failed');
  const session = await request('/api/sessions/start', { method: 'POST', body: JSON.stringify({ username, password: '123456', computer_code: computer.code, duration_minutes: 5 }) });
  if (session.duration_minutes !== 5) throw new Error('Custom session duration was ignored');
  if (session.username !== username || session.computer_code !== computer.code) throw new Error('Session payload missing realtime identity fields');
  const heartbeat = await request(`/api/computers/${computer.code}/heartbeat`, { method: 'POST', body: JSON.stringify({ clientVersion: 'smoke' }) });
  if (heartbeat.activeSession?.id !== session.id || heartbeat.activeSession?.computer_code !== computer.code) throw new Error('Heartbeat did not return active session details');
  const extended = await request(`/api/users/${username}/topup`, { method: 'POST', body: JSON.stringify({ minutes: 10 }) });
  if (extended.mode !== 'session_extended' || extended.session.extended_minutes !== 10) throw new Error('Active session top-up failed');
  const stopped = await request(`/api/sessions/${session.id}/stop`, { method: 'POST', body: JSON.stringify({ note: 'Smoke stop' }) });
  if (stopped.refunded_minutes <= 0) throw new Error('Stop before expiry did not refund remaining minutes');
  let users = await request('/api/users');
  let stoppedUser = users.find((user) => user.username === username);
  const expectedBalanceAfterStop = 10 + stopped.refunded_minutes;
  if (stoppedUser.status !== 'active' || stoppedUser.default_duration_minutes !== expectedBalanceAfterStop) throw new Error('Refunded user balance/status was not restored');
  const secondSession = await request('/api/sessions/start', { method: 'POST', body: JSON.stringify({ username, password: '123456', computer_code: computer.code, duration_minutes: 5 }) });
  await request(`/api/sessions/${secondSession.id}/expire`, { method: 'POST', body: JSON.stringify({ note: 'Smoke expire partial reserved balance' }) });
  users = await request('/api/users');
  stoppedUser = users.find((user) => user.username === username);
  const remainingBalance = expectedBalanceAfterStop - 5;
  if (stoppedUser.status !== 'active' || stoppedUser.default_duration_minutes !== remainingBalance) throw new Error('Expired partial session should keep unreserved balance active');
  const finalSession = await request('/api/sessions/start', { method: 'POST', body: JSON.stringify({ username, password: '123456', computer_code: computer.code, duration_minutes: remainingBalance }) });
  await request(`/api/sessions/${finalSession.id}/expire`, { method: 'POST', body: JSON.stringify({ note: 'Smoke expire all remaining balance' }) });
  await requestExpectError('/api/sessions/start', 403, { method: 'POST', body: JSON.stringify({ username, password: '123456', computer_code: computer.code }) });
  const resetUser = `reset${Date.now()}`;
  await request('/api/users', { method: 'POST', body: JSON.stringify({ username: resetUser, password: 'oldpass', user_type: 'member', default_duration_minutes: 10 }) });
  await request(`/api/users/${resetUser}/reset-password`, { method: 'POST', body: JSON.stringify({ password: 'newpass' }) });
  await request('/api/users/validate-login', { method: 'POST', body: JSON.stringify({ username: resetUser, password: 'newpass' }) });
  await request(`/api/users/${resetUser}/disable`, { method: 'POST', body: JSON.stringify({ note: 'Smoke disable' }) });
  await requestExpectError('/api/users/validate-login', 403, { method: 'POST', body: JSON.stringify({ username: resetUser, password: 'newpass' }) });
  const guestUser = `guest${Date.now()}`;
  await request('/api/users', { method: 'POST', body: JSON.stringify({ username: guestUser, password: '123456', user_type: 'one_time', default_duration_minutes: 5 }) });
  const guestSession = await request('/api/sessions/start', { method: 'POST', body: JSON.stringify({ username: guestUser, password: '123456', computer_code: computer.code, duration_minutes: 5 }) });
  await request(`/api/sessions/${guestSession.id}/stop`, { method: 'POST', body: JSON.stringify({ note: 'Smoke one-time stop' }) });
  await requestExpectError(`/api/users/${guestUser}/topup`, 409, { method: 'POST', body: JSON.stringify({ minutes: 5 }) });
  await request('/api/sessions/active');
  await request('/api/reports/daily');
  console.log('SMOKE_OK');
} finally {
  server.kill('SIGTERM');
  rmSync(tempDir, { recursive: true, force: true });
}
