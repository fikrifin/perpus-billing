const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3478';

export const COMPUTER_CODE = import.meta.env.VITE_COMPUTER_CODE ?? localStorage.getItem('computer_code') ?? 'PC-01';

export function getApiBase() {
  return localStorage.getItem('server_url') ?? DEFAULT_API_BASE;
}

export function setApiBase(value) {
  localStorage.setItem('server_url', value.replace(/\/$/, ''));
}

export async function api(path, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json', ...(options.headers ?? {}) } : options.headers;
  const res = await fetch(`${getApiBase()}${path}`, {
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
