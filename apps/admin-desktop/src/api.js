export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3478';

let authToken = localStorage.getItem('perpus_operator_token') ?? '';

export function setAuthToken(token) {
  authToken = token ?? '';
  if (authToken) localStorage.setItem('perpus_operator_token', authToken);
  else localStorage.removeItem('perpus_operator_token');
}

export function getAuthToken() {
  return authToken;
}

export async function api(path, options = {}) {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers ?? {})
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request gagal: ${res.status}`);
  return data;
}

export const getJson = (path) => api(path);
export const postJson = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteJson = (path) => api(path, { method: 'DELETE' });
