import { requestJson } from '../http';

export const api = {
  get: <T>(url: string) => requestJson<T>(url),
  post: <T>(url: string, json?: unknown) => requestJson<T>(url, { method: 'POST', json: json ?? {} }),
  put: <T>(url: string, json?: unknown) => requestJson<T>(url, { method: 'PUT', json: json ?? {} }),
  del: <T>(url: string) => requestJson<T>(url, { method: 'DELETE' }),
  async upload<T>(url: string, file: File, fields: Record<string, string> = {}): Promise<T> {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { message?: string }).message || `HTTP ${res.status}`);
    return data as T;
  },
  /** Trigger a browser download of a GET endpoint. */
  download(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};
