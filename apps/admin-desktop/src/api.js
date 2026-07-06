export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3478';

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request gagal: ${res.status}`);
  return data;
}

export const getJson = (path) => api(path);
export const postJson = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
